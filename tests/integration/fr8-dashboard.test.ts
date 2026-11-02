import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";
import { JOB_STATUSES, type JobStatus, isJobStatus } from "@/lib/status";
import {
  type Db,
  type JobRow,
  type StaffUser,
  addLine,
  admin,
  advanceTo,
  cleanup,
  createCustomerWithVehicle,
  createJob,
  createLink,
  createStaff,
  customerTransition,
  getJob,
  mustTransition,
  restoreSettings,
  signInAs,
  unwrap,
} from "./helpers";

// Fixed clock in an otherwise empty month (D-005 / qa rules). Europe/Sofia: EET (UTC+2) from 26 Oct 2031.
const P_NOW = "2031-11-15T10:00:00Z"; // 15 Nov 2031, 12:00 Sofia
const OCT_NOW = "2031-10-20T10:00:00Z";
const DEC_NOW = "2031-12-10T10:00:00Z";

interface Dashboard {
  counts_by_status: unknown;
  ready_jobs: unknown[];
  revenue: { net_cents: number; jobs_count: number; month_start: string; month_end: string };
  workload: unknown[];
}

type Counts = Partial<Record<JobStatus, number>>;

/** Accepts `{status: n}`, `[{status, count}]`, or rows carrying a nested `{status: n}` map. */
function statusCounts(rows: unknown): Counts {
  const counts: Counts = {};
  const add = (s: unknown, n: unknown) => {
    if (isJobStatus(s) && typeof n === "number") counts[s] = (counts[s] ?? 0) + n;
  };
  for (const row of (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[]) {
    add(row.status, row.count);
    for (const [k, v] of Object.entries(row)) {
      add(k, v);
      if (v && typeof v === "object" && !Array.isArray(v)) for (const [s, n] of Object.entries(v)) add(s, n);
    }
  }
  return counts;
}

const delta = (after: Counts, before: Counts, s: JobStatus) => (after[s] ?? 0) - (before[s] ?? 0);

let ownerDb: Db;
let mechanic: StaffUser;
let vehicleId: string;

async function dashboard(pNow = P_NOW): Promise<Dashboard> {
  return unwrap(await ownerDb.rpc("get_dashboard", { p_now: pNow }), "get_dashboard") as Dashboard;
}

async function jobAt(target: JobStatus, unitPriceCents: number, collectedAt?: string): Promise<JobRow> {
  const job = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
  await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents });
  await advanceTo(ownerDb, job.id, target);
  if (collectedAt) unwrap(await admin.from("jobs").update({ collected_at: collectedAt }).eq("id", job.id).select(), "backdate");
  return getJob(job.id);
}

let before: Dashboard, after: Dashboard, octBefore: Dashboard, decBefore: Dashboard;
let counted: JobRow[], excluded: JobRow[];
let newJob: JobRow, readyJob: JobRow, declinedJob: JobRow, cancelledJob: JobRow;

beforeAll(async () => {
  const owner = await createStaff("owner");
  mechanic = await createStaff("mechanic", "Workload Mechanic");
  ownerDb = await signInAs(owner);
  await restoreSettings(); // VAT 20%
  vehicleId = (await createCustomerWithVehicle(admin)).vehicle.id;

  // Baselines (deltas tolerate leftovers from earlier runs in the same months).
  [before, octBefore, decBefore] = await Promise.all([dashboard(), dashboard(OCT_NOW), dashboard(DEC_NOW)]);
  counted = [
    await jobAt("collected", 100000, "2031-11-10T10:00:00Z"), // 10 Nov Sofia
    await jobAt("collected", 50050, "2031-10-31T22:30:00Z"), // 1 Nov 00:30 Sofia (still 31 Oct in UTC)
  ];
  excluded = [
    await jobAt("collected", 7000, "2031-10-31T21:30:00Z"), // 31 Oct 23:30 Sofia → last month
    await jobAt("collected", 3000, "2031-10-15T03:00:00Z"), // last month
    await jobAt("collected", 999, "2031-11-30T22:30:00Z"), // 1 Dec 00:30 Sofia → next month
  ];
  newJob = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
  readyJob = await jobAt("ready", 2500);

  // Declined by the customer: still open (workload), never revenue.
  declinedJob = await jobAt("quoted", 40000);
  const link = await createLink(ownerDb, declinedJob.id);
  declinedJob = unwrap(await customerTransition(declinedJob.id, "declined", link.hash, 1, "Too expensive"), "decline");
  // Approved, then cancelled by the owner: closed, never revenue.
  cancelledJob = await jobAt("approved", 60000);
  cancelledJob = await mustTransition(ownerDb, cancelledJob.id, "cancelled", "Customer sold the car");
  after = await dashboard();
});

