import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JobStatus } from "@/lib/status";
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
  eventsFor,
  getJob,
  insertLine,
  linesFor,
  mustTransition,
  phoneApproval,
  quotesFor,
  restoreSettings,
  signInAs,
  transition,
  unwrap,
} from "./helpers";

let owner: StaffUser, mechanic: StaffUser;
let ownerDb: Db, mechDb: Db;
let vehicleId: string;

async function jobWithLine(): Promise<JobRow> {
  const job = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
  await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 10000 });
  return job;
}

/** A job at `target` on the happy path (approval through a customer link). */
async function jobAt(target: JobStatus): Promise<JobRow> {
  const job = await jobWithLine();
  return advanceTo(mechDb, job.id, target);
}

type Res = { data: unknown; error: { message: string } | null };

/** Asserts the call failed with `pattern`, wrote no event and changed nothing on the job. */
async function expectRejected(run: () => PromiseLike<Res>, jobId: string, pattern: RegExp) {
  const before = await getJob(jobId);
  const eventsBefore = await eventsFor(jobId);
  const quotesBefore = await quotesFor(jobId);
  const { data, error } = await run();
  expect(data).toBeNull();
  expect(error?.message).toMatch(pattern);
  expect(await eventsFor(jobId)).toHaveLength(eventsBefore.length);
  expect(await quotesFor(jobId)).toHaveLength(quotesBefore.length);
  expect(await getJob(jobId)).toEqual(before);
}

const lastEvent = async (jobId: string) => (await eventsFor(jobId)).at(-1);

beforeAll(async () => {
  [owner, mechanic] = await Promise.all([createStaff("owner"), createStaff("mechanic")]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mechanic)]);
  await restoreSettings();
  vehicleId = (await createCustomerWithVehicle(admin)).vehicle.id;
});

afterAll(cleanup);

describe("FR5 AC1: transitions outside the table are rejected and write no event", () => {
  it.each(["owner", "assigned mechanic"])("%s: Quoted → In progress is invalid_transition", async (who) => {
    const job = await jobWithLine();
    await mustTransition(ownerDb, job.id, "quoted");
    await expectRejected(() => transition(who === "owner" ? ownerDb : mechDb, job.id, "in_progress"), job.id, /^invalid_transition$/);
  });

  it("from New only Quoted and Cancelled are allowed", async () => {
    const job = await jobWithLine();
    for (const to of ["new", "declined", "approved", "in_progress", "ready", "collected"] as JobStatus[]) {
      await expectRejected(() => transition(ownerDb, job.id, to, "note"), job.id, /^invalid_transition$/);
    }
  });

  it("staff cannot decline for the customer, and nothing returns to New", async () => {
    const job = await jobWithLine();
    await mustTransition(ownerDb, job.id, "quoted");
    for (const to of ["declined", "new"] as JobStatus[]) {
      await expectRejected(() => transition(ownerDb, job.id, to), job.id, /^invalid_transition$/);
    }
  });

  it("Quoted with no line items raises no_line_items", async () => {
    const job = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
    await expectRejected(() => transition(ownerDb, job.id, "quoted"), job.id, /^no_line_items$/);
  });

  it("Collected and Cancelled are final", async () => {
    const collected = await jobAt("collected");
    const cancelled = await jobWithLine();
    await mustTransition(ownerDb, cancelled.id, "cancelled", "Customer sold the car");
    for (const job of [collected, cancelled]) {
      for (const to of ["new", "quoted", "declined", "in_progress", "ready", "collected", "cancelled"] as JobStatus[]) {
        await expectRejected(() => transition(ownerDb, job.id, to, "note"), job.id, /^invalid_transition$/);
      }
    }
  });
});

