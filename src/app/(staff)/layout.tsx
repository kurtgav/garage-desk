import { LogOut } from "lucide-react";
import Link from "next/link";
import { StaffNav } from "@/components/staff-nav";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { requireStaff } from "@/lib/auth";
import { signOut } from "../login/actions";

const ROLE_LABEL = { owner: "Owner", mechanic: "Mechanic" } as const;

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        {/* Phone/tablet: wordmark + account on row 1, nav on row 2 (scrolls sideways if it must). Desktop: one row. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:gap-x-6 md:px-6 lg:flex-nowrap">
          <Link href="/" className="shrink-0 rounded-md">
            <Wordmark />
          </Link>
          <StaffNav role={staff.role} className="order-last w-full overflow-x-auto pb-1 lg:order-none lg:w-auto lg:pb-0" />
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="min-w-0 text-right leading-tight">
              <p className="max-w-28 truncate text-sm font-medium text-ink sm:max-w-48">{staff.fullName}</p>
              <p className="text-xs text-muted">{ROLE_LABEL[staff.role]}</p>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="ghost" className="px-3" aria-label="Sign out">
                <LogOut aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </>
  );
}
