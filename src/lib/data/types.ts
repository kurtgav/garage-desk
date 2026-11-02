// Contract between the data layer (src/lib/data/*.ts, server actions) and the pages.
// Phase 2.5 (client answers, D-047…D-056). Money: job/quote totals are integer cents;
// line totals are EXACT cents and may be fractional (5687.5 = €56.875, D-048).
// Quantities are strings like "1.50".
import type { JobStatus } from "@/lib/status";

/** Every server action returns this. `error` is a user-facing sentence, never a raw DB error. */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type ApprovalChannel = "link" | "phone";

export interface JobListItem {
  id: string;
  ref: string;
  status: JobStatus;
  description: string;
  customerName: string;
  plate: string; // normalised; format with formatPlate()
  vehicleLabel: string; // "Toyota Corolla"
  mechanicName: string;
  /** Live total incl. VAT from job_totals. */
  totalCents: number;
  createdAt: string;
}

export interface JobLine {
  id: string;
  kind: "labour" | "part";
  description: string;
  quantity: string;
  unitPriceCents: number;
  /** Exact, may be fractional cents. Display with formatLineAmount(). */
  lineTotalCents: number;
}

export interface JobEvent {
  id: number;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  actorType: "staff" | "customer";
  /** Staff full name, "Customer" for customer events. */
  actorName: string;
  /** Approvals only: "link" (customer clicked) or "phone" (owner recorded it). */
  channel: ApprovalChannel | null;
  /** Quote version this event refers to (quotes, re-quotes, approvals). */
  quoteVersion: number | null;
  /** Quote total (incl. VAT) this event refers to. */
  totalCents: number | null;
  note: string | null;
  createdAt: string;
}

export interface QuoteVersionSummary {
  version: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  createdAt: string;
}

export interface JobDetail {
  id: string;
  ref: string;
  status: JobStatus;
  description: string;
  vatBps: number;
  createdAt: string;
  /** Current quote version, null before the first quote. */
  quoteVersion: number | null;
  quotedAt: string | null;
  /** Latest approval (may be for an older version after extra work). */
  approval: {
    version: number;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
    at: string;
    channel: ApprovalChannel;
  } | null;
  collectedAt: string | null;
  vehicle: { id: string; plate: string; make: string; model: string; year: number | null };
  customer: { id: string; fullName: string; phone: string; email: string | null };
  mechanic: { id: string; fullName: string };
  lines: JobLine[];
  /** Live from job_totals (equals the current quote once quoted, D-050). */
  totals: { subtotalCents: number; vatCents: number; totalCents: number };
  /** All quote versions, newest first. */
  quotes: QuoteVersionSummary[];
  events: JobEvent[];
  /** Active customer link metadata (never the token). */
  link: { createdAt: string; lastViewedAt: string | null } | null;
  /** Viewer permissions (UI only; the DB is the guard). */
  can: {
    editLines: boolean; // status in LINE_EDITABLE_STATUSES and owner/assigned mechanic
    recordPhoneApproval: boolean; // owner and status quoted
    cancel: boolean; // owner and status not collected/cancelled
    reassign: boolean; // owner and status not collected/cancelled
    createLink: boolean; // status in LINKABLE_STATUSES
  };
}

export interface PickerOption {
  id: string;
  label: string;
}

export interface CustomerListItem {
  id: string;
  fullName: string;
  phone: string; // digits, format with formatPhone()
  email: string | null;
  vehicles: { id: string; plate: string; make: string; model: string; year: number | null }[];
}

export interface CustomerDetail extends CustomerListItem {
  createdAt: string;
  /** Jobs the viewer may see (owner: all; mechanic: assigned to them). */
  jobs: JobListItem[];
  canDelete: boolean; // owner only
}

export interface Dashboard {
  countsByStatus: Record<JobStatus, number>;
  readyJobs: { id: string; ref: string; customerName: string; plate: string; totalCents: number; readySince: string; daysWaiting: number }[];
  /** Net (excl. VAT) of jobs marked collected this month, Europe/Sofia (D-056). */
  revenue: { netCents: number; jobsCount: number; monthStart: string; monthEnd: string };
  workload: { mechanicId: string; mechanicName: string; totalOpen: number; byStatus: Partial<Record<JobStatus, number>> }[];
}

/*
 * Data functions ("server-only", RLS client):
 *   src/lib/data/jobs.ts
 *     listJobs(opts?: { status?: JobStatus }): Promise<JobListItem[]>   // newest first; mechanics see their own
 *     getJob(id: string): Promise<JobDetail | null>                      // null → page calls notFound()
 *     listMechanicOptions(): Promise<PickerOption[]>                     // active mechanics, owner only
 *     listVehicleOptions(): Promise<PickerOption[]>                      // all staff: "CA 1234 AB · Toyota Corolla — Ivan Georgiev"
 *   src/lib/data/customers.ts
 *     searchCustomers(query: string): Promise<CustomerListItem[]>        // all staff; name/phone/plate, empty query → newest 50
 *     getCustomer(id: string): Promise<CustomerDetail | null>
 *   src/lib/data/dashboard.ts
 *     getDashboard(): Promise<Dashboard>                                 // owner only (DB raises otherwise)
 *
 * Staff server actions ("use server"; re-check auth, zod, map DB errors to sentences, revalidatePath):
 *   src/app/(staff)/jobs/actions.ts
 *     createJob(prev, formData{vehicle_id, assigned_mechanic_id?, description}) → redirect /jobs/[id]
 *                                         // mechanics: assigned_mechanic_id ignored, DB assigns them (D-054)
 *     reassignJob(prev, formData{job_id, assigned_mechanic_id})          // owner only
 *     addLine(prev, formData{job_id, kind, description, quantity, unit_price?})   // unit_price (EUR, excl. VAT) parts only
 *     updateLine(prev, formData{job_id, line_id, description, quantity, unit_price?})
 *     deleteLine(prev, formData{job_id, line_id})
 *                                         // line changes on quoted/approved/in_progress create a new quote version (D-050)
 *     transitionJob(prev, formData{job_id, to_status, note?})            // send quote / re-quote / start / ready / rework / collected / cancel (note required)
 *     recordPhoneApproval(prev, formData{job_id, expected_version, note})  // owner only, note required (D-051)
 *     createCustomerLink(prev, formData{job_id}): ActionResult<{ url: string }>  // full URL shown once
 *     revokeCustomerLink(prev, formData{job_id}): ActionResult                    // any status; already off → ok
 *   src/app/(staff)/customers/actions.ts
 *     createCustomer(prev, formData{full_name, phone, email?, plate, make, model, year?}) → redirect /customers/[id]  // customer + first vehicle
 *     updateCustomer(prev, formData{customer_id, full_name, phone, email?})
 *     addVehicle(prev, formData{customer_id, plate, make, model, year?})
 *     updateVehicle(prev, formData{vehicle_id, plate, make, model, year?})
 *     deleteCustomer(prev, formData{customer_id})                       // owner only; fails if the customer has jobs
 *
 * Public actions (src/app/[token]/actions.ts, "use server", admin client + rate limit):
 *   approveQuote(prev, formData{token, expected_version}): ActionResult  // hidden input = quote version shown; mismatch → "quote changed"
 *   declineQuote(prev, formData{token, expected_version, reason?}): ActionResult
 */