describe("FR5 AC2: every successful transition writes exactly one event with actor and timestamp", () => {
  it("job creation writes one null → new event by the creating staff member", async () => {
    const job = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
    expect(job.status).toBe("new");
    expect(job.created_by).toBe(owner.id);
    expect(await eventsFor(job.id)).toMatchObject([{ from_status: null, to_status: "new", actor_type: "staff", actor_id: owner.id }]);
  });

  it("happy path New → Collected: one event per step; quotes and approvals carry version and total", async () => {
    const job = await jobWithLine();
    const steps: { to: JobStatus; actor: "owner" | "mechanic" | "customer" }[] = [
      { to: "quoted", actor: "mechanic" },
      { to: "approved", actor: "customer" },
      { to: "in_progress", actor: "mechanic" },
      { to: "ready", actor: "owner" },
      { to: "collected", actor: "owner" },
    ];
    let from: JobStatus = "new";
    let hash = "";
    for (const { to, actor } of steps) {
      const before = await eventsFor(job.id);
      const started = Date.now();
      const res =
        actor === "customer"
          ? await customerTransition(job.id, to, hash, 1)
          : await transition(actor === "owner" ? ownerDb : mechDb, job.id, to);
      expect(res.error).toBeNull();
      expect(res.data.status).toBe(to);

      const after = await eventsFor(job.id);
      expect(after).toHaveLength(before.length + 1);
      const ev = after[after.length - 1];
      const versioned = to === "quoted" || to === "approved";
      expect(ev).toMatchObject({
        from_status: from,
        to_status: to,
        actor_type: actor === "customer" ? "customer" : "staff",
        actor_id: actor === "customer" ? null : actor === "owner" ? owner.id : mechanic.id,
        channel: to === "approved" ? "link" : null,
        quote_version: versioned ? 1 : null,
        total_cents: versioned ? 12000 : null,
      });
      expect(Math.abs(Date.parse(ev.created_at) - started)).toBeLessThan(60_000);

      if (to === "quoted") hash = (await createLink(mechDb, job.id)).hash;
      from = to;
    }

    const done = await getJob(job.id);
    expect(done).toMatchObject({
      status: "collected",
      quote_version: 1,
      approved_quote_version: 1,
      approved_subtotal_cents: 10000,
      approved_vat_cents: 2000,
      approved_total_cents: 12000,
    });
    expect(done.approved_at).not.toBeNull();
    expect(done.collected_at).not.toBeNull();
  });
});

describe("FR5: Declined → Quoted (re-quote)", () => {
  it("the customer declines with a reason; staff edit lines without a new version, then send v2", async () => {
    const job = await jobWithLine();
    await mustTransition(ownerDb, job.id, "quoted");
    const link = await createLink(ownerDb, job.id);

    const declined = unwrap(await customerTransition(job.id, "declined", link.hash, 1, "Too expensive"), "decline");
    expect(declined.status).toBe("declined");
    expect(await lastEvent(job.id)).toMatchObject({
      from_status: "quoted",
      to_status: "declined",
      actor_type: "customer",
      channel: "link",
      quote_version: 1,
      total_cents: 12000,
      note: "Too expensive",
    });

    // Lines are editable while Declined, without re-quoting (D-050).
    const events = await eventsFor(job.id);
    const line = (await linesFor(job.id))[0];
    unwrap(await mechDb.from("job_line_items").update({ unit_price_cents: 8000 }).eq("id", line.id).select(), "edit");
    expect((await getJob(job.id)).status).toBe("declined");
    expect(await eventsFor(job.id)).toHaveLength(events.length);

    const requoted = await mustTransition(mechDb, job.id, "quoted", "Cheaper part");
    expect(requoted).toMatchObject({ status: "quoted", quote_version: 2, quoted_total_cents: 9600 });
    expect(await lastEvent(job.id)).toMatchObject({ from_status: "declined", to_status: "quoted", quote_version: 2, total_cents: 9600 });
    expect((await quotesFor(job.id)).map((q) => [q.version, q.total_cents])).toEqual([
      [1, 12000],
      [2, 9600],
    ]);
  });
});

