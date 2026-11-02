import "server-only";
import { z } from "zod";
import { getStaff, requireOwner, requireStaff } from "@/lib/auth";
import { formatPlate } from "@/lib/format";
import { FINAL_STATUSES, LINE_EDITABLE_STATUSES, LINKABLE_STATUSES, type JobStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import type { JobDetail, JobListItem, PickerOption } from "./types";

// All reads use the signed-in user's client: RLS decides what is visible (FR1).
// jobs has two FKs to profiles, so the mechanic embed names its FK.

type Db = Awaited<ReturnType<typeof createClient>>;

const LIST_COLUMNS = `id, ref, status, description, created_at,
  vehicle:vehicles(plate, make, model, customer:customers(full_name)),
  mechanic:profiles!jobs_assigned_mechanic_id_fkey(full_name)`;

/** Live totals (incl. VAT) of every job the viewer can see, by job id. */
async function liveTotals(db: Db): Promise<Map<string, number>> {
  const { data, error } = await db.from("job_totals").select("job_id, total_cents");
  if (error) throw new Error("Could not load job totals");
  return new Map(data.flatMap((t) => (t.job_id ? [[t.job_id, t.total_cents ?? 0] as const] : [])));
}

/**
 * Newest first. Mechanics only get their own jobs (RLS). `vehicleIds` narrows to those vehicles' jobs,
 * `mechanicId` to one assignee, `collectedFrom`/`collectedTo` to collected_at in [from, to).
 */
export async function listJobs(opts?: {
  status?: JobStatus;
  vehicleIds?: string[];
  mechanicId?: string;
  collectedFrom?: Date;
  collectedTo?: Date;
}): Promise<JobListItem[]> {
  const db = await createClient();
  let query = db.from("jobs").select(LIST_COLUMNS);
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.vehicleIds) query = query.in("vehicle_id", opts.vehicleIds);
  if (opts?.mechanicId) query = query.eq("assigned_mechanic_id", opts.mechanicId);
  if (opts?.collectedFrom) query = query.gte("collected_at", opts.collectedFrom.toISOString());
  if (opts?.collectedTo) query = query.lt("collected_at", opts.collectedTo.toISOString());
  const [{ data: jobs, error }, totals] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }),
    liveTotals(db),
  ]);
  if (error) throw new Error("Could not load jobs");

  return jobs.map((j) => ({
    id: j.id,
    ref: j.ref,
    status: j.status,
    description: j.description,
    customerName: j.vehicle.customer.full_name,
    plate: j.vehicle.plate,
    vehicleLabel: `${j.vehicle.make} ${j.vehicle.model}`,
    mechanicName: j.mechanic.full_name,
    totalCents: totals.get(j.id) ?? 0,
    createdAt: j.created_at,
  }));
}

// job_links: explicit columns only — token_hash is not granted to clients (D-031).
// quantity::text keeps numeric(10,2) exact ("1.50").
const DETAIL_COLUMNS = `id, ref, status, description, vat_bps, created_at, quote_version, quoted_at,
  approved_quote_version, approved_subtotal_cents, approved_vat_cents, approved_total_cents, approved_at,
  collected_at, assigned_mechanic_id,
  vehicle:vehicles(id, plate, make, model, year, customer:customers(id, full_name, phone, email)),
  mechanic:profiles!jobs_assigned_mechanic_id_fkey(id, full_name),
  lines:job_line_items(id, kind, description, quantity::text, unit_price_cents, line_total_cents),
  quotes:job_quotes(version, subtotal_cents, vat_cents, total_cents, created_at),
  events:job_events(id, from_status, to_status, actor_type, channel, quote_version, total_cents, note, created_at,
    actor:profiles(full_name)),
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
      .order("version", { referencedTable: "quotes", ascending: false })
      .order("created_at", { referencedTable: "events" })
      .order("id", { referencedTable: "events" })
      .maybeSingle(),
    db.from("job_totals").select("subtotal_cents, vat_cents, total_cents").eq("job_id", id).maybeSingle(),
  ]);
  if (jobRes.error || totalsRes.error) throw new Error("Could not load the job");
  const j = jobRes.data;
  if (!j) return null;

  const live = totalsRes.data;
  const link = j.links[0];
  const lastApproval = j.events.findLast((e) => e.to_status === "approved");
  const isOwner = staff?.role === "owner";
  const isFinal = FINAL_STATUSES.includes(j.status);

  return {
    id: j.id,
    ref: j.ref,
    status: j.status,
    description: j.description,
    vatBps: j.vat_bps,
    createdAt: j.created_at,
    quoteVersion: j.quote_version,
    quotedAt: j.quoted_at,
    approval:
      j.approved_quote_version !== null &&
      j.approved_subtotal_cents !== null &&
      j.approved_vat_cents !== null &&
      j.approved_total_cents !== null &&
      j.approved_at !== null
        ? {
            version: j.approved_quote_version,
            subtotalCents: j.approved_subtotal_cents,
            vatCents: j.approved_vat_cents,
            totalCents: j.approved_total_cents,
            at: j.approved_at,
            channel: lastApproval?.channel ?? "link",
          }
        : null,
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
      lineTotalCents: Number(l.line_total_cents ?? 0),
    })),
    totals: {
      subtotalCents: live?.subtotal_cents ?? 0,
      vatCents: live?.vat_cents ?? 0,
      totalCents: live?.total_cents ?? 0,
    },
    quotes: j.quotes.map((q) => ({
      version: q.version,
      subtotalCents: q.subtotal_cents,
      vatCents: q.vat_cents,
      totalCents: q.total_cents,
      createdAt: q.created_at,
    })),
    events: j.events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actorType: e.actor_type,
      actorName: e.actor_type === "customer" ? "Customer" : (e.actor?.full_name ?? "Staff"),
      channel: e.channel,
      quoteVersion: e.quote_version,
      totalCents: e.total_cents,
      note: e.note,
      createdAt: e.created_at,
    })),
    link: link ? { createdAt: link.created_at, lastViewedAt: link.last_viewed_at } : null,
    can: {
      editLines:
        LINE_EDITABLE_STATUSES.includes(j.status) && !!staff && (isOwner || staff.id === j.assigned_mechanic_id),
      recordPhoneApproval: isOwner && j.status === "quoted",
      cancel: isOwner && !isFinal,
      reassign: isOwner && !isFinal,
      createLink: LINKABLE_STATUSES.includes(j.status),
    },
  };
}

/** A mechanic's name for the /jobs filter chip (inactive ones too: their jobs stay). null if no such mechanic. */
export async function getMechanicName(id: string): Promise<string | null> {
  const db = await createClient();
  const { data } = await db.from("profiles").select("full_name").eq("id", id).eq("role", "mechanic").maybeSingle();
  return data?.full_name ?? null;
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

/** "CA 1234 AB · Toyota Corolla — Ivan Georgiev". All staff (D-054). */
export async function listVehicleOptions(): Promise<PickerOption[]> {
  await requireStaff();
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
