import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { AuthShell } from "@/components/landing/auth-shell";
import { getStaff, roleHome } from "@/lib/auth";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Enter your code" };

/** Step two of sign-in when two-step sign-in is on (D-110): the password is right, the code is still owed. */
export default async function VerifyPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!staff.mfaPending) redirect(roleHome(staff.role));

  return (
    <AuthShell title="Enter your code" intro="Open your authenticator app and enter the 6-digit code for Garage Desk." backLink={false}>
      <VerifyForm />
      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 text-[15px] font-medium text-lp-blue underline-offset-4 hover:underline"
        >
          Use a different account
        </button>
      </form>
    </AuthShell>
  );
}
