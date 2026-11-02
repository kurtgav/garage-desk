import { isJobStatus, type JobStatus } from "@/lib/status";

/** What /jobs shows. Undefined status = the "Open" tab. */
export type JobFilters = { status?: JobStatus; mechanicId?: string; thisMonth?: boolean };

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads ?status, ?mechanic and ?period from the URL; anything invalid is dropped, never an error.
 * `mechanic` is owner only (a mechanic's list is already theirs by RLS); `period=month` only goes with status=collected.
 */
export function parseJobFilters(params: Params, isOwner: boolean): JobFilters {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const status = isJobStatus(one("status")) ? (one("status") as JobStatus) : undefined;
  const mechanic = one("mechanic");
  return {
    status,
    mechanicId: isOwner && mechanic && UUID.test(mechanic) ? mechanic.toLowerCase() : undefined,
    thisMonth: status === "collected" && one("period") === "month" ? true : undefined,
  };
}

/** The /jobs URL for `f`. Same rules as parseJobFilters, so a link never carries a filter the page would drop. */
export function jobsHref(f: JobFilters): string {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status);
  if (f.status === "collected" && f.thisMonth) q.set("period", "month");
  if (f.mechanicId) q.set("mechanic", f.mechanicId);
  const s = q.toString();
  return s ? `/jobs?${s}` : "/jobs";
}
