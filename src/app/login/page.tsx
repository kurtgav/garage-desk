import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { getStaff } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getStaff()) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Wordmark className="mb-10" />
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        {/* No public sign-up (PRD FR1): accounts are created by the owner. */}
        <p className="mt-1 text-sm text-muted">Staff only. Ask the garage owner if you need an account.</p>
        <Card className="mt-6 p-6">
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
