"use client";

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
import { Select } from "@/components/ui/select";
import type { ActionResult, PickerOption } from "@/lib/data/types";
import { reassignJob } from "../actions";

type Props = { jobId: string; currentId: string; mechanics: PickerOption[] };

/** Owner only (job.can.reassign). */
export function ReassignMechanic({ jobId, currentId, mechanics }: Props) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await reassignJob(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 text-accent">
            Reassign
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={submitKeepingValues(dispatch)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Reassign the job</DialogTitle>
              <DialogDescription>The new mechanic sees the job; the current one no longer does.</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="job_id" value={jobId} />
            <Field id="reassign-mechanic" label="Mechanic">
              <Select name="assigned_mechanic_id" defaultValue={currentId} required>
                {mechanics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending}>
                Reassign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {state?.ok && !pending && (
        <p role="status" className="sr-only">
          Job reassigned.
        </p>
      )}
    </>
  );
}
