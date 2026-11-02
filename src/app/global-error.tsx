"use client";

import "./globals.css";
import { buttonVariants } from "@/components/ui/button";

/**
 * Last resort when the root layout itself fails (D-095). Replaces the whole document, so it brings its own
 * html/body and stylesheet and uses plain links: the app router may be what broke. Never shows the error.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full">
      {/* The root layout's Inter variable is not here; fall back to the system face. */}
      <body className="flex min-h-full flex-col bg-canvas text-ink" style={{ fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong · Garage Desk</title>
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="w-full max-w-md rounded-3xl border border-line bg-surface px-6 py-10 text-center shadow-frame">
            <p className="text-sm font-medium text-faint">Garage Desk</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-2 text-[15px] text-muted">Loading a page changes nothing, so no work was lost.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={retry} className={buttonVariants()}>
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose: the router may be what broke */}
              <a href="/" className={buttonVariants({ variant: "secondary" })}>
                Go to Garage Desk home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
