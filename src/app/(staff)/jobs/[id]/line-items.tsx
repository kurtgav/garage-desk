"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { submitKeepingValues } from "@/components/form-submit";
import { Money } from "@/components/money";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionResult, JobLine } from "@/lib/data/types";
import { centsToInput, formatLineAmount, formatQuantity } from "@/lib/money";
import { cn } from "@/lib/utils";
import { addLine, deleteLine, updateLine } from "../actions";

const KIND_LABEL = { labour: "Labour", part: "Part" } as const;

/** Line items; Edit/Delete only while the viewer may edit (job.can.editLines from the server). */
export function LineItems({
  jobId,
  lines,
  canEdit,
}: {
  jobId: string;
  lines: JobLine[];
  canEdit: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteState, deleteAction, deleting] = useActionState<
    ActionResult | null,
    FormData
  >(deleteLine, null);

  if (lines.length === 0) {
    return (
      <div className="px-5">
        <EmptyState
          title="No lines yet"
          description={
            canEdit
              ? "Add labour and parts below. The quote can be sent once it has a line."
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <>
      {deleteState && !deleteState.ok && !deleting && (
        <Alert tone="danger" className="mx-5 mb-3">
          {deleteState.error}
        </Alert>
      )}
      {/* Inset so the header band sits inside the card like the dashboard tables. */}
      <div className="px-3 pb-2 sm:px-4">
        <Table
          label={canEdit ? undefined : "Line items"}
          className="[&_td]:px-3 [&_th]:px-3"
        >
          <TableCaption className="sr-only">Line items</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Kind</TableHead>
              <TableHead scope="col" className="w-full">
                Description
              </TableHead>
              <TableHead scope="col" className="text-right">
                Qty
              </TableHead>
              <TableHead scope="col" className="text-right">
                Unit price
              </TableHead>
              <TableHead scope="col" className="text-right">
                Line total
              </TableHead>
              {canEdit && (
                <TableHead scope="col">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) =>
              canEdit && editingId === line.id ? (
                <TableRow key={line.id} className="bg-ground">
                  <TableCell colSpan={6} className="py-4">
                    <LineForm
                      jobId={jobId}
                      line={line}
                      onDone={() => setEditingId(null)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={line.id}>
                  <TableCell className="text-muted">
                    {KIND_LABEL[line.kind]}
                  </TableCell>
                  <TableCell className="min-w-40 text-ink">
                    {line.description}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatQuantity(line.quantity)}
                    {line.kind === "labour" && (
                      <span className="text-muted"> h</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Money cents={line.unitPriceCents} />
                    {line.kind === "labour" && (
                      <span className="text-muted">/h</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    {/* Exact, never rounded per line (D-048): may show 3–4 decimals. */}
                    {formatLineAmount(line.lineTotalCents)}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="size-9 px-0 text-muted hover:text-ink"
                          title="Edit"
                          aria-label={`Edit ${line.description}`}
                          onClick={() => setEditingId(line.id)}
                        >
                          <Pencil aria-hidden strokeWidth={1.5} />
                        </Button>
                        <form action={deleteAction}>
                          <input type="hidden" name="job_id" value={jobId} />
                          <input type="hidden" name="line_id" value={line.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="size-9 px-0 text-danger hover:bg-danger-soft"
                            title="Delete"
                            disabled={deleting}
                            aria-label={`Delete ${line.description}`}
                          >
                            <Trash2 aria-hidden strokeWidth={1.5} />
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** Add form (no `line`) or inline edit form. Labour sends hours only; the DB copies the rate from settings. */
export function LineForm({
  jobId,
  line,
  onDone,
}: {
  jobId: string;
  line?: JobLine;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<JobLine["kind"]>(line?.kind ?? "labour");
  const [state, dispatch, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await (line ? updateLine : addLine)(prev, formData);
    if (result.ok) {
      if (line) onDone?.();
      else formRef.current?.reset();
    }
    return result;
  }, null);

  const id = line ? `line-${line.id}` : "new-line";
  const isLabour = kind === "labour";

  return (
    <form
      ref={formRef}
      onSubmit={submitKeepingValues(dispatch)}
      className="grid gap-3"
    >
      <input type="hidden" name="job_id" value={jobId} />
      {line && <input type="hidden" name="line_id" value={line.id} />}

      <div className="flex flex-wrap items-start gap-3">
        {!line && (
          <Field id={`${id}-kind`} label="Kind" className="w-32">
            <Select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as JobLine["kind"])}
            >
              <option value="labour">Labour</option>
              <option value="part">Part</option>
            </Select>
          </Field>
        )}
        <Field
          id={`${id}-description`}
          label="Description"
          className="min-w-48 flex-1"
        >
          <Input
            name="description"
            required
            maxLength={500}
            autoComplete="off"
            defaultValue={line?.description}
          />
        </Field>
        <Field
          id={`${id}-quantity`}
          label={isLabour ? "Hours" : "Quantity"}
          hint={isLabour ? "Rate from settings" : undefined}
          className="w-36"
        >
          <Input
            name="quantity"
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={line ? formatQuantity(line.quantity) : undefined}
          />
        </Field>
        {!isLabour && (
          <Field
            id={`${id}-price`}
            label="Unit price"
            hint="Excl. VAT"
            className="w-36"
          >
            <Input
              name="unit_price"
              inputMode="decimal"
              autoComplete="off"
              required
              defaultValue={
                line ? centsToInput(line.unitPriceCents) : undefined
              }
            />
          </Field>
        )}
        <div
          className={cn(
            "flex gap-2 sm:pt-7",
            !line && "basis-full sm:basis-auto",
          )}
        >
          <Button type="submit" loading={pending}>
            {line ? "Save" : "Add line"}
          </Button>
          {line && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {state && !pending && !state.ok && (
        <Alert tone="danger">{state.error}</Alert>
      )}
      {state?.ok && !pending && !line && (
        <Alert tone="success">Line added.</Alert>
      )}
    </form>
  );
}
