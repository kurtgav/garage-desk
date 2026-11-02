import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AuthShell } from "@/components/landing/auth-shell";
import { lpSubmit } from "@/components/landing/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The one 404 for every unknown URL, invalid/revoked customer link and staff-only area (D-013, D-019, D-020).
 * Static copy only, no data and no links into the staff app, so every 404 is byte-identical (D-032, D-095).
 * Rendered per request (connection()) so it gets the CSP nonce.
 */
export default async function NotFound() {
  await connection();
  return (
    <AuthShell title="Page not found" intro="Check the address and try again." backLink={false}>
      <p className="text-base leading-normal text-pretty text-lp-body">
        Got this link from the garage? Ask them to send it again.
      </p>
      <Link href="/" className={cn(lpSubmit, "mt-8")}>
        Go to Garage Desk home
      </Link>
    </AuthShell>
  );
}
