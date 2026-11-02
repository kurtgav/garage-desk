"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { staffErrorMessage } from "@/lib/data/errors";
import type { ActionResult } from "@/lib/data/types";
import { fail, optionalText, parseForm as parse } from "@/lib/form";
import { parseMoneyToCents, parseQuantity } from "@/lib/money";
import { JOB_STATUSES } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import { generateLinkToken, hashLinkToken } from "@/lib/tokens";

// Every action re-checks auth here; the DB (RLS, triggers, transition_job) is the real guard.
// requireStaff() redirects to /login when the session is gone.

const id = (what: string) => z.guid(`Choose a ${what}.`);
const jobIdField = z.guid("This job could not be found.");
const lineIdField = z.guid("This line could not be found.");
const text = (max: number) =>
  z
    .string("Enter a description.")
    .trim()
    .min(1, "Enter a description.")
    .max(max, `Keep the description to ${max.toLocaleString("en-IE")} characters or fewer.`);
const description = text(500);
const quantityField = z.string("Enter a quantity.");
const unitPriceField = z.string().optional();
const noteField = optionalText(500, "Keep the note to 500 characters or fewer.");
const requiredNote = (message: string) =>
  z.string(message).trim().min(1, message).max(500, "Keep the note to 500 characters or fewer.");
const versionField = z.coerce
  .number("This quote could not be found. Refresh the page.")
  .int("This quote could not be found. Refresh the page.")
  .positive("This quote could not be found. Refresh the page.");

const QUANTITY_ERROR = "Enter a quantity greater than 0, with up to 2 decimals (e.g. 1.5).";
const PRICE_ERROR = "Enter a valid unit price in euros, excluding VAT (e.g. 45.50).";

function revalidateJob(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
}

const createJobSchema = z.object({
  vehicle_id: id("vehicle"),
  assigned_mechanic_id: id("mechanic").optional(),
  description: text(2000),
});

/** Mechanics: the job is always theirs; the DB forces it too (D-054). */
export async function createJob(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  const input = parse(createJobSchema, formData);
  if ("ok" in input) return input;
  const assigned = staff.role === "mechanic" ? staff.id : input.data.assigned_mechanic_id;
  if (!assigned) return fail("Choose a mechanic.");

  const db = await createClient();
  const { data, error } = await db
    .from("jobs")
    .insert({ vehicle_id: input.data.vehicle_id, assigned_mechanic_id: assigned, description: input.data.description })
    .select("id")
    .single();
  if (error) return fail(staffErrorMessage(error, "Could not create the job. Check the vehicle and mechanic and try again."));

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect(`/jobs/${data.id}`); // throws NEXT_REDIRECT; no try/catch around it
}

const reassignSchema = z.object({ job_id: jobIdField, assigned_mechanic_id: id("mechanic") });

/** Owner only (D-054). */
export async function reassignJob(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (staff.role !== "owner") return fail(staffErrorMessage({ message: "forbidden" }));
  const input = parse(reassignSchema, formData);
  if ("ok" in input) return input;
  const { job_id, assigned_mechanic_id } = input.data;

  const db = await createClient();
  const { data, error } = await db.from("jobs").update({ assigned_mechanic_id }).eq("id", job_id).select("id");
  if (error) return fail(staffErrorMessage(error, "Could not reassign the job. Please try again."));
  if (data.length === 0) return fail(staffErrorMessage({ message: "not_found" }));

  revalidateJob(job_id);
  return { ok: true };
}

const addLineSchema = z.object({
  job_id: jobIdField,
  kind: z.enum(["labour", "part"], "Choose labour or part."),
  description,
  quantity: quantityField,
  unit_price: unitPriceField,
});

/** On a quoted/approved/in-progress job the DB re-quotes as a new version (D-050). */
export async function addLine(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(addLineSchema, formData);
  if ("ok" in input) return input;
  const { job_id, kind, description: desc } = input.data;

  const quantity = parseQuantity(input.data.quantity);
  if (!quantity) return fail(QUANTITY_ERROR);
  // Labour: the DB trigger copies the hourly rate from settings (D-031); the client value is ignored.
  let unitPriceCents = 0;
  if (kind === "part") {
    const cents = parseMoneyToCents(input.data.unit_price ?? "");
    if (cents === null) return fail(PRICE_ERROR);
    unitPriceCents = cents;
  }

  const db = await createClient();
  const { error } = await db.from("job_line_items").insert({
    job_id,
    kind,
    description: desc,
    quantity: Number(quantity), // parseQuantity caps at 8+2 digits: Number() round-trips exactly to numeric(10,2)
    unit_price_cents: unitPriceCents,
  });
  if (error) return fail(staffErrorMessage(error, "Could not add the line. Please try again."));

  revalidateJob(job_id);
  return { ok: true };
}

