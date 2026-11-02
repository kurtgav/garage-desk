"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, PickerOption } from "@/lib/data/types";
import { createJob } from "../actions";

type FieldName = "vehicle_id" | "assigned_mechanic_id" | "description";
const REQUIRED: Record<FieldName, string> = {
  vehicle_id: "Choose the vehicle.",
  assigned_mechanic_id: "Choose the mechanic.",
  description: "Describe the work or the customer's complaint.",
};

type Props = {
  vehicles: PickerOption[];
  /** Owner: the mechanics to pick from. Mechanic: null, the job is theirs (D-054). */
  mechanics: PickerOption[] | null;
  defaultVehicleId?: string;
};

export function NewJobForm({ vehicles, mechanics, defaultVehicleId }: Props) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(createJob, null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});

  // Field errors are checked here; the server re-validates and its sentence shows in the alert.
  // Dispatching ourselves (no <form action>) keeps the typed values if the server says no.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fields = (Object.keys(REQUIRED) as FieldName[]).filter((k) => mechanics || k !== "assigned_mechanic_id");
    const missing = fields.filter((k) => !String(formData.get(k) ?? "").trim());
    setErrors(Object.fromEntries(missing.map((k) => [k, REQUIRED[k]])));
    if (missing.length > 0) {
      form.querySelector<HTMLElement>(`#${missing[0]}`)?.focus();
      return;
    }
    startTransition(() => dispatch(formData));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-2">
        <Field id="vehicle_id" label="Vehicle" error={errors.vehicle_id}>
          <Select name="vehicle_id" defaultValue={defaultVehicleId ?? ""} required>
            <option value="" disabled>
              Choose a vehicle
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Link
          href="/customers/new"
          className="inline-flex h-10 w-fit items-center gap-1.5 rounded-md text-sm font-medium text-accent hover:underline"
        >
          <UserPlus aria-hidden className="size-4" />
          New customer
        </Link>
      </div>

      {mechanics ? (
        <Field id="assigned_mechanic_id" label="Mechanic" error={errors.assigned_mechanic_id}>
          <Select name="assigned_mechanic_id" defaultValue="" required>
            <option value="" disabled>
              Choose a mechanic
            </option>
            {mechanics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div>
          <p className="text-sm font-medium text-ink">Mechanic</p>
          <p className="mt-1 text-sm text-muted">Assigned to you</p>
        </div>
      )}

      <Field
        id="description"
        label="What needs doing"
        hint="The customer's complaint or the work they asked for."
        error={errors.description}
      >
        <Textarea name="description" rows={4} required maxLength={2000} />
      </Field>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" loading={pending}>
          Create job
        </Button>
        <Link href="/jobs" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
