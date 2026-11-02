import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatCents, formatLineAmount } from "@/lib/money";
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
  quotesFor,
  restoreSettings,
  setSettings,
  signInAs,
} from "./helpers";

// FR4 / D-048: line amounts exact, net = round(Σ lines), VAT = round(Σ lines × bps), total = net + VAT.

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

describe("FR4 AC2: 1.25 h × €45.50 + 0.5 × €12.25 @ 20% → net €63.00, VAT €12.60, total €75.60", () => {
  it("lines are stored exactly; live totals, the job_totals view and the frozen quote agree", async () => {
    await setSettings(admin, { hourly_rate_cents: 4550, vat_bps: 2000 });
    const job = await newJob();
    expect(job.vat_bps).toBe(2000);
    const labour = await addLine(ownerDb, { jobId: job.id, kind: "labour", quantity: "1.25", description: "Brake service" });
    const part = await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: "0.5", unitPriceCents: 1225, description: "Brake fluid" });
    expect(labour.unit_price_cents).toBe(4550);
    expect(Number(labour.line_total_cents)).toBe(5687.5); // €56.875, not rounded per line
    expect(Number(part.line_total_cents)).toBe(612.5);
    expect(formatLineAmount(labour.line_total_cents)).toBe("€56.875");

    const expected = { subtotal_cents: 6300, vat_cents: 1260, total_cents: 7560 };
    expect(await jobTotals(ownerDb, job.id)).toEqual(expected);
    const view = await ownerDb.from("job_totals").select("subtotal_cents, vat_cents, total_cents").eq("job_id", job.id).single();
    expect(view.error).toBeNull();
    expect(view.data).toEqual(expected);

    const quoted = await mustTransition(ownerDb, job.id, "quoted");
    expect(quoted).toMatchObject({ status: "quoted", quote_version: 1, quoted_subtotal_cents: 6300, quoted_vat_cents: 1260, quoted_total_cents: 7560 });
    expect([formatCents(6300), formatCents(1260), formatCents(7560)]).toEqual(["€63.00", "€12.60", "€75.60"]);

    // Rounding each line first would give 5688 + 613 = €63.01.
    expect(Math.round(5687.5) + Math.round(612.5)).toBe(6301);

    const [v1] = await quotesFor(job.id);
    expect(v1).toMatchObject({ version: 1, subtotal_cents: 6300, vat_cents: 1260, total_cents: 7560, vat_bps: 2000 });
    expect(v1.lines.map((l) => [l.description, l.quantity, l.unit_price_cents, Number(l.line_total_cents)])).toEqual([
      ["Brake service", "1.25", 4550, 5687.5],
      ["Brake fluid", "0.50", 1225, 612.5],
    ]);
  });
});

describe("FR4 AC3: 0.75 h × €45.50 (= €34.125) @ 20% → net €34.13, VAT €6.83 (exact €6.825), total €40.96", () => {
  it("each figure is rounded once, half away from zero", async () => {
    await setSettings(admin, { hourly_rate_cents: 4550, vat_bps: 2000 });
    const job = await newJob();
    const line = await addLine(ownerDb, { jobId: job.id, kind: "labour", quantity: "0.75" });
    expect(Number(line.line_total_cents)).toBe(3412.5);
    expect(await jobTotals(ownerDb, job.id)).toEqual({ subtotal_cents: 3413, vat_cents: 683, total_cents: 4096 });
    expect(formatCents(4096)).toBe("€40.96");
  });
});

