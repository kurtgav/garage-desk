"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { staffErrorMessage } from "@/lib/data/errors";
import type { ActionResult } from "@/lib/data/types";
import { parsePesoToCents, parseQuantity } from "@/lib/money";
import { JOB_STATUSES } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import { generateLinkToken, hashLinkToken } from "@/lib/tokens";

// Every action re-checks auth here; the DB (RLS, triggers, transition_job) is the real guard.
// requireStaff() redirects to /login when the session is gone.

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

/** First zod issue message, or the parsed data. */
function parse<T extends z.ZodType>(schema: T, formData: FormData): { data: z.infer<T> } | Fail {
  const res = schema.safeParse(Object.fromEntries(formData));
  return res.success ? { data: res.data } : fail(res.error.issues[0]?.message ?? "Check the form and try again.");
}

const id = (what: string) => z.guid(`Choose a ${what}.`);
const jobIdField = z.guid("This job could not be found.");
const lineIdField = z.guid("This line could not be found.");
const text = (max: number) =>
  z
    .string("Enter a description.")
    .trim()
    .min(1, "Enter a description.")
    .max(max, `Keep the description to ${max.toLocaleString("en-PH")} characters or fewer.`);
const description = text(500);
const quantityField = z.string("Enter a quantity.");
const unitPriceField = z.string().optional();

const QUANTITY_ERROR = "Enter a quantity greater than 0, with up to 2 decimals (e.g. 1.5).";
const PRICE_ERROR = "Enter a valid unit price in pesos (e.g. 1250.50).";

function revalidateJob(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
}

const createJobSchema = z.object({
  vehicle_id: id("vehicle"),
  assigned_mechanic_id: id("mechanic"),
  description: text(2000),
});

export async function createJob(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (staff.role !== "owner") return fail("Only the owner can create jobs.");
  const input = parse(createJobSchema, formData);
  if ("ok" in input) return input;

  const db = await createClient();
  const { data, error } = await db.from("jobs").insert(input.data).select("id").single();
  if (error) return fail(staffErrorMessage(error, "Could not create the job. Check the vehicle and mechanic and try again."));

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect(`/jobs/${data.id}`); // throws NEXT_REDIRECT; no try/catch around it
}

const addLineSchema = z.object({
  job_id: jobIdField,
  kind: z.enum(["labour", "part"], "Choose labour or part."),
  description,
  quantity: quantityField,
  unit_price: unitPriceField,
});

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
    const cents = parsePesoToCents(input.data.unit_price ?? "");
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
    const cents = parsePesoToCents(input.data.unit_price);
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
  note: z.string().trim().max(500, "Keep the note to 500 characters or fewer.").optional(),
});

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
