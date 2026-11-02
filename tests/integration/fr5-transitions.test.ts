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
  restoreSettings,
  signInAs,
  transition,
} from "./helpers";

let owner: StaffUser, mechanic: StaffUser;
let ownerDb: Db, mechDb: Db;
let vehicleId: string;

async function jobWithLine(): Promise<JobRow> {
  const job = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
  await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 10000 });
  return job;
}

/** Asserts the call failed with `pattern`, wrote no event and left the status alone. */
async function expectRejected(run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, jobId: string, pattern: RegExp) {
  const before = await getJob(jobId);
  const eventsBefore = await eventsFor(jobId);
  const { data, error } = await run();
  expect(data).toBeNull();
  expect(error?.message).toMatch(pattern);
  expect(await eventsFor(jobId)).toHaveLength(eventsBefore.length);
  expect((await getJob(jobId)).status).toBe(before.status);
}

beforeAll(async () => {
  [owner, mechanic] = await Promise.all([createStaff("owner"), createStaff("mechanic")]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mechanic)]);
  await restoreSettings();
  vehicleId = (await createCustomerWithVehicle(admin)).vehicle.id;
});

afterAll(cleanup);

describe("FR5 AC1: a job in Quoted cannot be moved to In progress by staff", () => {
  it.each(["owner", "assigned mechanic"])("%s: rejected with invalid_transition, no event written", async (who) => {
    const job = await jobWithLine();
    await mustTransition(ownerDb, job.id, "quoted");
    await expectRejected(() => transition(who === "owner" ? ownerDb : mechDb, job.id, "in_progress"), job.id, /invalid_transition/);
  });

  it("other transitions outside the table are rejected from New", async () => {
    const job = await jobWithLine();
    for (const to of ["new", "approved", "in_progress", "ready", "collected"] as JobStatus[]) {
      await expectRejected(() => transition(ownerDb, job.id, to), job.id, /invalid_transition/);
    }
  });

  it("staff cannot approve a quote (Quoted → Approved is customer-only)", async () => {
    const job = await jobWithLine();
    await mustTransition(ownerDb, job.id, "quoted");
    for (const db of [ownerDb, mechDb]) {
      await expectRejected(() => transition(db, job.id, "approved"), job.id, /forbidden|invalid_transition/);
    }
  });

  it("New → Quoted with no line items raises no_line_items", async () => {
    const job = await createJob(ownerDb, { vehicleId, mechanicId: mechanic.id });
    await expectRejected(() => transition(ownerDb, job.id, "quoted"), job.id, /no_line_items/);
  });

  it("Collected is final", async () => {
    const job = await jobWithLine();
    await advanceTo(mechDb, job.id, "collected");
    for (const to of ["new", "quoted", "approved", "in_progress", "ready", "collected"] as JobStatus[]) {
      await expectRejected(() => transition(ownerDb, job.id, to), job.id, /invalid_transition/);
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

  it("happy path New → Collected: one event per step; approved_* and collected_at recorded", async () => {
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
    let quotedTotal: number | null = null;
    for (const { to, actor } of steps) {
      const before = await eventsFor(job.id);
      const started = Date.now();
      const res =
        actor === "customer"
          ? await customerTransition(job.id, to, hash, null, quotedTotal)
          : await transition(actor === "owner" ? ownerDb : mechDb, job.id, to);
      expect(res.error).toBeNull();
      expect(res.data.status).toBe(to);

      const after = await eventsFor(job.id);
      expect(after).toHaveLength(before.length + 1);
      const ev = after[after.length - 1];
      expect(ev).toMatchObject({
        from_status: from,
        to_status: to,
        actor_type: actor === "customer" ? "customer" : "staff",
        actor_id: actor === "customer" ? null : actor === "owner" ? owner.id : mechanic.id,
      });
      expect(Math.abs(Date.parse(ev.created_at) - started)).toBeLessThan(60_000);

      if (to === "quoted") {
        hash = (await createLink(mechDb, job.id)).hash;
        quotedTotal = (await getJob(job.id)).quoted_total_cents;
      }
      from = to;
    }

    const done = await getJob(job.id);
    expect(done.status).toBe("collected");
    expect(done.quoted_total_cents).toBe(11200);
    expect(done.approved_total_cents).toBe(done.quoted_total_cents);
    expect(done.approved_at).not.toBeNull();
    expect(done.collected_at).not.toBeNull();
  });
});

describe("FR3/FR5: line items are locked after quoting and unlocked by revising", () => {
  let job: JobRow;
  let lineId: string;

  beforeAll(async () => {
    job = await jobWithLine();
    lineId = (await linesFor(job.id))[0].id;
    await mustTransition(ownerDb, job.id, "quoted");
  });

  it("insert into a quoted job raises job_locked", async () => {
    const { error } = await insertLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 1 });
    expect(error?.message).toMatch(/job_locked/);
  });

  it("update/delete by staff leave the line unchanged (job_locked or filtered by RLS)", async () => {
    const before = await linesFor(job.id);
    const upd = await ownerDb.from("job_line_items").update({ description: "changed" }).eq("id", lineId).select();
    if (upd.error) expect(upd.error.message).toMatch(/job_locked/);
    else expect(upd.data).toHaveLength(0);
    const del = await ownerDb.from("job_line_items").delete().eq("id", lineId).select();
    if (del.error) expect(del.error.message).toMatch(/job_locked/);
    else expect(del.data).toHaveLength(0);
    expect(await linesFor(job.id)).toEqual(before);
  });

  it("the trigger also blocks the service role (update/delete raise job_locked)", async () => {
    expect((await admin.from("job_line_items").update({ description: "changed" }).eq("id", lineId)).error?.message).toMatch(/job_locked/);
    expect((await admin.from("job_line_items").delete().eq("id", lineId)).error?.message).toMatch(/job_locked/);
  });

  it("staff Revise quote (Quoted → New) records the note, clears quoted_* and unlocks lines", async () => {
    const before = await eventsFor(job.id);
    const revised = await mustTransition(mechDb, job.id, "new", "Customer wants OEM pads");
    expect(revised).toMatchObject({
      status: "new",
      quoted_subtotal_cents: null,
      quoted_vat_cents: null,
      quoted_total_cents: null,
      quoted_at: null,
    });
    const after = await eventsFor(job.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1]).toMatchObject({
      from_status: "quoted",
      to_status: "new",
      actor_type: "staff",
      actor_id: mechanic.id,
      note: "Customer wants OEM pads",
    });

    const added = await insertLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 500 });
    expect(added.error).toBeNull();
    const upd = await ownerDb.from("job_line_items").update({ description: "OEM pads" }).eq("id", lineId).select();
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);
    const del = await ownerDb.from("job_line_items").delete().eq("id", added.data.id).select();
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);

    const requoted = await mustTransition(ownerDb, job.id, "quoted");
    expect(requoted.quoted_total_cents).toBe(11200);
  });
});
