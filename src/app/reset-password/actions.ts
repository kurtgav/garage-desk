"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaff, hasRecoverySession, roleHome } from "@/lib/auth";
import { GENERIC_ERROR } from "@/lib/data/errors";
import type { ActionResult } from "@/lib/data/types";
import { fail, parseForm } from "@/lib/form";
import { newPasswordSchema, passwordErrorMessage } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({ password: newPasswordSchema, confirm: z.string("Repeat the new password.") })
  .refine((v) => v.password === v.confirm, "The passwords don't match.");

/** They chose their own password: no more forced change (D-106). Service role, `authenticated` may not write it. */
async function clearMustChangePassword(id: string): Promise<boolean> {
  const { error } = await createAdminClient().from("profiles").update({ must_change_password: false }).eq("id", id);
  return !error;
}

/** New password for a recovery session (D-079); without one → /forgot-password. Success → role home. */
export async function setNewPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await hasRecoverySession())) redirect("/forgot-password");
  const input = parseForm(schema, formData);
  if ("error" in input) return input;

  const db = await createClient();
  const { error } = await db.auth.updateUser({ password: input.data.password });
  if (error) return fail(passwordErrorMessage(error.code) ?? GENERIC_ERROR);

  const staff = await getStaff();
  if (!staff) {
    await db.auth.signOut(); // inactive or profile-less: the password is set, but no app session
    redirect("/login");
  }
  // If this fails, requireStaff sends them to /set-password, which asks once more.
  if (staff.mustChangePassword) await clearMustChangePassword(staff.id);
  redirect(roleHome(staff.role));
}

/**
 * Their own password after a temporary one from the owner (/set-password, D-106). No current password: the
 * session already proves it, and Auth refuses the temporary one again (same_password). Success → role home.
 */
export async function setOwnPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!staff.mustChangePassword) redirect(roleHome(staff.role));
  const input = parseForm(schema, formData);
  if ("error" in input) return input;

  const db = await createClient();
  const { error } = await db.auth.updateUser({ password: input.data.password });
  if (error) return fail(passwordErrorMessage(error.code) ?? GENERIC_ERROR);
  if (!(await clearMustChangePassword(staff.id))) return fail(GENERIC_ERROR);
  redirect(roleHome(staff.role));
}
