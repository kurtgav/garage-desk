"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStaff } from "@/lib/auth";
import {
  customerErrorMessage,
  GENERIC_ERROR,
  INVALID_LINK,
  QUOTE_CHANGED,
  STAFF_ON_CUSTOMER_LINK,
  TOO_MANY_ATTEMPTS,
} from "@/lib/data/errors";
import type { ActionResult } from "@/lib/data/types";
import { isRateLimited } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLinkToken } from "@/lib/tokens";

// Customer approve/decline (FR6, D-009). No login: the token is the credential, so only the
// service role may act, after rate limiting and hashing. Never log or echo the token.

/** 32 bytes base64url = 43 chars (D-013). Anything else cannot be a real link. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const reasonSchema = z
  .string("Enter the reason as text.")
  .trim()
  .max(500, "Keep the reason to 500 characters or fewer.")
  .optional();

/** The quote version the page showed (hidden input). The DB acts only if it is still current (D-049). */
const versionSchema = z.string().regex(/^[1-9]\d{0,8}$/).transform(Number);

async function customerTransition(
  formData: FormData,
  to: "approved" | "declined",
  note: string | null,
): Promise<ActionResult> {
  // Staff must not decide as the customer (D-067); the owner records phone approvals instead.
  if (await getStaff()) return { ok: false, error: STAFF_ON_CUSTOMER_LINK };
  const version = versionSchema.safeParse(formData.get("expected_version"));
  if (!version.success) return { ok: false, error: QUOTE_CHANGED };
  if (await isRateLimited("publicAction")) return { ok: false, error: TOO_MANY_ATTEMPTS };
  const token = formData.get("token");
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, error: INVALID_LINK };

  const hash = hashLinkToken(token);
  const admin = createAdminClient();
  const { data: link, error: linkError } = await admin
    .from("job_links")
    .select("job_id")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) return { ok: false, error: GENERIC_ERROR };
  if (!link) return { ok: false, error: INVALID_LINK };

  // transition_job re-checks the hash, the link and the version in the same transaction; replays are no-ops.
  const { error } = await admin.rpc("transition_job", {
    p_job_id: link.job_id,
    p_to_status: to,
    p_link_token_hash: hash,
    p_expected_version: version.data,
    ...(note ? { p_note: note } : {}),
  });
  if (error) return { ok: false, error: customerErrorMessage(error) };

  revalidatePath(`/${token}`);
  return { ok: true };
}

export async function approveQuote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return customerTransition(formData, "approved", null);
}

export async function declineQuote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reason = reasonSchema.safeParse(formData.get("reason") ?? undefined);
  if (!reason.success) return { ok: false, error: reason.error.issues[0]?.message ?? GENERIC_ERROR };
  return customerTransition(formData, "declined", reason.data || null);
}