describe("FR5: owner phone approval (D-051)", () => {
  let job: JobRow;

  beforeAll(async () => {
    job = await jobWithLine();
    job = await mustTransition(ownerDb, job.id, "quoted");
  });

  it("AC5: a mechanic cannot record a phone approval (forbidden)", async () => {
    await expectRejected(() => phoneApproval(mechDb, job.id, 1, "Customer called"), job.id, /^forbidden$/);
  });

  it("a note is required", async () => {
    await expectRejected(() => phoneApproval(ownerDb, job.id, 1, null), job.id, /^note_required$/);
    await expectRejected(() => phoneApproval(ownerDb, job.id, 1, "   "), job.id, /^note_required$/);
  });

  it("the version the owner saw must be current", async () => {
    await expectRejected(() => phoneApproval(ownerDb, job.id, 2, "Called"), job.id, /^quote_changed$/);
    await expectRejected(() => phoneApproval(ownerDb, job.id, null, "Called"), job.id, /^quote_changed$/);
  });

  it("records approved_* from the version, as a staff event with channel phone", async () => {
    const approved = unwrap(await phoneApproval(ownerDb, job.id, 1, "Approved on the phone at 10:15"), "phone approval");
    expect(approved).toMatchObject({
      status: "approved",
      approved_quote_version: 1,
      approved_subtotal_cents: 10000,
      approved_vat_cents: 2000,
      approved_total_cents: 12000,
    });
    expect(await lastEvent(job.id)).toMatchObject({
      from_status: "quoted",
      to_status: "approved",
      actor_type: "staff",
      actor_id: owner.id,
      channel: "phone",
      quote_version: 1,
      total_cents: 12000,
      note: "Approved on the phone at 10:15",
    });
  });
});

