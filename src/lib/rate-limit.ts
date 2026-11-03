import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const LIMITS = {
  publicView: { max: 60, windowSeconds: 60 },
  publicAction: { max: 10, windowSeconds: 60 },
  login: { max: 10, windowSeconds: 300 },
  // Per account (hash of the email), whatever the IP: caps guessing spread over many addresses (D-109).
  loginAccount: { max: 30, windowSeconds: 3600 },
  // Per account: a 6-digit authenticator code after a correct password (D-110).
  mfaVerify: { max: 10, windowSeconds: 300 },
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

/** IPv6 clients usually hold a whole /64, so one /64 is one client (D-109). IPv4 stays per address. */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  const lower = ip.toLowerCase();
  const [head, tail] = lower.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = lower.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Why this request must stop, or false to go ahead (D-012). Keyed on the client IP, or on `subject` (an account)
 * when given. Fails closed (D-100): when the limiter's DB call fails the answer is "unavailable", so callers show
 * the generic "try again" rather than "too many attempts".
 */
export async function isRateLimited(
  bucket: keyof typeof LIMITS,
  subject?: string,
): Promise<false | "limited" | "unavailable"> {
  const { max, windowSeconds } = LIMITS[bucket];
  const who = subject ?? ipBucket(await clientIp());
  const key = createHash("sha256").update(`${bucket}:${who}`).digest("hex");
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) return "unavailable";
  return data === true ? "limited" : false;
}
