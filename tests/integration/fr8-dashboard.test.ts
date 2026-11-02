import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";
import { type JobStatus, isJobStatus } from "@/lib/status";
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
  createStaff,
  getJob,
  restoreSettings,
  signInAs,
  unwrap,
} from "./helpers";

// Fixed clock in an otherwise empty month (D-005 / qa rules). Manila is UTC+8, no DST.
const P_NOW = "2031-11-15T04:00:00Z"; // 15 Nov 2031, 12:00 Manila
const OCT_NOW = "2031-10-20T04:00:00Z";
const DEC_NOW = "2031-12-10T04:00:00Z";

interface Dashboard {
  counts_by_status: unknown;
  ready_jobs: unknown[];
  revenue: { excl_vat_cents: number; incl_vat_cents: number; month_start: string; month_end: string };
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
let newJob: JobRow, readyJob: JobRow;

beforeAll(async () => {
  const owner = await createStaff("owner");
  mechanic = await createStaff("mechanic", "Workload Mechanic");
  ownerDb = await signInAs(owner);
  await restoreSettings(); // VAT 12%
  vehicleId = (await createCustomerWithVehicle(admin)).vehicle.id;

  // Baselines (deltas tolerate leftovers from earlier runs in the same months).
  [before, octBefore, decBefore] = await Promise.all([dashboard(), dashboard(OCT_NOW), dashboard(DEC_NOW)]);
  counted = [
    await jobAt("collected", 100000, "2031-11-10T02:00:00Z"), // 10 Nov Manila
    await jobAt("collected", 50050, "2031-10-31T16:30:00Z"), // 1 Nov 00:30 Manila (still 31 Oct in UTC)
  ];
  excluded = [
    await jobAt("collected", 7000, "2031-10-31T15:30:00Z"), // 31 Oct 23:30 Manila → last month
    await jobAt("collected", 3000, "2031-10-15T03:00:00Z"), // last month
    await jobAt("collected", 999, "2031-11-30T16:30:00Z"), // 1 Dec 00:30 Manila → next month
  ];
  newJob = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
  readyJob = await jobAt("ready", 2500);
  after = await dashboard();
});

afterAll(cleanup);

describe("FR8 AC: revenue includes only jobs collected this month (Asia/Manila), hand-calculated", () => {
  it("excl VAT += ₱1,500.50 and incl VAT += ₱1,680.56 (100000 + 50050 cents; VAT 12%)", () => {
    // Hand calculation: 100000 → VAT 12000 → 112000; 50050 → VAT 6006 → 56056.
    expect(after.revenue.excl_vat_cents - before.revenue.excl_vat_cents).toBe(150050);
    expect(after.revenue.incl_vat_cents - before.revenue.incl_vat_cents).toBe(168056);
  });

  it("matches the frozen quoted_* of the counted jobs only", () => {
    const sum = (jobs: JobRow[], k: "quoted_subtotal_cents" | "quoted_total_cents") =>
      jobs.reduce((acc, j) => acc + (j[k] ?? 0), 0);
    expect(sum(counted, "quoted_subtotal_cents")).toBe(150050);
    expect(sum(counted, "quoted_total_cents")).toBe(168056);
    expect(excluded.every((j) => j.status === "collected" && j.quoted_total_cents)).toBe(true);
  });

  it("month boundary is midnight Manila: month_start is 1 Nov 2031 local", () => {
    const start = formatDate(after.revenue.month_start);
    expect(start).toMatch(/Nov/);
    expect(start).toMatch(/\b1\b/);
    expect(start).toMatch(/2031/);
    expect(Date.parse(after.revenue.month_end)).toBeGreaterThan(Date.parse(after.revenue.month_start));
  });

  it("the excluded jobs land in their own months (October and December)", async () => {
    const oct = await dashboard(OCT_NOW);
    const dec = await dashboard(DEC_NOW);
    // October: 7000 + 3000 = 10000, VAT 840 + 360 → 11200. December: 999, VAT 119.88 → 120 → 1119.
    expect(oct.revenue.excl_vat_cents - octBefore.revenue.excl_vat_cents).toBe(10000);
    expect(oct.revenue.incl_vat_cents - octBefore.revenue.incl_vat_cents).toBe(11200);
    expect(dec.revenue.excl_vat_cents - decBefore.revenue.excl_vat_cents).toBe(999);
    expect(dec.revenue.incl_vat_cents - decBefore.revenue.incl_vat_cents).toBe(1119);
  });
});

describe("FR8: counts, ready list and mechanic workload", () => {
  it("counts_by_status reflects the jobs created (+5 collected, +1 new, +1 ready)", () => {
    const b = statusCounts(before.counts_by_status);
    const a = statusCounts(after.counts_by_status);
    expect(delta(a, b, "collected")).toBe(5);
    expect(delta(a, b, "new")).toBe(1);
    expect(delta(a, b, "ready")).toBe(1);
    for (const s of ["quoted", "approved", "in_progress"] as JobStatus[]) expect(delta(a, b, s)).toBe(0);
  });

  it("ready_jobs lists the ready job and none of the collected ones", () => {
    expect(Array.isArray(after.ready_jobs)).toBe(true);
    const json = JSON.stringify(after.ready_jobs);
    expect(json.includes(readyJob.ref) || json.includes(readyJob.id)).toBe(true);
    for (const j of [...counted, newJob]) expect(json.includes(j.ref) || json.includes(j.id)).toBe(false);
  });

  it("workload counts only open jobs per mechanic, by status", () => {
    expect(Array.isArray(after.workload)).toBe(true);
    const mine = (after.workload as Record<string, unknown>[]).filter((row) => Object.values(row).includes(mechanic.id));
    expect(mine.length).toBeGreaterThan(0);
    const counts = statusCounts(mine);
    expect(counts.new).toBe(1);
    expect(counts.ready).toBe(1);
    expect(counts.collected ?? 0).toBe(0);
  });
});