const updateLineSchema = z.object({
  job_id: jobIdField,
  line_id: lineIdField,
  description,
  quantity: quantityField,
  unit_price: unitPriceField,
});

/** unit_price is only sent for part lines; a labour line keeps its rate snapshot (DB trigger). */
export async function updateLine(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(updateLineSchema, formData);
  if ("ok" in input) return input;
  const { job_id, line_id, description: desc } = input.data;

  const quantity = parseQuantity(input.data.quantity);
  if (!quantity) return fail(QUANTITY_ERROR);
  let unitPriceCents: number | undefined;
  if (input.data.unit_price !== undefined) {
    const cents = parseMoneyToCents(input.data.unit_price);
    if (cents === null) return fail(PRICE_ERROR);
    unitPriceCents = cents;
  }

  const db = await createClient();
  const { data, error } = await db
    .from("job_line_items")
    .update({
      description: desc,
      quantity: Number(quantity),
      ...(unitPriceCents === undefined ? {} : { unit_price_cents: unitPriceCents }),
    })
    .eq("id", line_id)
    .eq("job_id", job_id)
    .select("id");
  if (error) return fail(staffErrorMessage(error, "Could not update the line. Please try again."));
  // RLS hides rows silently: zero rows means missing or not yours.
  if (data.length === 0) return fail("This line no longer exists. Refresh the page.");

  revalidateJob(job_id);
  return { ok: true };
}

const deleteLineSchema = z.object({ job_id: jobIdField, line_id: lineIdField });

export async function deleteLine(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(deleteLineSchema, formData);
  if ("ok" in input) return input;
  const { job_id, line_id } = input.data;

  const db = await createClient();
  const { data, error } = await db
    .from("job_line_items")
    .delete()
    .eq("id", line_id)
    .eq("job_id", job_id)
    .select("id");
  if (error) return fail(staffErrorMessage(error, "Could not delete the line. Please try again."));
  if (data.length === 0) return fail("This line no longer exists. Refresh the page.");

  revalidateJob(job_id);
  return { ok: true };
}

const transitionSchema = z.object({
  job_id: jobIdField,
  to_status: z.enum(JOB_STATUSES, "Choose a valid status."),
  note: noteField,
});

/** Send quote / re-quote / start / ready / rework / collected / cancel (owner, note required). */
export async function transitionJob(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(transitionSchema, formData);
  if ("ok" in input) return input;
  const { job_id, to_status, note } = input.data;

  const db = await createClient();
  const { error } = await db.rpc("transition_job", {
    p_job_id: job_id,
    p_to_status: to_status,
    ...(note ? { p_note: note } : {}),
  });
  if (error) return fail(staffErrorMessage(error, "Could not change the status. Please try again."));

  revalidateJob(job_id);
  return { ok: true };
}

const phoneApprovalSchema = z.object({
  job_id: jobIdField,
  expected_version: versionField,
  note: requiredNote("Add a note about the phone call (who approved, when)."),
});

/** Owner only, note required, for the version the owner saw (D-051). */
export async function recordPhoneApproval(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (staff.role !== "owner") return fail(staffErrorMessage({ message: "forbidden" }));
  const input = parse(phoneApprovalSchema, formData);
  if ("ok" in input) return input;
  const { job_id, expected_version, note } = input.data;

  const db = await createClient();
  const { error } = await db.rpc("transition_job", {
    p_job_id: job_id,
    p_to_status: "approved",
    p_note: note,
    p_expected_version: expected_version,
  });
  if (error) return fail(staffErrorMessage(error, "Could not record the approval. Please try again."));

  revalidateJob(job_id);
  return { ok: true };
}

const linkSchema = z.object({ job_id: jobIdField });

/** NEXT_PUBLIC_SITE_URL, else the request's own origin. */
async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** Creates (or regenerates) the customer link. The raw token exists only in this response (FR6, D-013). */
export async function createCustomerLink(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  await requireStaff();
  const input = parse(linkSchema, formData);
  if ("ok" in input) return input;
  const { job_id } = input.data;

  const token = generateLinkToken();
  const db = await createClient();
  const { error } = await db.rpc("create_job_link", { p_job_id: job_id, p_token_hash: hashLinkToken(token) });
  if (error) return fail(staffErrorMessage(error, "Could not create the customer link. Please try again."));

  revalidatePath(`/jobs/${job_id}`);
  return { ok: true, url: `${await siteUrl()}/${token}` };
}

/** Switches off the active customer link in any status. Already off is fine (double submit). */
export async function revokeCustomerLink(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(linkSchema, formData);
  if ("ok" in input) return input;
  const { job_id } = input.data;

  const db = await createClient();
  const { error } = await db.rpc("revoke_job_link", { p_job_id: job_id });
  if (error) return fail(staffErrorMessage(error, "Could not turn off the customer link. Please try again."));

  revalidatePath(`/jobs/${job_id}`);
  return { ok: true };
}
