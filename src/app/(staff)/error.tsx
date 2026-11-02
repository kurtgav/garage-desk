"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Staff pages that fail to load (e.g. the database is unreachable) render here, inside the app shell (D-095).
 * Never shows the error itself: server errors reach the client as a generic message plus a digest that matches
 * the server log line, which is the one detail worth giving the owner when they report it.
 */
export default function StaffError({ error, retry }: { error: unknown; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <>
      <PageHeader title="Something went wrong" description="This page didn't load. Try again in a moment." />
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="max-w-prose text-[15px] text-muted">
          Loading a page changes nothing, so no work was lost. If this keeps happening, check your connection.
        </p>
        <div className="flex flex-wrap gap-2">
          {/* retry() re-fetches the page on the server; reset() alone would re-render the same failed result. */}
          <Button loading={pending} onClick={() => startTransition(retry)}>
            <RotateCw aria-hidden />
            Try again
          </Button>
          <Link href="/jobs" className={buttonVariants({ variant: "secondary" })}>
            Go to jobs
          </Link>
        </div>
        {digest && <p className="text-sm text-faint">Error reference: {digest}</p>}
      </div>
    </>
  );
}
