import "server-only";
import { requireOwner } from "@/lib/auth";
import { OPEN_STATUSES } from "@/lib/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "./profile";
import type { StaffMember } from "./types";

const USERS_PER_PAGE = 1000;

/** Sign-in emails live in Auth, not in profiles: owner-only admin read, every page of Auth users. */
async function staffEmails(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const emails = new Map<string, string>();
  // A short page is the last one (auth-js's nextPage parses only one digit of the page number).
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw new Error("Could not load staff emails");
    for (const u of data.users) emails.set(u.id, u.email ?? "");
    if (data.users.length < USERS_PER_PAGE) return emails;
  }
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
