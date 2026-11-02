"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/components/form-submit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/data/types";
import { approveQuote, declineQuote } from "./actions";

type Props = {
  /** The raw link token (already in the URL). Nothing else from the job reaches the browser as data. */
  token: string;
  /** The quote version this page showed; both actions reject (“quote changed”) if it is no longer current (D-049). */
  expectedVersion: string;
  /** Total already formatted by formatCents. */
  totalText: string;
};

/**
 * Approve / Decline for a quoted job. Sticky at the bottom of a phone screen so the thumb reaches it.
 * On success the page is refreshed and its status banner (role="status") announces the new state.
 */
export function QuoteActions({ token, expectedVersion, totalText }: Props) {
  const router = useRouter();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [approveState, approve, approving] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await approveQuote(prev, formData);
    // Success revalidates the page server-side. On failure (e.g. the quote changed) refresh, so the
    // current quote shows next to the error.
    if (!result.ok) router.refresh();
    return result;
  }, null);
  const [declineState, decline, declining] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await declineQuote(prev, formData);
    setDeclineOpen(false);
    if (!result.ok) router.refresh();
    return result;
  }, null);
  const busy = approving || declining;

  return (
    <section
      aria-labelledby="decision-heading"
      className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-line bg-surface px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:rounded-lg sm:border sm:p-5"
    >
      <h2 id="decision-heading" className="mb-3 text-base font-semibold text-ink">
        Happy with this quote?
      </h2>
      {[approveState, declineState].map(
        (s, i) =>
          s && !s.ok && !busy && (
            <Alert key={i} tone="danger" className="mb-3">
              {s.error}
            </Alert>
          ),
      )}
      {(approveState?.ok || declineState?.ok) && (
        <p role="status" className="mb-3 text-sm text-muted">
          Thank you. Updating…
        </p>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" size="lg" className="h-14" disabled={busy}>
              Decline
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={submitKeepingValues(decline)} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>Decline this quote?</DialogTitle>
                <DialogDescription>
                  The garage will see that you declined. They can send you a revised quote on this same link.
                </DialogDescription>
              </DialogHeader>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="expected_version" value={expectedVersion} />
              <Field id="decline-reason" label="Reason (optional)" hint="For example: too expensive, or only do the brakes.">
                <Textarea name="reason" maxLength={500} />
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="lg">
                    Keep the quote
                  </Button>
                </DialogClose>
                <Button type="submit" variant="danger" size="lg" loading={declining}>
                  Decline quote
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <form action={approve}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="expected_version" value={expectedVersion} />
          <Button type="submit" size="lg" className="h-14 w-full" loading={approving} disabled={busy}>
            Approve <span className="tabular-nums">{totalText}</span>
          </Button>
        </form>
      </div>
    </section>
  );
}
