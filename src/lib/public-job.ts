import "server-only";
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
  job: { ref: string; status: JobStatus };
  vehicle: { make: string; model: string; plate: string };
  customer: { first_name: string };
  lines: { description: string; quantity: string; unit_price_cents: number; line_total_cents: number }[];
  /** null while the job is back in `new` (quote being revised). */
  totals: { subtotal_cents: number; vat_cents: number; total_cents: number; vat_bps: number } | null;
  timeline: { status: JobStatus; at: string }[];
}

export const PUBLIC_JOB_KEYS = {
  root: ["garage", "job", "vehicle", "customer", "lines", "totals", "timeline"],
  garage: ["name", "address", "phone"],
  job: ["ref", "status"],
  vehicle: ["make", "model", "plate"],
  customer: ["first_name"],
  line: ["description", "quantity", "unit_price_cents", "line_total_cents"],
  totals: ["subtotal_cents", "vat_cents", "total_cents", "vat_bps"],
  timeline: ["status", "at"],
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

/** Looks up a job by raw token. Unknown, revoked, expired or malformed → null (caller renders 404). */
export async function getPublicJob(token: string): Promise<PublicJob | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("public_job_by_token_hash", { p_token_hash: hashLinkToken(token) });
  if (error || !data) return null;
  return toPublicJob(data);
}
