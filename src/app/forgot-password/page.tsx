import type { Metadata } from "next";
import { AuthShell } from "@/components/landing/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;

  return (
    <AuthShell title="Reset your password" intro="Enter the email you sign in with. We'll send you a link to choose a new password.">
      <ForgotPasswordForm expired={expired === "1"} />
    </AuthShell>
  );
}