describe("FR4 AC1: changing the rate or VAT never changes existing lines, quotes or jobs", () => {
  it("quoted at €40.00/h, rate → €45.00/h: quote and line unchanged; new labour lines use €45.00/h", async () => {
    await setSettings(admin, { hourly_rate_cents: 4000, vat_bps: 2000 });
    const quotedJob = await newJob();
    await addLine(ownerDb, { jobId: quotedJob.id, kind: "labour", quantity: 1 });
    const quoted = await mustTransition(ownerDb, quotedJob.id, "quoted");
    expect(quoted.quoted_total_cents).toBe(4800); // €40.00 + 20%

    const openJob = await newJob(); // still `new`, already has a €40.00 line
    const oldLine = await addLine(ownerDb, { jobId: openJob.id, kind: "labour", quantity: 1 });
    expect(oldLine.unit_price_cents).toBe(4000);

    // FR9: the owner changes settings through their own session.
    await setSettings(ownerDb, { hourly_rate_cents: 4500, vat_bps: 1000 });

    const after = await getJob(quotedJob.id);
    expect(after).toMatchObject({ quoted_subtotal_cents: 4000, quoted_total_cents: 4800, vat_bps: 2000, quote_version: 1 });
    expect(await linesFor(quotedJob.id)).toMatchObject([{ unit_price_cents: 4000 }]);
    expect(await jobTotals(ownerDb, quotedJob.id)).toEqual({ subtotal_cents: 4000, vat_cents: 800, total_cents: 4800 });
    expect(await quotesFor(quotedJob.id)).toMatchObject([{ version: 1, total_cents: 4800, vat_bps: 2000 }]);

    // Existing line on an open job keeps its snapshot; a line added now uses the new rate.
    expect((await linesFor(openJob.id)).find((l) => l.id === oldLine.id)?.unit_price_cents).toBe(4000);
    expect((await addLine(ownerDb, { jobId: openJob.id, kind: "labour", quantity: 1 })).unit_price_cents).toBe(4500);
    expect((await getJob(openJob.id)).vat_bps).toBe(2000);

    const freshJob = await newJob();
    expect(freshJob.vat_bps).toBe(1000);
    const freshLine = await addLine(ownerDb, { jobId: freshJob.id, kind: "labour", quantity: 1 });
    expect(freshLine.unit_price_cents).toBe(4500);
    expect(Number(freshLine.line_total_cents)).toBe(4500);
  });

  it("a labour unit price sent by the client is ignored (copied from settings)", async () => {
    await setSettings(admin, { hourly_rate_cents: 4500, vat_bps: 2000 });
    const job = await newJob();
    const line = await addLine(ownerDb, { jobId: job.id, kind: "labour", quantity: 2, unitPriceCents: 1 });
    expect(line.unit_price_cents).toBe(4500);
    expect(Number(line.line_total_cents)).toBe(9000);

    // A later update cannot change the snapshot either.
    await ownerDb.from("job_line_items").update({ unit_price_cents: 1 }).eq("id", line.id);
    expect((await linesFor(job.id))[0]).toMatchObject({ unit_price_cents: 4500 });
  });
});

describe("FR4: rounding happens once, at the end, half away from zero", () => {
  it.each([
    ["0.50", 1, 1], // €0.005 → 1 cent
    ["2.50", 1, 3], // 2.5 → 3 (banker's would give 2)
    ["0.01", 50, 1], // 0.5 → 1
    ["0.33", 150, 50], // 49.5 → 50
    ["1.25", 333, 416], // 416.25 → 416
  ])("one line %s × %d cents → net %d", async (quantity, unitPriceCents, net) => {
    await setSettings(admin, { vat_bps: 2000 });
    const job = await newJob();
    await addLine(ownerDb, { jobId: job.id, kind: "part", quantity, unitPriceCents });
    expect((await jobTotals(ownerDb, job.id)).subtotal_cents).toBe(net);
  });

  it("VAT comes from the exact sum: 5 × €0.04 @ 12.5% → VAT 3 (2.5 rounded once, not 5 per line, not 2 banker's)", async () => {
    await setSettings(admin, { vat_bps: 1250 });
    const job = await newJob();
    for (let i = 0; i < 5; i++) await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 4 });
    expect(await jobTotals(ownerDb, job.id)).toEqual({ subtotal_cents: 20, vat_cents: 3, total_cents: 23 });
  });

  it("net is the rounded exact sum, not the sum of rounded lines", async () => {
    await setSettings(admin, { vat_bps: 2000 });
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
    // Exact: 0.5 + 2.5 + 49.5 + 33 + 0.99 + 416.25 = 502.74 → net 503 (rounded lines would give 504);
    // VAT 100.548 → 101; total 604.
    expect(await jobTotals(ownerDb, job.id)).toEqual({ subtotal_cents: 503, vat_cents: 101, total_cents: 604 });
  });
});
