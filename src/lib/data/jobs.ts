import "server-only";
import { z } from "zod";
import { getStaff, requireOwner } from "@/lib/auth";
import { formatPlate } from "@/lib/format";
import type { JobStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import type { JobDetail, JobListItem, PickerOption } from "./types";

// All reads use the signed-in user's client: RLS decides what is visible (FR1).
// jobs has two FKs to profiles, so the mechanic embed names its FK.

const LIST_COLUMNS = `id, ref, status, description, created_at, quoted_total_cents,
  vehicle:vehicles(plate, make, model, customer:customers(full_name)),
  mechanic:profiles!jobs_assigned_mechanic_id_fkey(full_name)`;

/** Newest first. Mechanics only get their own jobs (RLS). */
export async function listJobs(opts?: { status?: JobStatus }): Promise<JobListItem[]> {
  const db = await createClient();
  let query = db.from("jobs").select(LIST_COLUMNS);
  if (opts?.status) query = query.eq("status", opts.status);
  const { data: jobs, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("Could not load jobs");

  // Live totals only for `new` jobs (D-011), one extra query for all of them.
  const newIds = jobs.filter((j) => j.status === "new").map((j) => j.id);
  const live = new Map<string, number>();
  if (newIds.length > 0) {
    const { data: totals, error: totalsError } = await db
      .from("job_totals")
      .select("job_id, total_cents")
      .in("job_id", newIds);
    if (totalsError) throw new Error("Could not load job totals");
    for (const t of totals) if (t.job_id) live.set(t.job_id, t.total_cents ?? 0);
  }

  return jobs.map((j) => ({
    id: j.id,
    ref: j.ref,
    status: j.status,
    description: j.description,
    customerName: j.vehicle.customer.full_name,
    plate: j.vehicle.plate,
    vehicleLabel: `${j.vehicle.make} ${j.vehicle.model}`,
    mechanicName: j.mechanic.full_name,
    totalCents: j.status === "new" ? (live.get(j.id) ?? 0) : (j.quoted_total_cents ?? 0),
    createdAt: j.created_at,
  }));
}

// job_links: explicit columns only — token_hash is not granted to clients (D-031).
// quantity::text keeps numeric(10,2) exact ("1.50").
const DETAIL_COLUMNS = `id, ref, status, description, vat_bps, created_at, quoted_at, approved_at, approved_total_cents,
  collected_at, quoted_subtotal_cents, quoted_vat_cents, quoted_total_cents, assigned_mechanic_id,
  vehicle:vehicles(id, plate, make, model, year, customer:customers(id, full_name, phone, email)),
  mechanic:profiles!jobs_assigned_mechanic_id_fkey(id, full_name),
  lines:job_line_items(id, kind, description, quantity::text, unit_price_cents, line_total_cents),
  events:job_events(id, from_status, to_status, actor_type, note, created_at, actor:profiles(full_name)),
  links:job_links(created_at, last_viewed_at)`;

const jobId = z.guid();

/** null when the id is malformed, the job does not exist, or RLS hides it (page calls notFound()). */
export async function getJob(id: string): Promise<JobDetail | null> {
  if (!jobId.safeParse(id).success) return null;
  const db = await createClient();
  const [staff, jobRes, totalsRes] = await Promise.all([
    getStaff(),
    db
      .from("jobs")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .is("links.revoked_at", null)
      .order("created_at", { referencedTable: "lines" })
      .order("id", { referencedTable: "lines" })
      .order("created_at", { referencedTable: "events" })
      .order("id", { referencedTable: "events" })
      .maybeSingle(),
    db.from("job_totals").select("subtotal_cents, vat_cents, total_cents").eq("job_id", id).maybeSingle(),
  ]);
  if (jobRes.error || totalsRes.error) throw new Error("Could not load the job");
  const j = jobRes.data;
  if (!j) return null;

  const live = totalsRes.data;
  const totals =
    j.status === "new"
      ? { subtotalCents: live?.subtotal_cents ?? 0, vatCents: live?.vat_cents ?? 0, totalCents: live?.total_cents ?? 0 }
      : {
          subtotalCents: j.quoted_subtotal_cents ?? 0,
          vatCents: j.quoted_vat_cents ?? 0,
          totalCents: j.quoted_total_cents ?? 0,
        };
  const link = j.links[0];

  return {
    id: j.id,
    ref: j.ref,
    status: j.status,
    description: j.description,
    vatBps: j.vat_bps,
    createdAt: j.created_at,
    quotedAt: j.quoted_at,
    approvedAt: j.approved_at,
    approvedTotalCents: j.approved_total_cents,
    collectedAt: j.collected_at,
    vehicle: { id: j.vehicle.id, plate: j.vehicle.plate, make: j.vehicle.make, model: j.vehicle.model, year: j.vehicle.year },
    customer: {
      id: j.vehicle.customer.id,
      fullName: j.vehicle.customer.full_name,
      phone: j.vehicle.customer.phone,
      email: j.vehicle.customer.email,
    },
    mechanic: { id: j.mechanic.id, fullName: j.mechanic.full_name },
    lines: j.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unit_price_cents,
      lineTotalCents: l.line_total_cents ?? 0,
    })),
    totals,
    events: j.events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actorType: e.actor_type,
      actorName: e.actor_type === "customer" ? "Customer" : (e.actor?.full_name ?? "Staff"),
      note: e.note,
      createdAt: e.created_at,
    })),
    link: link ? { createdAt: link.created_at, lastViewedAt: link.last_viewed_at } : null,
    canEditLines:
      j.status === "new" && !!staff && (staff.role === "owner" || staff.id === j.assigned_mechanic_id),
  };
}

/** Active mechanics for the "assign to" picker. Owner only. */
export async function listMechanicOptions(): Promise<PickerOption[]> {
  await requireOwner();
  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("role", "mechanic")
    .eq("active", true)
    .order("full_name");
  if (error) throw new Error("Could not load mechanics");
  return data.map((p) => ({ id: p.id, label: p.full_name }));
}

/** "ABC 1234 · Toyota Vios — Juan Cruz". Owner only. */
export async function listVehicleOptions(): Promise<PickerOption[]> {
  await requireOwner();
  const db = await createClient();
  const { data, error } = await db
    .from("vehicles")
    .select("id, plate, make, model, customer:customers(full_name)")
    .order("plate");
  if (error) throw new Error("Could not load vehicles");
  return data.map((v) => ({
    id: v.id,
    label: `${formatPlate(v.plate)} · ${v.make} ${v.model} — ${v.customer.full_name}`,
  }));
}
