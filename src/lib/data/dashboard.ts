import "server-only";
import { requireOwner } from "@/lib/auth";
import type { JobStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import type { Dashboard } from "./types";

/** Shape of get_dashboard()'s JSON (D-027, D-056). */
interface DashboardJson {
  counts_by_status: Record<JobStatus, number>;
  ready_jobs: {
    id: string;
    ref: string;
    customer_name: string;
    plate: string;
    total_cents: number;
    ready_since: string;
    days_waiting: number;
  }[];
  revenue: { net_cents: number; jobs_count: number; month_start: string; month_end: string };
  workload: { mechanic_id: string; mechanic_name: string; total_open: number; by_status: Partial<Record<JobStatus, number>> }[];
}

/** Owner only (D-020: mechanics get the 404; the DB raises `forbidden` too). */
export async function getDashboard(): Promise<Dashboard> {
  await requireOwner();
  const db = await createClient();
  const { data, error } = await db.rpc("get_dashboard");
  if (error || !data) throw new Error("Could not load the dashboard");
  const d = data as unknown as DashboardJson;
  return {
    countsByStatus: d.counts_by_status,
    readyJobs: d.ready_jobs.map((r) => ({
      id: r.id,
      ref: r.ref,
      customerName: r.customer_name,
      plate: r.plate,
      totalCents: r.total_cents,
      readySince: r.ready_since,
      daysWaiting: r.days_waiting,
    })),
    revenue: {
      netCents: d.revenue.net_cents,
      jobsCount: d.revenue.jobs_count,
      monthStart: d.revenue.month_start,
      monthEnd: d.revenue.month_end,
    },
    workload: d.workload.map((w) => ({
      mechanicId: w.mechanic_id,
      mechanicName: w.mechanic_name,
      totalOpen: w.total_open,
      byStatus: w.by_status,
    })),
  };
}
