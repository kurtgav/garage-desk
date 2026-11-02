import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { getStaff } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getStaff()) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[26rem] rounded-3xl border border-edge bg-surface p-6 shadow-frame sm:p-8">
        <Wordmark className="mb-8" />
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Sign in
        </h1>
        {/* No public sign-up (PRD FR1): accounts are created by the owner. */}
        <p className="mt-1.5 text-[15px] text-faint">
          Staff only. Ask the garage owner if you need an account.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
