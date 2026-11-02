import "server-only";
import { cache } from "react";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

export const AVATAR_BUCKET = "avatars";
/** Signed photo URLs live this long; every page render signs fresh ones. */
const AVATAR_URL_TTL_SECONDS = 600;

/**
 * Short-lived signed URLs for avatar paths (private bucket), keyed by path. Signed with the caller's
 * client, so storage RLS decides (active staff only). Missing or failed paths are simply absent.
 */
export async function signAvatarUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const db = await createClient();
  const { data } = await db.storage.from(AVATAR_BUCKET).createSignedUrls(paths, AVATAR_URL_TTL_SECONDS);
  return new Map((data ?? []).flatMap((s) => (s.path && s.signedUrl && !s.error ? [[s.path, s.signedUrl]] : [])));
}

/** The signed-in staff member's own profile (/profile, shell avatar). Signed-out → /login. Cached per request. */
export const getMyProfile = cache(async (): Promise<Profile> => {
  const staff = await requireStaff();
  // phone/about are not granted to `authenticated` (colleagues must not read them, D-076), so the caller's
  // own row is read with the server client, keyed by the verified session user only.
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("full_name, role, active, phone, about, avatar_path")
    .eq("id", staff.id)
    .single();
  if (error) throw new Error("Could not load your profile");
  const avatarUrl = data.avatar_path ? ((await signAvatarUrls([data.avatar_path])).get(data.avatar_path) ?? null) : null;
  return {
    id: staff.id,
    fullName: data.full_name,
    email: staff.email,
    role: data.role,
    phone: data.phone,
    about: data.about,
    avatarUrl,
    active: data.active,
  };
});
