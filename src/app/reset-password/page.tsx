import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/landing/auth-shell";
import { hasRecoverySession } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Only reachable through the recovery link (/auth/confirm); anything else asks for a new link (D-079). */
export default async function ResetPasswordPage() {
  if (!(await hasRecoverySession())) redirect("/forgot-password");

  return (
    <AuthShell title="Choose a new password" intro="Pick one you don't use anywhere else.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
