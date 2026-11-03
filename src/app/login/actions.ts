"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hasRecoverySession, roleHome } from "@/lib/auth";
import { GENERIC_ERROR as TRY_AGAIN } from "@/lib/data/errors";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { ok: false; error: string; email: string } | null;

// One message for every failure: never reveal whether the account exists or echo Supabase errors.
const GENERIC_ERROR = "Email or password is incorrect.";

const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
});

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const failure: LoginState = { ok: false, error: GENERIC_ERROR, email: email.slice(0, 254) };

  // Supabase Auth only sees the server IP, so throttle per client IP here.
  const blocked = await isRateLimited("login");
  if (blocked) {
    const error =
      blocked === "unavailable" ? TRY_AGAIN : "Too many sign-in attempts. Please wait a few minutes and try again.";
    return { ok: false, error, email: failure.email };
  }

  const parsed = credentials.safeParse({ email, password });
  if (!parsed.success) return failure;

  // Per account too (D-109), so guesses spread over many IPs still hit a ceiling.
  const accountBlocked = await isRateLimited("loginAccount", parsed.data.email.toLowerCase());
  if (accountBlocked) {
    const error =
      accountBlocked === "unavailable"
        ? TRY_AGAIN
        : "Too many sign-in attempts. Please wait a few minutes and try again.";
    return { ok: false, error, email: failure.email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return failure;

  // Two-step sign-in on (D-110): RLS hides the profile until the code is in, so ask for it first.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/verify");

  return enterApp(supabase, data.user.id, failure);
}

/** A deactivated (or profile-less) account must not keep a session, otherwise the app bounces back here silently. */
async function enterApp<T>(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, failure: T): Promise<T> {
  const { data: profile } = await supabase.from("profiles").select("active, role").eq("id", userId).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return failure;
  }
  redirect(roleHome(profile.role));
}

export type VerifyState = { ok: false; error: string } | null;

// One message for every failed code: never Supabase's text.
const BAD_CODE = "That code didn't work. Check the code in your authenticator app and try again.";
const TOO_MANY_CODES = "Too many attempts. Please wait a few minutes and try again.";

/** Step two (/login/verify): the 6-digit code from the authenticator app lifts the session to aal2 (D-110). */
export async function verifyCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Per account: the password is already known, only 10^6 codes stand between a guesser and the app.
  const blocked = await isRateLimited("mfaVerify", user.id);
  if (blocked) return { ok: false, error: blocked === "unavailable" ? TRY_AGAIN : TOO_MANY_CODES };

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const factor = user.factors?.find((f) => f.factor_type === "totp" && f.status === "verified");
  const failure: VerifyState = { ok: false, error: BAD_CODE };
  if (!/^\d{6}$/.test(code) || !factor) return failure;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return failure;

  // Came from a forgot-password link: Auth only lets an aal2 session set the new password, so go back there.
  if (await hasRecoverySession()) redirect("/reset-password");
  return enterApp(supabase, user.id, failure);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }); // this device only; other devices stay signed in
  redirect("/login");
}
