import "server-only";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listJobs } from "./jobs";
import type { CustomerDetail, CustomerListItem } from "./types";

// All staff work with the customer directory (D-054); RLS is the guard.

type VehicleRow = { id: string; plate: string; make: string; model: string; year: number | null };
const byPlate = (a: VehicleRow, b: VehicleRow) => a.plate.localeCompare(b.plate);

/** Name, phone or plate (partial, case/spacing-insensitive, FR2). Empty query → newest 50. */
export async function searchCustomers(query: string): Promise<CustomerListItem[]> {
  await requireStaff();
  const db = await createClient();
  const q = query.trim();

  if (q === "") {
    const { data, error } = await db
      .from("customers")
      .select("id, full_name, phone, email, vehicles(id, plate, make, model, year)")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(50);
    if (error) throw new Error("Could not load customers");
    return data.map((c) => ({
      id: c.id,
      fullName: c.full_name,
      phone: c.phone,
      email: c.email,
      vehicles: [...c.vehicles].sort(byPlate),
    }));
  }

  const { data, error } = await db.rpc("search_customers", { p_query: q.slice(0, 100) });
  if (error) throw new Error("Could not search customers");
  return data.map((c) => ({
    id: c.id,
    fullName: c.full_name,
    phone: c.phone,
    email: c.email,
    vehicles: c.vehicles as unknown as VehicleRow[], // [{id, plate, make, model, year}] ordered by plate (D-031)
  }));
}

const customerId = z.guid();

/** null when the id is malformed or the customer does not exist (page calls notFound()). */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  if (!customerId.safeParse(id).success) return null;
  const staff = await requireStaff();
  const db = await createClient();
  const { data: c, error } = await db
    .from("customers")
    .select("id, full_name, phone, email, created_at, vehicles(id, plate, make, model, year)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load the customer");
  if (!c) return null;

  const vehicles = [...c.vehicles].sort(byPlate);
  // Mechanics only get their own jobs (RLS), so this lists what the viewer may open.
  const jobs = vehicles.length > 0 ? await listJobs({ vehicleIds: vehicles.map((v) => v.id) }) : [];

  return {
    id: c.id,
    fullName: c.full_name,
    phone: c.phone,
    email: c.email,
    createdAt: c.created_at,
    vehicles,
    jobs,
    canDelete: staff.role === "owner",
  };
}
