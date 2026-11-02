import "server-only";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { staffErrorMessage } from "./errors";
import type { ActionResult, GarageSettings } from "./types";

/** Owner only (D-020: mechanics get the generic 404; RLS returns no row to them either). */
export async function getSettings(): Promise<GarageSettings> {
  await requireOwner();
  const db = await createClient();
  const { data, error } = await db
    .from("settings")
    .select("garage_name, garage_address, garage_phone, hourly_rate_cents, vat_bps")
    .eq("id", 1)
    .single();
  if (error || !data) throw new Error("Could not load the settings");
  return {
    garageName: data.garage_name,
    garageAddress: data.garage_address,
    garagePhone: data.garage_phone,
    hourlyRateCents: data.hourly_rate_cents,
    vatBps: data.vat_bps,
  };
}

/**
 * Through the caller's session, so RLS (settings_update: owner) and the column grant are the guard.
 * Existing lines keep their labour price and jobs their vat_bps (copied by DB triggers, FR4).
 */
export async function updateSettings(values: GarageSettings): Promise<ActionResult> {
  await requireOwner(); // defence in depth, like getSettings; cached per request
  const db = await createClient();
  const { data, error } = await db
    .from("settings")
    .update({
      garage_name: values.garageName,
      garage_address: values.garageAddress,
      garage_phone: values.garagePhone,
      hourly_rate_cents: values.hourlyRateCents,
      vat_bps: values.vatBps,
    })
    .eq("id", 1)
    .select("id");
  if (error) return { ok: false, error: staffErrorMessage(error, "Could not save the settings. Please try again.") };
  if (data.length === 0) return { ok: false, error: staffErrorMessage({ message: "forbidden" }) };
  return { ok: true };
}
