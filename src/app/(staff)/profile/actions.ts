"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { GENERIC_ERROR, nameErrorMessage, staffErrorMessage, TOO_MANY_ATTEMPTS } from "@/lib/data/errors";
import { AVATAR_BUCKET } from "@/lib/data/profile";
import type { ActionResult } from "@/lib/data/types";
import { fail, optionalText, parseForm } from "@/lib/form";
import { newPasswordSchema, passwordErrorMessage } from "@/lib/password";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient, createStatelessClient } from "@/lib/supabase/server";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const detailsSchema = z.object({
  full_name: z
    .string("Enter your name.")
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Keep your name to 100 characters or fewer."),
  phone: optionalText(30, "Keep the phone number to 30 characters or fewer."),
  about: optionalText(500, "Keep the about text to 500 characters or fewer."),
});

/** Own name, phone and about. RLS profiles_update_self + the column grant are the boundary (D-076). */
export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  const input = parseForm(detailsSchema, formData);
  if ("error" in input) return input;

  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .update({ full_name: input.data.full_name, phone: input.data.phone ?? null, about: input.data.about ?? null })
    .eq("id", staff.id)
    .select("id");
  if (error || data.length === 0) return fail(nameErrorMessage(error) ?? staffErrorMessage(error));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** File signatures of the accepted formats; the bucket also refuses anything else (D-078). No SVG. */
function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (starts([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  return null;
}

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const NOT_AN_IMAGE = "Choose a PNG, JPEG or WebP image.";

async function myAvatarPath(db: Awaited<ReturnType<typeof createClient>>, id: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("avatar_path").eq("id", id).single();
  return data?.avatar_path ?? null;
}

/** New photo in the own folder under a random name, then the profile points at it and the old file goes. */
export async function uploadAvatar(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a photo to upload.");
  if (file.size > MAX_AVATAR_BYTES) return fail("Choose a photo of 2 MB or less.");
  if (!ACCEPTED_TYPES.has(file.type)) return fail(NOT_AN_IMAGE);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail(NOT_AN_IMAGE);

  const db = await createClient();
  const oldPath = await myAvatarPath(db, staff.id);
  const path = `${staff.id}/${randomUUID()}.${kind.ext}`;
  const storage = db.storage.from(AVATAR_BUCKET);
  const uploaded = await storage.upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (uploaded.error) return fail(GENERIC_ERROR);

  const { data, error } = await db.from("profiles").update({ avatar_path: path }).eq("id", staff.id).select("id");
  if (error || data.length === 0) {
    await storage.remove([path]);
    return fail(staffErrorMessage(error));
  }
  // Best effort: a leftover old file is unreferenced and only readable by staff.
  if (oldPath) await storage.remove([oldPath]);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAvatar(): Promise<ActionResult> {
  const staff = await requireStaff();
  const db = await createClient();
  const oldPath = await myAvatarPath(db, staff.id);
  if (!oldPath) return { ok: true };
  const { data, error } = await db.from("profiles").update({ avatar_path: null }).eq("id", staff.id).select("id");
  if (error || data.length === 0) return fail(staffErrorMessage(error));
  await db.storage.from(AVATAR_BUCKET).remove([oldPath]);
  revalidatePath("/", "layout");
  return { ok: true };
}

const passwordSchema = z
  .object({
    current_password: z.string("Enter your current password.").min(1, "Enter your current password.").max(1024),
    new_password: newPasswordSchema,
    confirm_password: z.string("Repeat the new password."),
  })
  .refine((v) => v.new_password === v.confirm_password, "The new passwords don't match.");

/** Re-checks the current password, then changes it on the caller's own session (Auth signs out other sessions). */
export async function changePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  // Limiter down (fails closed, D-100): the generic "try again", not "too many attempts".
  const blocked = await isRateLimited("passwordChange");
  if (blocked) return fail(blocked === "unavailable" ? GENERIC_ERROR : TOO_MANY_ATTEMPTS);
  const input = parseForm(passwordSchema, formData);
  if ("error" in input) return input;

  // A throwaway client, so checking the password never touches the caller's session cookies.
  const verifier = createStatelessClient();
  const check = await verifier.auth.signInWithPassword({ email: staff.email, password: input.data.current_password });
  if (check.error || check.data.user?.id !== staff.id) return fail("Your current password is incorrect.");
  await verifier.auth.signOut({ scope: "local" }); // ends the check's own session only

  const db = await createClient();
  const { error } = await db.auth.updateUser({ password: input.data.new_password });
  if (error) return fail(passwordErrorMessage(error.code) ?? GENERIC_ERROR);
  return { ok: true };
}

// Two-step sign-in (D-110): one TOTP factor per account. Auth checks the codes; no Supabase text reaches the UI.
const BAD_CODE = "That code didn't work. Check the code in your authenticator app and try again.";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Removes this user's TOTP factors in `status` (unverified leftovers, or the verified one to turn it off). */
async function removeTotp(db: Db, status: "verified" | "unverified"): Promise<boolean> {
  const { data, error } = await db.auth.mfa.listFactors();
  if (error) return false;
  for (const f of data.all.filter((f) => f.factor_type === "totp" && f.status === status)) {
    if ((await db.auth.mfa.unenroll({ factorId: f.id })).error) return false;
  }
  return true;
}

/** "Turn on": a new, unverified factor. The QR code (data URI) and secret go to this user's own page only. */
export async function startTwoStep(): Promise<ActionResult<{ qrCode: string; secret: string }>> {
  await requireStaff();
  const db = await createClient();
  if (!(await removeTotp(db, "unverified"))) return fail(GENERIC_ERROR);
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", issuer: "Garage Desk" });
  if (error) return fail(GENERIC_ERROR);
  return { ok: true, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** The first code from the app verifies the new factor: two-step sign-in is on, this session is aal2. */
export async function confirmTwoStep(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return fail(BAD_CODE);
  const db = await createClient();
  const { data, error } = await db.auth.mfa.listFactors();
  const factor = data?.all.find((f) => f.factor_type === "totp" && f.status === "unverified");
  if (error || !factor) return fail(GENERIC_ERROR);
  if ((await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code })).error) return fail(BAD_CODE);
  revalidatePath("/profile");
  return { ok: true };
}

/** "Turn off": Auth only lets an aal2 session remove a verified factor, which requireStaff guarantees here. */
export async function turnOffTwoStep(): Promise<ActionResult> {
  await requireStaff();
  if (!(await removeTotp(await createClient(), "verified"))) return fail(GENERIC_ERROR);
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Ends every session of this account, this device included (D-107). Other devices hold a JWT that is still
 * signed, but getUser() asks Auth, which no longer knows the session, so their next page goes to /login.
 */
export async function signOutEverywhere(): Promise<ActionResult> {
  await requireStaff();
  const db = await createClient();
  const { error } = await db.auth.signOut({ scope: "global" });
  if (error) return fail(GENERIC_ERROR);
  redirect("/login?signed_out=everywhere");
}
