import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The one 404 for every unknown URL, invalid/revoked customer link and staff-only area (D-013, D-019, D-020).
 * Must stay fully static: no data, no headers/cookies, no links into the staff app.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-muted">Check the address and try again.</p>
    </main>
  );
}
