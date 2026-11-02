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
import { isJobStatus, STAFF_TRANSITIONS, STATUS_LABEL, type JobStatus, type StaffTransition } from "@/lib/status";
import { transitionJob } from "../actions";

type Result = ActionResult<{ message: string }>;

type Props = { jobId: string; status: JobStatus; hasLines: boolean; isOwner: boolean };

/** The job's next step(s) from STAFF_TRANSITIONS. The DB (transition_job) is the real guard. */
export function StatusActions({ jobId, status, hasLines, isOwner }: Props) {
  const [dialogFor, setDialogFor] = useState<JobStatus | null>(null);
  const [submitted, setSubmitted] = useState<JobStatus | null>(null);
  const [state, dispatch, pending] = useActionState<Result | null, FormData>(async (prev, formData) => {
    const result = await transitionJob(prev, formData);
    if (!result.ok) return result;
    setDialogFor(null);
    const to = formData.get("to_status");
    return { ok: true, message: `Status changed to ${isJobStatus(to) ? STATUS_LABEL[to] : "the next step"}.` };
  }, null);

  const transitions = STAFF_TRANSITIONS[status].filter((t) => isOwner || !t.ownerOnly);
  const error = state && !state.ok && !pending ? state.error : null;
  const needsLines = (t: StaffTransition) => t.to === "quoted" && !hasLines;
  const submit = (t: StaffTransition) => {
    const send = submitKeepingValues(dispatch);
    return (event: React.FormEvent<HTMLFormElement>) => {
      setSubmitted(t.to);
      send(event);
    };
  };

  return (
    <div className="grid w-full gap-3 sm:w-auto sm:justify-items-end">
      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {transitions.map((t) =>
            t.askNote ? (
              <Dialog key={t.to} open={dialogFor === t.to} onOpenChange={(open) => setDialogFor(open ? t.to : null)}>
                <DialogTrigger asChild>
                  <Button
                    variant={t.destructive ? "ghost" : "secondary"}
                    className={t.destructive ? "text-danger hover:bg-danger-soft" : undefined}
                    disabled={pending}
                  >
                    {t.label}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={submit(t)} className="grid gap-4">
                    <DialogHeader>
                      <DialogTitle>{t.label}?</DialogTitle>
                      <DialogDescription>
                        {t.destructive
                          ? "This is final: the job cannot be reopened and never counts as revenue. The customer's link will say the job was cancelled."
                          : `The job moves to ${STATUS_LABEL[t.to]}.`}
                      </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="to_status" value={t.to} />
                    <Field
                      id={`note-${t.to}`}
                      label={t.noteRequired ? "Reason" : "Note (optional)"}
                      hint="Shown on the job's timeline, not to the customer."
                    >
                      <Textarea name="note" maxLength={500} required={t.noteRequired} />
                    </Field>
                    {error && <Alert tone="danger">{error}</Alert>}
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="secondary">
                          Keep as {STATUS_LABEL[status]}
                        </Button>
                      </DialogClose>
                      <Button type="submit" variant={t.destructive ? "danger" : "primary"} loading={pending}>
                        {t.label}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            ) : (
              <form key={t.to} onSubmit={submit(t)}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="to_status" value={t.to} />
                <Button
                  type="submit"
                  loading={pending && submitted === t.to}
                  disabled={pending || needsLines(t)}
                >
                  {t.label}
                </Button>
              </form>
            ),
          )}
        </div>
      )}

      {transitions.some(needsLines) && <p className="text-sm text-muted">Add at least one line to send the quote.</p>}
      {status === "quoted" && (
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <Clock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
          Waiting for the customer&apos;s approval
        </p>
      )}

      {error && dialogFor === null && <Alert tone="danger">{error}</Alert>}
      {state?.ok && !pending && <Alert tone="success">{state.message}</Alert>}
    </div>
  );
}
