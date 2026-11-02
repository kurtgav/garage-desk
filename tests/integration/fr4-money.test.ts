import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatCents } from "@/lib/money";
import {
  type Db,
  type StaffUser,
  addLine,
  admin,
  cleanup,
  createCustomerWithVehicle,
  createJob,
  createStaff,
  getJob,
  jobTotals,
  linesFor,
  mustTransition,
  restoreSettings,
  setSettings,
  signInAs,
} from "./helpers";

let ownerDb: Db;
let mechanic: StaffUser;
let vehicleId: string;

const newJob = () => createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });

beforeAll(async () => {
  const owner = await createStaff("owner");
  mechanic = await createStaff("mechanic");
  ownerDb = await signInAs(owner);
  vehicleId = (await createCustomerWithVehicle(admin)).vehicle.id;
});

afterAll(async () => {
  await restoreSettings();
  await cleanup();
});

describe("FR4 AC2: 1.5h × ₱800 + 2 × ₱1,250.50 @ 12% → subtotal ₱3,701.00, VAT ₱444.12, total ₱4,145.12", () => {
  it("live totals (compute_job_totals + job_totals view) and frozen quoted_* match", async () => {
    await setSettings(admin, { hourly_rate_cents: 80000, vat_bps: 1200 });
    const job = await newJob();
    expect(job.vat_bps).toBe(1200);
    const labour = await addLine(ownerDb, { jobId: job.id, kind: "labour", quantity: "1.5", description: "Brake service" });
    const part = await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 2, unitPriceCents: 125050, description: "Brake pads" });
    expect(labour.unit_price_cents).toBe(80000);
    expect(labour.line_total_cents).toBe(120000);
    expect(part.line_total_cents).toBe(250100);

    const expected = { subtotal_cents: 370100, vat_cents: 44412, total_cents: 414512 };
    expect(await jobTotals(ownerDb, job.id)).toEqual(expected);
    const view = await ownerDb.from("job_totals").select("subtotal_cents, vat_cents, total_cents").eq("job_id", job.id).single();
    expect(view.error).toBeNull();
    expect(view.data).toEqual(expected);

    const quoted = await mustTransition(ownerDb, job.id, "quoted");
    expect(quoted.status).toBe("quoted");
    expect(quoted.quoted_subtotal_cents).toBe(370100);
    expect(quoted.quoted_vat_cents).toBe(44412);
    expect(quoted.quoted_total_cents).toBe(414512);
    expect(quoted.quoted_at).not.toBeNull();
    expect(formatCents(quoted.quoted_total_cents)).toBe("₱4,145.12");
  });
});

describe("FR4 AC1: changing the rate or VAT never changes existing lines or jobs", () => {
  it("quoted at ₱800/h, rate → ₱1,000/h: quote and line unchanged; new labour lines use ₱1,000/h; vat_bps snapshot kept", async () => {
    await setSettings(admin, { hourly_rate_cents: 80000, vat_bps: 1200 });
    const quotedJob = await newJob();
    await addLine(ownerDb, { jobId: quotedJob.id, kind: "labour", quantity: 1 });
    const quoted = await mustTransition(ownerDb, quotedJob.id, "quoted");
    expect(quoted.quoted_total_cents).toBe(89600); // 80000 + 12%

    const openJob = await newJob(); // still `new`, already has an ₱800 line
    const oldLine = await addLine(ownerDb, { jobId: openJob.id, kind: "labour", quantity: 1 });
    expect(oldLine.unit_price_cents).toBe(80000);

    // FR9: the owner changes settings through their own session.
    await setSettings(ownerDb, { hourly_rate_cents: 100000, vat_bps: 1000 });

    const after = await getJob(quotedJob.id);
    expect(after.quoted_subtotal_cents).toBe(80000);
    expect(after.quoted_total_cents).toBe(89600);
    expect(after.vat_bps).toBe(1200);
    expect(await linesFor(quotedJob.id)).toMatchObject([{ unit_price_cents: 80000, line_total_cents: 80000 }]);
    expect(await jobTotals(ownerDb, quotedJob.id)).toEqual({ subtotal_cents: 80000, vat_cents: 9600, total_cents: 89600 });

    // Existing line on an open job keeps its snapshot; a line added now uses the new rate.
    expect((await linesFor(openJob.id)).find((l) => l.id === oldLine.id)?.unit_price_cents).toBe(80000);
    expect((await addLine(ownerDb, { jobId: openJob.id, kind: "labour", quantity: 1 })).unit_price_cents).toBe(100000);
    expect((await getJob(openJob.id)).vat_bps).toBe(1200);

    const freshJob = await newJob();
    expect(freshJob.vat_bps).toBe(1000);
    const freshLine = await addLine(ownerDb, { jobId: freshJob.id, kind: "labour", quantity: 1 });
    expect(freshLine.unit_price_cents).toBe(100000);
    expect(freshLine.line_total_cents).toBe(100000);
  });

  it("a labour unit price sent by the client is ignored (copied from settings)", async () => {
    await setSettings(admin, { hourly_rate_cents: 80000, vat_bps: 1200 });
    const job = await newJob();
    const line = await addLine(ownerDb, { jobId: job.id, kind: "labour", quantity: 2, unitPriceCents: 1 });
    expect(line.unit_price_cents).toBe(80000);
    expect(line.line_total_cents).toBe(160000);

    // A later update cannot change the snapshot either.
    await ownerDb.from("job_line_items").update({ unit_price_cents: 1 }).eq("id", line.id);
    expect((await linesFor(job.id))[0]).toMatchObject({ unit_price_cents: 80000, line_total_cents: 160000 });
  });
});

describe("FR4: rounding is half away from zero", () => {
  it.each([
    ["0.50", 1, 1], // 0.5 → 1
    ["2.50", 1, 3], // 2.5 → 3 (banker's would give 2)
    ["1.50", 1, 2],
    ["0.01", 50, 1], // 0.5 → 1
    ["0.33", 150, 50], // 49.5 → 50
    ["0.33", 100, 33],
    ["0.33", 3, 1], // 0.99 → 1
    ["1.25", 333, 416], // 416.25 → 416
  ])("line %s × %d cents → %d", async (quantity, unitPriceCents, expected) => {
    const job = await newJob();
    const line = await addLine(ownerDb, { jobId: job.id, kind: "part", quantity, unitPriceCents });
    expect(line.line_total_cents).toBe(expected);
  });

  it("VAT is rounded once on the subtotal: 5 × ₱0.04 @ 12.5% → VAT 3 (not 5 per line, not 2 banker's)", async () => {
    await setSettings(admin, { vat_bps: 1250 });
    const job = await newJob();
    for (let i = 0; i < 5; i++) await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 4 });
    expect(await jobTotals(ownerDb, job.id)).toEqual({ subtotal_cents: 20, vat_cents: 3, total_cents: 23 });
    await setSettings(admin, { vat_bps: 1200 });
  });

  it("subtotal is the sum of rounded line totals", async () => {
    await setSettings(admin, { vat_bps: 1200 });
    const job = await newJob();
    for (const [quantity, unitPriceCents] of [
      ["0.50", 1],
      ["2.50", 1],
      ["0.33", 150],
      ["0.33", 100],
      ["0.33", 3],
      ["1.25", 333],
    ] as const) {
      await addLine(ownerDb, { jobId: job.id, kind: "part", quantity, unitPriceCents });
    }
    // 1 + 3 + 50 + 33 + 1 + 416 = 504; VAT 60.48 → 60
    expect(await jobTotals(ownerDb, job.id)).toEqual({ subtotal_cents: 504, vat_cents: 60, total_cents: 564 });
  });
});
