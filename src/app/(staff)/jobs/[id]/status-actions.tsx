"use client";

import { Clock } from "lucide-react";
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
import { isJobStatus, STAFF_TRANSITIONS, STATUS_LABEL, type JobStatus } from "@/lib/status";
import { transitionJob } from "../actions";

type Result = ActionResult<{ message: string }>;

/** The job's next step(s) from STAFF_TRANSITIONS. The DB (transition_job) is the real guard. */
export function StatusActions({ jobId, status, hasLines }: { jobId: string; status: JobStatus; hasLines: boolean }) {
  const [reviseOpen, setReviseOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<Result | null, FormData>(async (prev, formData) => {
    const result = await transitionJob(prev, formData);
    if (!result.ok) return result;
    setReviseOpen(false);
    const to = formData.get("to_status");
    return { ok: true, message: `Status changed to ${isJobStatus(to) ? STATUS_LABEL[to] : "the next step"}.` };
  }, null);

  const transitions = STAFF_TRANSITIONS[status];
  const error = state && !state.ok && !pending ? state.error : null;

  return (
    <div className="grid w-full gap-3 sm:w-auto sm:justify-items-end">
      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {transitions.map((t) =>
            t.askNote ? (
              <Dialog key={t.to} open={reviseOpen} onOpenChange={setReviseOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" disabled={pending}>
                    {t.label}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={submitKeepingValues(dispatch)} className="grid gap-4">
                    <DialogHeader>
                      <DialogTitle>Revise the quote?</DialogTitle>
                      <DialogDescription>
                        The job goes back to New and its lines unlock. The customer&apos;s link shows &ldquo;Your quote is
                        being revised&rdquo; until you send the quote again.
                      </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="to_status" value={t.to} />
                    <Field id="revise-note" label="Reason (optional)" hint="Shown on the job's timeline, not to the customer.">
                      <Textarea name="note" maxLength={500} />
                    </Field>
                    {error && <Alert tone="danger">{error}</Alert>}
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="secondary">
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button type="submit" loading={pending}>
                        {t.label}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            ) : (
              <form key={t.to} onSubmit={submitKeepingValues(dispatch)}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="to_status" value={t.to} />
                <Button type="submit" loading={pending} disabled={t.to === "quoted" && !hasLines}>
                  {t.label}
                </Button>
              </form>
            ),
          )}
        </div>
      )}

      {status === "new" && !hasLines && <p className="text-sm text-muted">Add at least one line to send the quote.</p>}
      {status === "quoted" && (
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <Clock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
          Waiting for customer approval via link
        </p>
      )}

      {error && !reviseOpen && <Alert tone="danger">{error}</Alert>}
      {state?.ok && !pending && <Alert tone="success">{state.message}</Alert>}
    </div>
  );
}
