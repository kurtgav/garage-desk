"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaff, hasRecoverySession, roleHome } from "@/lib/auth";
import { GENERIC_ERROR } from "@/lib/data/errors";
import type { ActionResult } from "@/lib/data/types";
import { fail, parseForm } from "@/lib/form";
import { newPasswordSchema, passwordErrorMessage } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({ password: newPasswordSchema, confirm: z.string("Repeat the new password.") })
  .refine((v) => v.password === v.confirm, "The passwords don't match.");

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
  redirect(roleHome(staff.role));
}
