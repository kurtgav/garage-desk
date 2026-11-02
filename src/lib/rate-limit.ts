import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const LIMITS = {
  publicView: { max: 60, windowSeconds: 60 },
  publicAction: { max: 10, windowSeconds: 60 },
} as const;

async function clientIp(): Promise<string> {
  const h = await headers();
  // Vercel sets x-forwarded-for; first entry is the client.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** True when this client is over the limit for the bucket (D-012). Fails open on DB error. */
export async function isRateLimited(bucket: keyof typeof LIMITS): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[bucket];
  const key = createHash("sha256").update(`${bucket}:${await clientIp()}`).digest("hex");
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  return !error && data === true;
}
