"use client";

import { Phone } from "lucide-react";
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
import { recordPhoneApproval } from "../actions";

type Props = {
  jobId: string;
  /** The quote version on screen; the DB rejects the approval if it is no longer current (D-051). */
  version: number;
  /** Total of that version, already formatted. */
  totalText: string;
  /** job.can.recordPhoneApproval. Stays mounted after recording so the confirmation is still shown. */
  canRecord: boolean;
};

/** Owner only (job.can.recordPhoneApproval): the customer approved by phone, the owner records it with a note. */
export function PhoneApproval({ jobId, version, totalText, canRecord }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await recordPhoneApproval(prev, formData);
    if (result.ok) setOpen(false);
    // A stale version (lines changed meanwhile): reload so the owner sees the current quote.
    else router.refresh();
    return result;
  }, null);
  const error = state && !state.ok && !pending ? state.error : null;
  if (!canRecord && !state?.ok) return null;

  return (
    <div className="grid gap-3 sm:justify-items-end">
      {canRecord && (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">
            <Phone aria-hidden />
            Record phone approval
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={submitKeepingValues(dispatch)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Record phone approval</DialogTitle>
              <DialogDescription>
                The customer approves quote v{version}, {totalText} incl. VAT. The timeline shows it was recorded by you,
                not clicked by the customer.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="expected_version" value={version} />
            <Field id="phone-approval-note" label="How did they approve?" hint="For example who you spoke to and when.">
              <Textarea name="note" required maxLength={500} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending}>
                Approve v{version} · {totalText}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      )}
      {error && !open && <Alert tone="danger">{error}</Alert>}
      {state?.ok && !pending && <Alert tone="success">Phone approval recorded for v{version}.</Alert>}
    </div>
  );
}
