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

/** Owner-only areas. Mechanics get the generic 404 (D-020); the DB also refuses. */
export async function requireOwner(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== "owner") notFound();
  return staff;
}
