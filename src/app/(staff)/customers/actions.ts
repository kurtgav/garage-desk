"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { staffErrorMessage } from "@/lib/data/errors";
import type { ActionResult } from "@/lib/data/types";
import { fail, parseForm as parse } from "@/lib/form";
import { formatPlate, normalisePhone, normalisePlate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// Customers and vehicles (FR2, D-054): all active staff create and edit; only the owner deletes.
// The DB normalises phone/plate again in triggers and RLS is the real guard.

const PG_UNIQUE = "23505";
const PG_FK = "23503";

const customerIdField = z.guid("This customer could not be found.");
const vehicleIdField = z.guid("This vehicle could not be found.");
const name = (what: string, max: number) =>
  z
    .string(`Enter the ${what}.`)
    .trim()
    .min(1, `Enter the ${what}.`)
    .max(max, `Keep the ${what} to ${max} characters or fewer.`);
const phoneField = z
  .string("Enter a phone number.")
  .transform(normalisePhone)
  .refine((d) => /^\d{6,15}$/.test(d), "Enter a phone number with 6 to 15 digits (e.g. 0881 234 567).");
const emailField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
  z.email("Enter a valid email address, or leave it empty.").max(200).optional(),
);
const plateField = z
  .string("Enter the plate.")
  .transform(normalisePlate)
  .refine((p) => /^[A-Z0-9]{2,10}$/.test(p), "Enter the plate with Latin letters and digits only (e.g. CA 4521 KM).");
const yearField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce
    .number("Enter the year as a number, or leave it empty.")
    .int("Enter the year as a number, or leave it empty.")
    .min(1900, "Enter a year between 1900 and 2100.")
    .max(2100, "Enter a year between 1900 and 2100.")
    .optional(),
);

const customerFields = { full_name: name("customer's name", 200), phone: phoneField, email: emailField };
const vehicleFields = { plate: plateField, make: name("make", 60), model: name("model", 60), year: yearField };

/** Vehicle write errors: a duplicate plate gets its own sentence. */
function vehicleError(error: { message?: string; code?: string }, plate: string, fallback: string): string {
  if (error.code === PG_UNIQUE) return `A vehicle with plate ${formatPlate(plate)} already exists. Search for it instead.`;
  return staffErrorMessage(error, fallback);
}

function revalidateCustomer(customerId: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

const createCustomerSchema = z.object({ ...customerFields, ...vehicleFields });

/** Customer + first vehicle, atomically (create_customer). */
export async function createCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(createCustomerSchema, formData);
  if ("ok" in input) return input;
  const c = input.data;

  const db = await createClient();
  const { data: id, error } = await db.rpc("create_customer", {
    p_full_name: c.full_name,
    p_phone: c.phone,
    p_plate: c.plate,
    p_make: c.make,
    p_model: c.model,
    ...(c.email ? { p_email: c.email } : {}),
    ...(c.year ? { p_year: c.year } : {}),
  });
  if (error) return fail(vehicleError(error, c.plate, "Could not create the customer. Please try again."));

  revalidatePath("/customers");
  redirect(`/customers/${id}`); // throws NEXT_REDIRECT
}

const updateCustomerSchema = z.object({ customer_id: customerIdField, ...customerFields });

export async function updateCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(updateCustomerSchema, formData);
  if ("ok" in input) return input;
  const { customer_id, full_name, phone, email } = input.data;

  const db = await createClient();
  const { data, error } = await db
    .from("customers")
    .update({ full_name, phone, email: email ?? null })
    .eq("id", customer_id)
    .select("id");
  if (error) return fail(staffErrorMessage(error, "Could not save the customer. Please try again."));
  if (data.length === 0) return fail("This customer no longer exists. Refresh the page.");

  revalidateCustomer(customer_id);
  return { ok: true };
}

const addVehicleSchema = z.object({ customer_id: customerIdField, ...vehicleFields });

export async function addVehicle(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(addVehicleSchema, formData);
  if ("ok" in input) return input;
  const { customer_id, plate, make, model, year } = input.data;

  const db = await createClient();
  const { error } = await db.from("vehicles").insert({ customer_id, plate, make, model, year: year ?? null });
  if (error) {
    if (error.code === PG_FK) return fail("This customer no longer exists. Refresh the page.");
    return fail(vehicleError(error, plate, "Could not add the vehicle. Please try again."));
  }

  revalidateCustomer(customer_id);
  return { ok: true };
}

const updateVehicleSchema = z.object({ vehicle_id: vehicleIdField, ...vehicleFields });

export async function updateVehicle(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const input = parse(updateVehicleSchema, formData);
  if ("ok" in input) return input;
  const { vehicle_id, plate, make, model, year } = input.data;

  const db = await createClient();
  const { data, error } = await db
    .from("vehicles")
    .update({ plate, make, model, year: year ?? null })
    .eq("id", vehicle_id)
    .select("customer_id");
  if (error) return fail(vehicleError(error, plate, "Could not save the vehicle. Please try again."));
  if (data.length === 0) return fail("This vehicle no longer exists. Refresh the page.");

  revalidateCustomer(data[0].customer_id);
  revalidatePath("/jobs", "layout"); // job pages show the plate
  return { ok: true };
}

const deleteCustomerSchema = z.object({ customer_id: customerIdField });

/** Owner only. Takes the customer's vehicles with it; refused while any vehicle has jobs. */
export async function deleteCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (staff.role !== "owner") return fail(staffErrorMessage({ message: "forbidden" }));
  const input = parse(deleteCustomerSchema, formData);
  if ("ok" in input) return input;
  const { customer_id } = input.data;

  const db = await createClient();
  const { data, error } = await db.from("customers").delete().eq("id", customer_id).select("id");
  if (error?.code === PG_FK) return fail("This customer has jobs, so they can't be deleted.");
  if (error) return fail(staffErrorMessage(error, "Could not delete the customer. Please try again."));
  if (data.length === 0) return fail("This customer no longer exists. Refresh the page.");

  revalidatePath("/customers");
  redirect("/customers");
}
