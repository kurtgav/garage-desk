import "server-only";
import { cache } from "react";
import type { Staff } from "@/lib/auth";
import { OPEN_STATUSES, type JobStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import { getDashboard } from "./dashboard";

/** What the app frame shows on every staff page (sidebar counts, recent jobs, info card). */
export interface ShellData {
  /** Open (non-final) jobs the viewer can see. Mechanics: their own (RLS). */
  openCount: number;
  readyCount: number;
  /** Newest 4 jobs the viewer can see. */
  recentJobs: { id: string; ref: string; plate: string; status: JobStatus }[];
  /** Owner only: net revenue this month (D-056). Null for mechanics. */
  revenueNetCents: number | null;
}

/** One get_dashboard call per request, shared by the frame and the dashboard page. */
export const getDashboardCached = cache(getDashboard);

/**
 * All reads use the signed-in user's client, so RLS decides visibility (FR1): a mechanic's counts
 * and recent jobs only cover their own jobs. The queries run in parallel (one round trip).
 */
export async function getShellData(staff: Staff): Promise<ShellData> {
  const db = await createClient();
  const recentQuery = db
    .from("jobs")
    .select("id, ref, status, vehicle:vehicles(plate)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(4);

  const [recent, counts] = await Promise.all([
    recentQuery,
    staff.role === "owner" ? ownerCounts() : ownCounts(db),
  ]);
  if (recent.error) throw new Error("Could not load recent jobs");

  return {
    ...counts,
    recentJobs: recent.data.map((j) => ({ id: j.id, ref: j.ref, plate: j.vehicle.plate, status: j.status })),
  };
}

type Counts = Omit<ShellData, "recentJobs">;

async function ownerCounts(): Promise<Counts> {
  const d = await getDashboardCached();
  return {
    openCount: OPEN_STATUSES.reduce((sum, s) => sum + (d.countsByStatus[s] ?? 0), 0),
    readyCount: d.countsByStatus.ready ?? 0,
    revenueNetCents: d.revenue.netCents,
  };
}

async function ownCounts(db: Awaited<ReturnType<typeof createClient>>): Promise<Counts> {
  // Open jobs are a short list (a workshop's live work), so their statuses are counted here.
  const { data, error } = await db.from("jobs").select("status").in("status", [...OPEN_STATUSES]);
  if (error) throw new Error("Could not load job counts");
  return {
    openCount: data.length,
    readyCount: data.filter((j) => j.status === "ready").length,
    revenueNetCents: null,
  };
}
