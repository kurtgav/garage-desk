"use server";

import { after } from "next/server";
import { z } from "zod";
import type { ActionResult } from "@/lib/data/types";
import { fail } from "@/lib/form";
import { passwordResetEmailEnabled, RESET_EMAIL_OFF } from "@/lib/password";
import { isRateLimited } from "@/lib/rate-limit";
import { createStatelessClient } from "@/lib/supabase/server";

const emailSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.email("Enter a valid email address.").max(254, "Enter a valid email address."),
);

/**
 * Sends the recovery email (template: /auth/confirm?token_hash=…&type=recovery). Always the same neutral
 * answer after validation, so the form never reveals whether an account exists (PLAN Phase 5, D-079).
 */
export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!passwordResetEmailEnabled()) return fail(RESET_EMAIL_OFF); // same for every address, nothing sent
  if (await isRateLimited("passwordReset")) return fail("Too many requests. Please wait a few minutes and try again.");
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return fail("Enter a valid email address.");

  // After the response: answering takes the same time whether or not the account exists (an email is sent
  // only for a real one). Errors (unknown address, Auth's own email limits) are deliberately not shown.
  after(() => createStatelessClient().auth.resetPasswordForEmail(email.data));
  return { ok: true };
}
