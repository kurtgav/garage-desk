"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { GENERIC_ERROR, NAME_TAKEN, PG_UNIQUE_VIOLATION, staffErrorMessage } from "@/lib/data/errors";
import type { ActionResult, TempPassword } from "@/lib/data/types";
import { fail, parseForm } from "@/lib/form";
import { generateTempPassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Owner-only staff management (PLAN Phase 5, D-077). Every action calls requireOwner() first (mechanics get
// the 404); activation goes through the set_staff_active RPC as the owner, so the DB enforces "owner only,
// never self, at least one active owner". The service role is used only for Auth admin calls.

const STAFF_ERRORS: Record<string, string> = {
  cannot_change_self: "You can't deactivate your own account.",
  last_owner: "The garage needs at least one active owner.",
  not_found: "This staff member doesn't exist.",
};

const OWNER_PASSWORD = "Owners change their own password on their profile.";
const NOT_FOUND = STAFF_ERRORS.not_found;
const BANNED_FOREVER = "876000h"; // ~100 years: Auth refuses sign-in and token refresh while banned

const idField = z.uuid(NOT_FOUND);

const newStaffSchema = z.object({
  full_name: z.string("Enter their name.").trim().min(1, "Enter their name.").max(100, "Keep the name to 100 characters or fewer."),
  email: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.email("Enter a valid email address.").max(254, "Enter a valid email address."),
  ),
});

/**
 * New mechanic account with a one-time temporary password (shown once, never stored or logged). They must set
 * their own at first sign-in (must_change_password, D-106).
 */
export async function createStaff(
  _prev: ActionResult<TempPassword> | null,
  formData: FormData,
): Promise<ActionResult<TempPassword>> {
  await requireOwner();
  const input = parseForm(newStaffSchema, formData);
  if ("error" in input) return input;

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const created = await admin.auth.admin.createUser({ email: input.data.email, password: tempPassword, email_confirm: true });
  if (created.error || !created.data.user) {
    return fail(created.error?.code === "email_exists" ? "That email already has an account." : GENERIC_ERROR);
  }
  const id = created.data.user.id;
  const profile = await admin
    .from("profiles")
    .insert({ id, full_name: input.data.full_name, role: "mechanic", active: true, must_change_password: true });
  if (profile.error) {
    await admin.auth.admin.deleteUser(id); // no half-made accounts
    return fail(profile.error.code === PG_UNIQUE_VIOLATION ? NAME_TAKEN : GENERIC_ERROR);
  }
  revalidatePath("/staff");
  return { ok: true, tempPassword };
}

const activeSchema = z.object({
  id: idField,
  active: z.enum(["true", "false"], "Choose activate or deactivate.").transform((v) => v === "true"),
});

/** Deactivate (signs them out: Auth ban) or reactivate. Never self, never the last active owner. */
export async function setStaffActive(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  const input = parseForm(activeSchema, formData);
  if ("error" in input) return input;
  const { id, active } = input.data;
  if (id === owner.id) return fail(STAFF_ERRORS.cannot_change_self);

  const db = await createClient();
  const { error } = await db.rpc("set_staff_active", { p_profile_id: id, p_active: active });
  if (error) return fail(STAFF_ERRORS[error.message] ?? staffErrorMessage(error));

  // profiles.active already locks them out (RLS, getStaff) and the RPC ended their sessions; the ban stops
  // new sign-ins. It is idempotent, so a failed call is retried once before reporting the partial success.
  const admin = createAdminClient();
  const ban = () => admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : BANNED_FOREVER });
  const done = !(await ban()).error || !(await ban()).error;
  revalidatePath("/staff");
  if (done) return { ok: true };
  return fail(
    active
      ? "Reactivated, but unblocking their sign-in failed. Try again."
      : "Deactivated, but signing them out failed. Try again.",
  );
}

/**
 * A new one-time temporary password for a mechanic, who must then set their own (D-106). Owners (incl. self) use
 * /profile or forgot password.
 */
export async function resetStaffPassword(
  _prev: ActionResult<TempPassword> | null,
  formData: FormData,
): Promise<ActionResult<TempPassword>> {
  await requireOwner();
  const input = parseForm(z.object({ id: idField }), formData);
  if ("error" in input) return input;
  const { id } = input.data;

  // Only staff accounts (owner RLS sees every profile), and never an owner's: a reset bypasses their password.
  const db = await createClient();
  const { data: profile } = await db.from("profiles").select("role, active").eq("id", id).maybeSingle();
  if (!profile) return fail(NOT_FOUND);
  if (profile.role === "owner") return fail(OWNER_PASSWORD);
  if (!profile.active) return fail("Reactivate them first.");

  // Flag first: if the password change then fails, they are only asked to choose a new one, never left on a
  // password the owner knows.
  const admin = createAdminClient();
  const flagged = await admin.from("profiles").update({ must_change_password: true }).eq("id", id);
  if (flagged.error) return fail(GENERIC_ERROR);
  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(id, { password: tempPassword });
  if (error) return fail(GENERIC_ERROR);
  return { ok: true, tempPassword };
}