afterAll(cleanup);

describe("FR8 AC: revenue = net (excl. VAT) of jobs collected this month (Europe/Sofia), hand-calculated", () => {
  it("net += €1,500.50 (100000 + 50050 cents) from 2 jobs", () => {
    expect(after.revenue.net_cents - before.revenue.net_cents).toBe(150050);
    expect(after.revenue.jobs_count - before.revenue.jobs_count).toBe(2);
  });

  it("matches the frozen approved_subtotal_cents of the counted jobs only", () => {
    const net = (jobs: JobRow[]) => jobs.reduce((acc, j) => acc + (j.approved_subtotal_cents ?? 0), 0);
    expect(net(counted)).toBe(150050);
    expect(excluded.every((j) => j.status === "collected" && j.approved_subtotal_cents)).toBe(true);
  });

  it("declined and cancelled jobs never count as revenue", () => {
    expect(declinedJob.status).toBe("declined");
    expect(cancelledJob).toMatchObject({ status: "cancelled", approved_subtotal_cents: 60000 });
    // Their 40000 / 60000 are absent from the exact +150050 delta above.
  });

  it("month boundary is midnight Sofia: month_start is 1 Nov 2031 00:00 local (22:00 UTC on 31 Oct)", () => {
    expect(Date.parse(after.revenue.month_start)).toBe(Date.parse("2031-10-31T22:00:00Z"));
    expect(Date.parse(after.revenue.month_end)).toBe(Date.parse("2031-11-30T22:00:00Z"));
    expect(formatDate(after.revenue.month_start)).toBe("1 Nov 2031");
  });

  it("the excluded jobs land in their own months (October and December)", async () => {
    const oct = await dashboard(OCT_NOW);
    const dec = await dashboard(DEC_NOW);
    expect(oct.revenue.net_cents - octBefore.revenue.net_cents).toBe(10000); // 7000 + 3000
    expect(dec.revenue.net_cents - decBefore.revenue.net_cents).toBe(999);
  });
});

describe("FR8: counts, ready list and mechanic workload", () => {
  it("counts_by_status has all 8 statuses and reflects the jobs created", () => {
    expect(Object.keys(after.counts_by_status as object).sort()).toEqual([...JOB_STATUSES].sort());
    const b = statusCounts(before.counts_by_status);
    const a = statusCounts(after.counts_by_status);
    expect(delta(a, b, "collected")).toBe(5);
    expect(delta(a, b, "new")).toBe(1);
    expect(delta(a, b, "ready")).toBe(1);
    expect(delta(a, b, "declined")).toBe(1);
    expect(delta(a, b, "cancelled")).toBe(1);
    for (const s of ["quoted", "approved", "in_progress"] as JobStatus[]) expect(delta(a, b, s)).toBe(0);
  });

  it("ready_jobs lists the ready job and none of the others", () => {
    expect(Array.isArray(after.ready_jobs)).toBe(true);
    const json = JSON.stringify(after.ready_jobs);
    expect(json.includes(readyJob.ref)).toBe(true);
    for (const j of [...counted, newJob, declinedJob, cancelledJob]) expect(json.includes(j.ref) || json.includes(j.id)).toBe(false);
  });

  it("workload counts open jobs per mechanic (declined is open; collected and cancelled are not)", () => {
    const mine = (after.workload as { mechanic_id: string; total_open: number; by_status: Counts }[]).find(
      (row) => row.mechanic_id === mechanic.id,
    );
    expect(mine).toBeDefined();
    expect(mine?.total_open).toBe(3); // new + ready + declined
    expect(mine?.by_status).toMatchObject({ new: 1, ready: 1, declined: 1, quoted: 0, approved: 0, in_progress: 0 });
    expect(Object.keys(mine?.by_status ?? {})).not.toContain("collected");
    expect(Object.keys(mine?.by_status ?? {})).not.toContain("cancelled");
  });
});
