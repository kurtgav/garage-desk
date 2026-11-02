// Job statuses and the staff/customer wording around them (PRD FR5, D-047…D-053).
// The database (transition_job) is the real guard; these lists only drive the UI.

export const JOB_STATUSES = [
  "new",
  "quoted",
  "declined",
  "approved",
  "in_progress",
  "ready",
  "collected",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const STATUS_LABEL: Record<JobStatus, string> = {
  new: "New",
  quoted: "Quoted",
  declined: "Declined",
  approved: "Approved",
  in_progress: "In progress",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
};

/** Final statuses: nothing changes after these. */
export const FINAL_STATUSES: readonly JobStatus[] = ["collected", "cancelled"];
/** "Open" for workload and lists: everything not final (declined still needs staff action). */
export const OPEN_STATUSES: readonly JobStatus[] = JOB_STATUSES.filter((s) => !FINAL_STATUSES.includes(s));
/** Line items can be added/edited/removed in these statuses (D-050). */
export const LINE_EDITABLE_STATUSES: readonly JobStatus[] = ["new", "quoted", "declined", "approved", "in_progress"];
/** A line change in these statuses creates a new quote version and needs a new approval (D-050). */
export const REQUOTE_ON_EDIT_STATUSES: readonly JobStatus[] = ["quoted", "approved", "in_progress"];
/** Statuses in which a customer link can be created or regenerated (D-053). */
export const LINKABLE_STATUSES: readonly JobStatus[] = ["quoted", "declined", "approved", "in_progress", "ready"];

export interface StaffTransition {
  to: JobStatus;
  label: string;
  /** Show a note field. */
  askNote?: boolean;
  /** The note must be filled (DB raises note_required otherwise). */
  noteRequired?: boolean;
  /** Only the owner sees this button (DB raises forbidden otherwise). */
  ownerOnly?: boolean;
  destructive?: boolean;
}

const CANCEL: StaffTransition = {
  to: "cancelled",
  label: "Cancel job",
  askNote: true,
  noteRequired: true,
  ownerOnly: true,
  destructive: true,
};

/**
 * Staff-side status buttons. Approval is not here: customers approve via the link and the
 * owner records phone approvals with their own form (D-051). Re-quotes after line changes
 * are automatic (D-050).
 */
export const STAFF_TRANSITIONS: Record<JobStatus, StaffTransition[]> = {
  new: [{ to: "quoted", label: "Send quote" }, CANCEL],
  quoted: [CANCEL],
  declined: [{ to: "quoted", label: "Send new quote" }, CANCEL],
  approved: [{ to: "in_progress", label: "Start work" }, CANCEL],
  in_progress: [{ to: "ready", label: "Mark ready for collection" }, CANCEL],
  ready: [
    { to: "collected", label: "Mark collected" },
    { to: "in_progress", label: "Back to work (rework)", askNote: true },
    CANCEL,
  ],
  collected: [],
  cancelled: [],
};

/** Customer-facing wording (public link). */
export const CUSTOMER_STATUS_TEXT: Record<JobStatus, string> = {
  new: "Your quote is being prepared",
  quoted: "Your quote is ready for approval",
  declined: "You declined this quote — the garage may send you a new one",
  approved: "Quote approved — work will start soon",
  in_progress: "Work in progress",
  ready: "Your car is ready for collection",
  collected: "Collected — thank you!",
  cancelled: "This job was cancelled",
};

export function isJobStatus(v: unknown): v is JobStatus {
  return typeof v === "string" && (JOB_STATUSES as readonly string[]).includes(v);
}
