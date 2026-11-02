"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { roleHome } from "@/lib/auth";
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
  if (await isRateLimited("login")) {
    return { ok: false, error: "Too many sign-in attempts. Please wait a few minutes and try again.", email: failure.email };
  }

  const parsed = credentials.safeParse({ email, password });
  if (!parsed.success) return failure;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return failure;

  // A deactivated (or profile-less) account must not keep a session, otherwise the app bounces back here silently.
  const { data: profile } = await supabase.from("profiles").select("active, role").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return failure;
  }

  redirect(roleHome(profile.role));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }); // this device only; other devices stay signed in
  redirect("/login");
}
