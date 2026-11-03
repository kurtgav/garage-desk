import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/landing/auth-shell";
import { getStaff, hasRecoverySession } from "@/lib/auth";
import { setNewPassword } from "./actions";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Only reachable through the recovery link (/auth/confirm); anything else asks for a new link (D-079). */
export default async function ResetPasswordPage() {
  if (!(await hasRecoverySession())) redirect("/forgot-password");
  // Two-step sign-in on (D-110): Auth refuses a new password until the code is in; the code step sends them back.
  if ((await getStaff())?.mfaPending) redirect("/login/verify");

  return (
    <AuthShell title="Choose a new password" intro="Pick one you don't use anywhere else.">
      <ResetPasswordForm action={setNewPassword} />
    </AuthShell>
  );
}
