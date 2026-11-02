import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "owner" | "mechanic";
export interface Staff {
  id: string;
  fullName: string;
  /** Sign-in email (shell user card). */
  email: string;
  role: StaffRole;
}

/** Current staff member, or null (not signed in, no profile, or inactive). Cached per request. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !data.active) return null;
  return { id: data.id, fullName: data.full_name, email: user.email ?? "", role: data.role as StaffRole };
});

export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  return staff;
}

/** A recovery link's session may set a new password for this long after the link was opened. */
const RECOVERY_WINDOW_SECONDS = 3600;

/**
 * True when the current session came from a recovery link (/auth/confirm → verifyOtp, amr "otp") opened within
 * the last hour, not from a password sign-in (amr "password"). Defence in depth for /reset-password (D-079):
 * Auth's secure_password_change is the boundary. Claims are verified with Auth, not just decoded.
 */
export async function hasRecoverySession(): Promise<boolean> {
  const { data } = await (await createClient()).auth.getClaims();
  const amr: unknown = data?.claims.amr;
  const now = Date.now() / 1000;
  return (
    Array.isArray(amr) &&
    amr.some((e) => e?.method === "otp" && typeof e.timestamp === "number" && now - e.timestamp <= RECOVERY_WINDOW_SECONDS)
  );
}

/** Where each role lands after sign-in (PLAN Phase 5). */
export function roleHome(role: StaffRole): "/dashboard" | "/jobs" {
  return role === "owner" ? "/dashboard" : "/jobs";
}

/** Owner-only areas. Mechanics get the generic 404 (D-020); the DB also refuses. */
export async function requireOwner(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== "owner") notFound();
  return staff;
}
