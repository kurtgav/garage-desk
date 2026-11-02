// Phase 2 contract between the data layer (src/lib/data/*.ts, server actions)
// and the pages. Money is integer cents; quantities are strings like "1.50".
import type { JobStatus } from "@/lib/status";

/** Every server action returns this. `error` is a user-facing sentence, never a raw DB error. */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface JobListItem {
  id: string;
  ref: string;
  status: JobStatus;
  description: string;
  customerName: string;
  plate: string; // normalised; format with formatPlate()
  vehicleLabel: string; // "Toyota Vios"
  mechanicName: string;
  /** Live total while `new`, frozen quoted total afterwards. */
  totalCents: number;
  createdAt: string;
}

export interface JobLine {
  id: string;
  kind: "labour" | "part";
  description: string;
  quantity: string;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface JobEvent {
  id: number;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  actorType: "staff" | "customer";
  /** Staff full name, "Customer" for customer events. */
  actorName: string;
  note: string | null;
  createdAt: string;
}

export interface JobDetail {
  id: string;
  ref: string;
  status: JobStatus;
  description: string;
  vatBps: number;
  createdAt: string;
  quotedAt: string | null;
  approvedAt: string | null;
  approvedTotalCents: number | null;
  collectedAt: string | null;
  vehicle: { id: string; plate: string; make: string; model: string; year: number | null };
  customer: { id: string; fullName: string; phone: string; email: string | null };
  mechanic: { id: string; fullName: string };
  lines: JobLine[];
  /** Live from job_totals while `new`; frozen quoted_* afterwards. */
  totals: { subtotalCents: number; vatCents: number; totalCents: number };
  events: JobEvent[];
  /** Active customer link metadata (never the token). */
  link: { createdAt: string; lastViewedAt: string | null } | null;
  /** True when the viewer may edit lines (status new and owner/assigned mechanic). */
  canEditLines: boolean;
}

export interface PickerOption {
  id: string;
  label: string;
}

export interface Dashboard {
  countsByStatus: Record<JobStatus, number>;
  readyJobs: { id: string; ref: string; customerName: string; plate: string; totalCents: number; readySince: string; daysWaiting: number }[];
  revenue: { exclVatCents: number; inclVatCents: number; jobsCount: number; monthStart: string; monthEnd: string };
  workload: { mechanicId: string; mechanicName: string; totalOpen: number; byStatus: Partial<Record<JobStatus, number>> }[];
}

/*
 * Data functions (src/lib/data/jobs.ts, "server-only", RLS client):
 *   listJobs(opts?: { status?: JobStatus }): Promise<JobListItem[]>      // newest first
 *   getJob(id: string): Promise<JobDetail | null>                         // null → page calls notFound()
 *   listMechanicOptions(): Promise<PickerOption[]>                        // active mechanics, owner only
 *   listVehicleOptions(): Promise<PickerOption[]>                         // "ABC 1234 · Toyota Vios — Juan Cruz", owner only
 * (src/lib/data/dashboard.ts)
 *   getDashboard(): Promise<Dashboard>                                    // owner only (DB raises otherwise)
 *
 * Staff server actions (src/app/(staff)/jobs/actions.ts, "use server"), all re-check auth server-side,
 * validate with zod, map DB errors to sentences, revalidatePath the job page:
 *   createJob(prev, formData{vehicle_id, assigned_mechanic_id, description}) → redirects to /jobs/[id]
 *   addLine(prev, formData{job_id, kind, description, quantity, unit_price?})  // unit_price (pesos) for parts only
 *   updateLine(prev, formData{job_id, line_id, description, quantity, unit_price?})
 *   deleteLine(prev, formData{job_id, line_id})
 *   transitionJob(prev, formData{job_id, to_status, note?})
 *   createCustomerLink(prev, formData{job_id}): ActionResult<{ url: string }>  // full URL shown once
 *   revokeCustomerLink(prev, formData{job_id}): ActionResult                    // any status; already off → ok
 *
 * Public actions (src/app/[token]/actions.ts, "use server", admin client + rate limit):
 *   approveQuote(prev, formData{token, expected_total_cents}): ActionResult  // hidden input = quoted total_cents shown; mismatch → "quote changed"
 *   declineQuote(prev, formData{token, reason?}): ActionResult
 */
