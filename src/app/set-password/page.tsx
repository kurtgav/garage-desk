import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { setOwnPassword } from "@/app/reset-password/actions";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { AuthShell } from "@/components/landing/auth-shell";
import { getStaff, roleHome } from "@/lib/auth";

export const metadata: Metadata = { title: "Set your own password" };

/** After a temporary password from the owner, the only page that opens until they choose their own (D-106). */
export default async function SetPasswordPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (staff.mfaPending) redirect("/login/verify"); // same order as requireStaff
  if (!staff.mustChangePassword) redirect(roleHome(staff.role));

  return (
    <AuthShell
      title="Set your own password"
      intro="You signed in with a temporary password from the garage owner. Choose your own to continue. Only you will know it."
      backLink={false}
    >
      <ResetPasswordForm action={setOwnPassword} />
      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 text-[15px] font-medium text-lp-blue underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
