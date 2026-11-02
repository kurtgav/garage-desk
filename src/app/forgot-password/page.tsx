import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/landing/auth-shell";
import { passwordResetEmailEnabled, RESET_EMAIL_OFF } from "@/lib/password";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;

  // D-094: without a mailer that reaches staff, say who can help instead of promising an email.
  if (!passwordResetEmailEnabled()) {
    return (
      <AuthShell title="Reset your password" intro={RESET_EMAIL_OFF}>
        <p className="text-[15px] text-lp-body">Owners: contact your Garage Desk administrator.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex min-h-11 items-center rounded-md text-[15px] font-medium text-lp-blue underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" intro="Enter the email you sign in with. We'll send you a link to choose a new password.">
      <ForgotPasswordForm expired={expired === "1"} />
    </AuthShell>
  );
}
