import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/landing/auth-shell";
import { getStaff, roleHome } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const staff = await getStaff();
  if (staff) redirect(roleHome(staff.role));

  return (
    // No public sign-up (PRD FR1): accounts are created by the owner.
    <AuthShell title="Sign in" intro="Staff only. Ask the garage owner for an account.">
      <LoginForm />
    </AuthShell>
  );
}