describe("FR5 AC3: extra work after approval re-quotes automatically (D-050)", () => {
  let job: JobRow;
  let hash: string;

  beforeAll(async () => {
    job = await jobWithLine();
    await mustTransition(ownerDb, job.id, "quoted");
    hash = (await createLink(ownerDb, job.id)).hash;
    unwrap(await customerTransition(job.id, "approved", hash, 1), "approve v1");
  });

  it("adding a part to an approved job → Quoted v2 by the editing mechanic; the v1 approval stays", async () => {
    const before = await eventsFor(job.id);
    await addLine(mechDb, { jobId: job.id, kind: "part", quantity: 2, unitPriceCents: 1500, description: "Wiper blades" });

    const after = await getJob(job.id);
    expect(after).toMatchObject({
      status: "quoted",
      quote_version: 2,
      quoted_subtotal_cents: 13000,
      quoted_total_cents: 15600,
      approved_quote_version: 1,
      approved_total_cents: 12000,
    });
    const events = await eventsFor(job.id);
    expect(events).toHaveLength(before.length + 1);
    expect(events.at(-1)).toMatchObject({
      from_status: "approved",
      to_status: "quoted",
      actor_type: "staff",
      actor_id: mechanic.id,
      quote_version: 2,
      total_cents: 15600,
      note: "Lines changed — new quote",
    });
    expect(events.filter((e) => e.to_status === "approved")).toMatchObject([{ quote_version: 1, total_cents: 12000, channel: "link" }]);
    expect((await quotesFor(job.id)).map((q) => q.version)).toEqual([1, 2]);
  });

  it("Collected (and every step towards it) is impossible until v2 is approved", async () => {
    for (const to of ["in_progress", "ready", "collected"] as JobStatus[]) {
      await expectRejected(() => transition(ownerDb, job.id, to), job.id, /^invalid_transition$/);
    }
  });

  it("AC4: approving with the v1 page changes nothing", async () => {
    await expectRejected(() => customerTransition(job.id, "approved", hash, 1), job.id, /^quote_changed$/);
  });

  it("approving v2 through the same link stores v2 and the job can then be collected", async () => {
    const approved = unwrap(await customerTransition(job.id, "approved", hash, 2), "approve v2");
    expect(approved).toMatchObject({ status: "approved", approved_quote_version: 2, approved_subtotal_cents: 13000, approved_total_cents: 15600 });
    const done = await advanceTo(ownerDb, job.id, "collected");
    expect(done).toMatchObject({ status: "collected", quote_version: 2, approved_quote_version: 2 });
    const approvals = (await eventsFor(job.id)).filter((e) => e.to_status === "approved");
    expect(approvals.map((e) => [e.quote_version, e.total_cents])).toEqual([
      [1, 12000],
      [2, 15600],
    ]);
  });

  it("an edit while In progress, and an edit or delete while Quoted, each make a new version", async () => {
    const j = await jobAt("in_progress");
    const [line] = await linesFor(j.id);
    unwrap(await ownerDb.from("job_line_items").update({ quantity: 3 }).eq("id", line.id).select(), "edit");
    expect(await getJob(j.id)).toMatchObject({ status: "quoted", quote_version: 2, quoted_subtotal_cents: 30000 });
    expect(await lastEvent(j.id)).toMatchObject({ from_status: "in_progress", to_status: "quoted", actor_id: owner.id });

    const extra = await addLine(ownerDb, { jobId: j.id, kind: "part", quantity: 1, unitPriceCents: 500 });
    expect((await getJob(j.id)).quote_version).toBe(3);
    unwrap(await ownerDb.from("job_line_items").delete().eq("id", extra.id).select(), "delete");
    expect(await getJob(j.id)).toMatchObject({ status: "quoted", quote_version: 4, quoted_subtotal_cents: 30000 });
  });

  it("removing the last line of a quoted job raises no_line_items and changes nothing", async () => {
    const j = await jobWithLine();
    await mustTransition(ownerDb, j.id, "quoted");
    const [line] = await linesFor(j.id);
    await expectRejected(() => ownerDb.from("job_line_items").delete().eq("id", line.id).select().single(), j.id, /^no_line_items$/);
    expect(await linesFor(j.id)).toHaveLength(1);
  });

  it("D-057: the service role cannot change lines of a quoted job (a version needs a staff author)", async () => {
    const j = await jobWithLine();
    await mustTransition(ownerDb, j.id, "quoted");
    const { error } = await insertLine(admin, { jobId: j.id, kind: "part", quantity: 1, unitPriceCents: 1 });
    expect(error?.message).toBe("forbidden");
    expect(await linesFor(j.id)).toHaveLength(1);
  });

  it("D-070: saving a line unchanged (or trying to change a labour price) makes no new version", async () => {
    const j = await jobWithLine();
    await addLine(ownerDb, { jobId: j.id, kind: "labour", quantity: "1.5", description: "Diagnose" });
    await advanceTo(mechDb, j.id, "approved");
    const before = await getJob(j.id);
    const events = (await eventsFor(j.id)).length;
    const lines = await linesFor(j.id); // ordered by uuid, so pick by kind
    const part = lines.find((l) => l.kind === "part")!;
    const labour = lines.find((l) => l.kind === "labour")!;

    const same = { description: part.description, quantity: part.quantity, unit_price_cents: part.unit_price_cents };
    unwrap(await mechDb.from("job_line_items").update(same).eq("id", part.id).select(), "same values");
    unwrap(await mechDb.from("job_line_items").update({ unit_price_cents: 1 }).eq("id", labour.id).select(), "labour price");

    expect(await getJob(j.id)).toEqual(before);
    expect(await eventsFor(j.id)).toHaveLength(events);
    expect(await quotesFor(j.id)).toHaveLength(1);
  });
});

describe("D-068: decisions take their figures from the quote row, not jobs.quoted_*", () => {
  const tamper = (jobId: string) =>
    admin.from("jobs").update({ quoted_subtotal_cents: 1, quoted_vat_cents: 1, quoted_total_cents: 2 }).eq("id", jobId).select();

  it("approval copies subtotal/VAT/total of the approved version; its event carries that total", async () => {
    const j = await jobAt("quoted");
    const link = await createLink(ownerDb, j.id);
    unwrap(await tamper(j.id), "tamper");
    unwrap(await customerTransition(j.id, "approved", link.hash, 1), "approve");
    expect(await getJob(j.id)).toMatchObject({ approved_quote_version: 1, approved_subtotal_cents: 10000, approved_vat_cents: 2000, approved_total_cents: 12000 });
    expect(await lastEvent(j.id)).toMatchObject({ to_status: "approved", quote_version: 1, total_cents: 12000 });
  });

  it("a decline event carries the declined version's total", async () => {
    const j = await jobAt("quoted");
    const link = await createLink(ownerDb, j.id);
    unwrap(await tamper(j.id), "tamper");
    unwrap(await customerTransition(j.id, "declined", link.hash, 1, "No thanks"), "decline");
    expect(await lastEvent(j.id)).toMatchObject({ to_status: "declined", quote_version: 1, total_cents: 12000 });
  });
});

