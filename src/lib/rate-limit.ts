import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const LIMITS = {
  publicView: { max: 60, windowSeconds: 60 },
  publicAction: { max: 10, windowSeconds: 60 },
  login: { max: 10, windowSeconds: 300 },
  // Each request may send an email (forgot password), so it is stricter than sign-in.
  passwordReset: { max: 5, windowSeconds: 900 },
  // Checks the current password (a sign-in attempt), so the same budget as sign-in.
  passwordChange: { max: 10, windowSeconds: 300 },
} as const;

async function clientIp(): Promise<string> {
  const h = await headers();
  // Vercel sets x-forwarded-for; first entry is the client.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Why this request must stop, or false to go ahead (D-012). Fails closed (D-100): when the limiter's DB call
 * fails the answer is "unavailable", so callers show the generic "try again" rather than "too many attempts".
 */
export async function isRateLimited(bucket: keyof typeof LIMITS): Promise<false | "limited" | "unavailable"> {
  const { max, windowSeconds } = LIMITS[bucket];
  const key = createHash("sha256").update(`${bucket}:${await clientIp()}`).digest("hex");
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) return "unavailable";
  return data === true ? "limited" : false;
}
