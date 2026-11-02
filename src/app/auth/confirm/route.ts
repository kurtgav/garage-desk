import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Link in the recovery email: {{ .SiteURL }}/auth/confirm?token_hash=…&type=recovery (supabase/templates).
 * A valid, unused token becomes a recovery session (cookies) → /reset-password; anything else → expired.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (type !== "recovery" || !tokenHash || tokenHash.length > 256) redirect("/forgot-password?expired=1");

  const db = await createClient();
  const { error } = await db.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  redirect(error ? "/forgot-password?expired=1" : "/reset-password");
}
