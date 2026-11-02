"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { staffErrorMessage } from "@/lib/data/errors";
import { updateSettings } from "@/lib/data/settings";
import type { ActionResult } from "@/lib/data/types";
import { fail, parseForm } from "@/lib/form";
import { parseMoneyToCents, percentToBps } from "@/lib/money";

// FR9, owner only. The DB (RLS + column grant) is the real guard; the role check gives a clear message.

const RATE_ERROR = "Enter the hourly rate in euros, excluding VAT, above 0 (e.g. 45.00).";
const VAT_ERROR = "Enter VAT as a percentage from 0 to 100, with up to 2 decimals (e.g. 20).";

const text = (what: string, max: number) =>
  z
    .string(`Enter the ${what}.`)
    .trim()
    .min(1, `Enter the ${what}.`)
    .max(max, `Keep the ${what} to ${max} characters or fewer.`);

const settingsSchema = z.object({
  hourly_rate: z.string(RATE_ERROR).transform(parseMoneyToCents).pipe(z.number(RATE_ERROR).positive(RATE_ERROR)),
  vat_percent: z.string(VAT_ERROR).transform(percentToBps).pipe(z.number(VAT_ERROR)),
  garage_name: text("garage name", 100),
  garage_address: text("address", 200),
  garage_phone: text("phone number", 30),
});

export async function saveSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (staff.role !== "owner") return fail(staffErrorMessage({ message: "forbidden" }));
  const input = parseForm(settingsSchema, formData);
  if ("ok" in input) return input;
  const s = input.data;

  const result = await updateSettings({
    garageName: s.garage_name,
    garageAddress: s.garage_address,
    garagePhone: s.garage_phone,
    hourlyRateCents: s.hourly_rate,
    vatBps: s.vat_percent,
  });
  if (result.ok) revalidatePath("/settings");
  return result;
}
