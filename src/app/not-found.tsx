import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The one 404 for every unknown URL, invalid/revoked customer link and staff-only area (D-013, D-019, D-020).
 * No data, no links into the staff app. Rendered per request (connection()) so it gets the CSP nonce.
 */
export default async function NotFound() {
  await connection();
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-edge bg-surface px-6 py-12 text-center shadow-frame">
        <p
          aria-hidden
          className="text-sm font-medium tracking-wide text-faint tabular-nums"
        >
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Page not found
        </h1>
        <p className="mt-2 text-[15px] text-faint">
          Check the address and try again.
        </p>
      </div>
    </main>
  );
}
