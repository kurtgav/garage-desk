import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLinkToken } from "@/lib/tokens";
import type { JobStatus } from "@/lib/status";

/**
 * Whitelisted DTO for the customer link (PRD FR6). Built by the DB function
 * public_job_by_token_hash and re-picked here so nothing else can leak.
 * Never shown: customer phone/email, other vehicles/jobs, staff names, notes, internal IDs.
 */
export interface PublicJob {
  garage: { name: string; address: string; phone: string };
  /** quote_version: the version shown; Approve/Decline send it back as expected_version (D-049). */
  job: { ref: string; status: JobStatus; quote_version: number | null };
  vehicle: { make: string; model: string; plate: string };
  customer: { first_name: string };
  /** The current quote version's snapshot. line_total_cents is exact (may be fractional, D-048). */
  lines: { description: string; quantity: string; unit_price_cents: number; line_total_cents: number }[];
  /** Net (subtotal), VAT and total of the current quote version; null before the first quote. */
  totals: { subtotal_cents: number; vat_cents: number; total_cents: number; vat_bps: number } | null;
  /** channel: "phone" = approval recorded by the garage, "link" = the customer's own decision. */
  timeline: { status: JobStatus; at: string; channel: "link" | "phone" | null }[];
}

export const PUBLIC_JOB_KEYS = {
  root: ["garage", "job", "vehicle", "customer", "lines", "totals", "timeline"],
  garage: ["name", "address", "phone"],
  job: ["ref", "status", "quote_version"],
  vehicle: ["make", "model", "plate"],
  customer: ["first_name"],
  line: ["description", "quantity", "unit_price_cents", "line_total_cents"],
  totals: ["subtotal_cents", "vat_cents", "total_cents", "vat_bps"],
  timeline: ["status", "at", "channel"],
} as const;

type Obj = Record<string, unknown>;
function pick(src: unknown, keys: readonly string[]): Obj {
  const o = (src ?? {}) as Obj;
  return Object.fromEntries(keys.map((k) => [k, o[k]]));
}

/** Re-picks exactly the whitelisted keys from the DB JSON (defence in depth). */
export function toPublicJob(raw: unknown): PublicJob {
  const r = (raw ?? {}) as Obj;
  return {
    garage: pick(r.garage, PUBLIC_JOB_KEYS.garage),
    job: pick(r.job, PUBLIC_JOB_KEYS.job),
    vehicle: pick(r.vehicle, PUBLIC_JOB_KEYS.vehicle),
    customer: pick(r.customer, PUBLIC_JOB_KEYS.customer),
    lines: Array.isArray(r.lines) ? r.lines.map((l) => pick(l, PUBLIC_JOB_KEYS.line)) : [],
    totals: r.totals ? pick(r.totals, PUBLIC_JOB_KEYS.totals) : null,
    timeline: Array.isArray(r.timeline) ? r.timeline.map((t) => pick(t, PUBLIC_JOB_KEYS.timeline)) : [],
  } as unknown as PublicJob;
}

// Link-preview and crawler fetchers (iMessage previews send "facebookexternalhit … Twitterbot").
const PREVIEW_BOT =
  /whatsapp|facebookexternalhit|facebot|viber|telegrambot|slackbot|twitterbot|discordbot|linkedinbot|skypeuripreview|imessage|applebot|googlebot|bingbot/i;

/**
 * "Last viewed" (job_links.last_viewed_at) is meant for the customer opening the link (D-093). Staff checking
 * it (any Supabase auth cookie) and preview bots fetching it when the link is pasted into a chat do not count.
 */
export function countsAsCustomerView(userAgent: string | null, cookieHeader: string | null): boolean {
  return !/(?:^|;\s*)sb-/.test(cookieHeader ?? "") && !PREVIEW_BOT.test(userAgent ?? "");
}

/** Looks up a job by raw token. Unknown, revoked or malformed → null (caller renders 404). Links never expire (D-053). */
export async function getPublicJob(token: string): Promise<PublicJob | null> {
  const h = await headers();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("public_job_by_token_hash", {
    p_token_hash: hashLinkToken(token),
    p_count_view: countsAsCustomerView(h.get("user-agent"), h.get("cookie")),
  });
  if (error || !data) return null;
  return toPublicJob(data);
}