describe("FR5: rework (Ready → In progress)", () => {
  it.each(["owner", "assigned mechanic"])("%s can send a Ready job back with an optional note, then finish it", async (who) => {
    const db = who === "owner" ? ownerDb : mechDb;
    const job = await jobAt("ready");
    const back = await mustTransition(db, job.id, "in_progress", "Noise still there");
    expect(back.status).toBe("in_progress");
    expect(await lastEvent(job.id)).toMatchObject({
      from_status: "ready",
      to_status: "in_progress",
      actor_id: who === "owner" ? owner.id : mechanic.id,
      note: "Noise still there",
    });
    await mustTransition(db, job.id, "ready");
    expect((await mustTransition(db, job.id, "collected")).status).toBe("collected");
  });
});

describe("FR5: cancel (owner only, reason required, final)", () => {
  it("AC5: a mechanic cannot cancel", async () => {
    const job = await jobWithLine();
    await expectRejected(() => transition(mechDb, job.id, "cancelled", "No longer needed"), job.id, /^forbidden$/);
  });

  it("a reason is required", async () => {
    const job = await jobWithLine();
    await expectRejected(() => transition(ownerDb, job.id, "cancelled"), job.id, /^note_required$/);
  });

  it.each(["new", "quoted", "declined", "approved", "in_progress", "ready"] as JobStatus[])(
    "the owner can cancel from %s; the job is then locked",
    async (from) => {
      let job: JobRow;
      if (from === "declined") {
        job = await jobWithLine();
        await mustTransition(ownerDb, job.id, "quoted");
        const link = await createLink(ownerDb, job.id);
        unwrap(await customerTransition(job.id, "declined", link.hash, 1), "decline");
      } else {
        job = await jobAt(from);
      }
      const cancelled = await mustTransition(ownerDb, job.id, "cancelled", "Customer sold the car");
      expect(cancelled.status).toBe("cancelled");
      expect(await lastEvent(job.id)).toMatchObject({ from_status: from, to_status: "cancelled", actor_id: owner.id, note: "Customer sold the car" });

      const ins = await insertLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 1 });
      expect(ins.error?.message).toBe("job_locked");
    },
  );

  it("a collected job cannot be cancelled", async () => {
    const job = await jobAt("collected");
    await expectRejected(() => transition(ownerDb, job.id, "cancelled", "Too late"), job.id, /^invalid_transition$/);
  });
});

describe("FR5: Collected requires the approved version to be the current one", () => {
  it("a Ready job whose current version is not the approved one cannot be collected", async () => {
    const job = await jobAt("ready");
    // Simulate drift that no API path can produce (lines are locked in Ready).
    unwrap(await admin.from("jobs").update({ quote_version: 2 }).eq("id", job.id).select(), "force drift");
    await expectRejected(() => transition(ownerDb, job.id, "collected"), job.id, /^invalid_transition$/);
  });
});

describe("FR3: line items are editable until Ready", () => {
  it.each(["ready", "collected"] as JobStatus[])("%s: insert/update/delete raise job_locked, for the service role too", async (status) => {
    const job = await jobAt(status);
    const [line] = await linesFor(job.id);
    const ins = await insertLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 1 });
    expect(ins.error?.message).toBe("job_locked");
    expect((await ownerDb.from("job_line_items").update({ description: "changed" }).eq("id", line.id)).error?.message).toBe("job_locked");
    expect((await ownerDb.from("job_line_items").delete().eq("id", line.id)).error?.message).toBe("job_locked");
    expect((await admin.from("job_line_items").update({ description: "changed" }).eq("id", line.id)).error?.message).toBe("job_locked");
    expect((await admin.from("job_line_items").delete().eq("id", line.id)).error?.message).toBe("job_locked");
    expect(await linesFor(job.id)).toEqual([line]);
  });
});
