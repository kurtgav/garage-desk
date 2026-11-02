import "server-only";
import { requireOwner } from "@/lib/auth";
import { OPEN_STATUSES } from "@/lib/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "./profile";
import type { StaffMember } from "./types";

/** Sign-in emails live in Auth, not in profiles: owner-only admin read. */
async function staffEmails(): Promise<Map<string, string>> {
  // shortcut: one page of 1000 Auth users; page through listUsers if a garage ever has more.
  const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error("Could not load staff emails");
  return new Map(data.users.map((u) => [u.id, u.email ?? ""]));
}

/** Every staff account for /staff, active first, then by name. Owner only (mechanics get the 404). */
export async function listStaff(): Promise<StaffMember[]> {
  await requireOwner();
  const db = await createClient();
  const [profiles, openJobs, emails] = await Promise.all([
    db.from("profiles").select("id, full_name, role, active, avatar_path").order("full_name"),
    db.from("jobs").select("assigned_mechanic_id").in("status", [...OPEN_STATUSES]),
    staffEmails(),
  ]);
  if (profiles.error || openJobs.error) throw new Error("Could not load staff");

  const jobCounts = new Map<string, number>();
  for (const j of openJobs.data) jobCounts.set(j.assigned_mechanic_id, (jobCounts.get(j.assigned_mechanic_id) ?? 0) + 1);
  const avatars = await signAvatarUrls(profiles.data.flatMap((p) => (p.avatar_path ? [p.avatar_path] : [])));

  return profiles.data
    .map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: emails.get(p.id) ?? "",
      role: p.role,
      active: p.active,
      avatarUrl: p.avatar_path ? (avatars.get(p.avatar_path) ?? null) : null,
      openJobs: jobCounts.get(p.id) ?? 0,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active));
}
