export const JOB_STATUSES = ["new", "quoted", "approved", "in_progress", "ready", "collected"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const STATUS_LABEL: Record<JobStatus, string> = {
  new: "New",
  quoted: "Quoted",
  approved: "Approved",
  in_progress: "In progress",
  ready: "Ready",
  collected: "Collected",
};

/** Staff-side buttons. The DB (transition_job) is the real guard; this only drives the UI. */
export const STAFF_TRANSITIONS: Record<JobStatus, { to: JobStatus; label: string; askNote?: boolean }[]> = {
  new: [{ to: "quoted", label: "Send quote" }],
  quoted: [{ to: "new", label: "Revise quote", askNote: true }],
  approved: [{ to: "in_progress", label: "Start work" }],
  in_progress: [{ to: "ready", label: "Mark ready for collection" }],
  ready: [{ to: "collected", label: "Mark collected" }],
  collected: [],
};

/** Customer-facing wording (public link). */
export const CUSTOMER_STATUS_TEXT: Record<JobStatus, string> = {
  new: "Your quote is being revised",
  quoted: "Your quote is ready for approval",
  approved: "Quote approved — work will start soon",
  in_progress: "Work in progress",
  ready: "Your car is ready for collection",
  collected: "Collected — thank you!",
};

/** Statuses in which a customer link can be created or regenerated (D-015). */
export const LINKABLE_STATUSES: readonly JobStatus[] = ["quoted", "approved", "in_progress", "ready"];

export function isJobStatus(v: unknown): v is JobStatus {
  return typeof v === "string" && (JOB_STATUSES as readonly string[]).includes(v);
}
