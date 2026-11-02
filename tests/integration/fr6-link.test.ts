import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toPublicJob } from "@/lib/public-job";
import { JOB_STATUSES, type JobStatus } from "@/lib/status";
import { expectWhitelistedKeys } from "../support/public-job";
import {
  type Db,
  type JobRow,
  type LinkToken,
  type StaffUser,
  addLine,
  admin,
  advanceTo,
  anonClient,
  cleanup,
  createCustomerWithVehicle,
  createJob,
  createLink,
  createStaff,
  customerTransition,
  eventsFor,
  getJob,
  mustTransition,
  newLinkToken,
  phoneApproval,
  publicJob,
  rand,
  restoreSettings,
  signInAs,
  transition,
  unwrap,
} from "./helpers";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let owner: StaffUser, mechanic: StaffUser;
let ownerDb: Db, mechDb: Db;
let customer: { id: string; full_name: string; phone: string; email: string };
let vehicle: { id: string; plate: string };
const middleName = `QA${rand()}`;
const secretNote = `internal-note-${rand()}`;

/** 2 × €12.50 + 1.25 h × €45.00 @ 20%: exact lines 2500 + 5625 → net 8125, VAT 1625, total 9750. */
async function quotedJob(): Promise<JobRow> {
  const job = await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId: mechanic.id });
  await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 2, unitPriceCents: 1250, description: "Brake pads" });
  await addLine(ownerDb, { jobId: job.id, kind: "labour", quantity: "1.25", description: "Fitting" });
  return mustTransition(ownerDb, job.id, "quoted");
}

/** Customer-mode call that must fail without touching the job. Returns the error message. */
async function expectCustomerRejected(
  jobId: string,
  run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<string | undefined> {
  const before = await getJob(jobId);
  const events = await eventsFor(jobId);
  const { data, error } = await run();
  expect(data).toBeNull();
  expect(error).not.toBeNull();
  expect(await eventsFor(jobId)).toHaveLength(events.length);
  expect(await getJob(jobId)).toEqual(before);
  return error?.message;
}

beforeAll(async () => {
  [owner, mechanic] = await Promise.all([createStaff("owner", "Owner Georgi"), createStaff("mechanic", "Mechanic Stoyan")]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mechanic)]);
  await restoreSettings();
  ({ customer, vehicle } = await createCustomerWithVehicle(admin, { fullName: `Ivan ${middleName} Georgiev` }));
});

afterAll(cleanup);

describe("FR6: link creation stores only the SHA-256 of a 32-byte token", () => {
  it("create_job_link returns a timestamp; job_links holds the hash, never the token", async () => {
    const job = await quotedJob();
    const { token, hash } = newLinkToken();
    const { data, error } = await mechDb.rpc("create_job_link", { p_job_id: job.id, p_token_hash: hash });
    expect(error).toBeNull();
    expect(Number.isNaN(Date.parse(data))).toBe(false);

    const rows = (await admin.from("job_links").select("*").eq("job_id", job.id)).data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ token_hash: hash, revoked_at: null, created_by: mechanic.id });
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("D-053: linkable while Quoted, Declined, Approved, In progress or Ready; not while New, Collected or Cancelled", async () => {
    const tryLink = (jobId: string) => ownerDb.rpc("create_job_link", { p_job_id: jobId, p_token_hash: newLinkToken().hash });

    const fresh = await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId: mechanic.id });
    await addLine(ownerDb, { jobId: fresh.id, kind: "part", quantity: 1, unitPriceCents: 100 });
    expect((await tryLink(fresh.id)).error?.message).toBe("not_linkable");

    const job = await quotedJob();
    const first = await createLink(ownerDb, job.id);
    unwrap(await customerTransition(job.id, "declined", first.hash, 1), "decline");
    expect((await tryLink(job.id)).error).toBeNull(); // declined
    await mustTransition(ownerDb, job.id, "quoted");
    const link = await createLink(ownerDb, job.id);
    unwrap(await customerTransition(job.id, "approved", link.hash, 2), "approve");
    for (const to of ["approved", "in_progress", "ready"] as JobStatus[]) {
      if (to !== "approved") await mustTransition(ownerDb, job.id, to);
      expect((await tryLink(job.id)).error).toBeNull();
    }
    await mustTransition(ownerDb, job.id, "collected");
    expect((await tryLink(job.id)).error?.message).toBe("not_linkable");

    const cancelled = await quotedJob();
    await mustTransition(ownerDb, cancelled.id, "cancelled", "Customer sold the car");
    expect((await tryLink(cancelled.id)).error?.message).toBe("not_linkable");
  });
});

describe("FR6 AC3: the public DTO contains only whitelisted fields", () => {
  let job: JobRow;
  let link: LinkToken;

  beforeAll(async () => {
    job = await quotedJob();
    link = await createLink(ownerDb, job.id);
    // Notes that must never reach the customer: a phone-approval note and a rework note.
    unwrap(await phoneApproval(ownerDb, job.id, 1, secretNote), "phone approval");
    await advanceTo(ownerDb, job.id, "ready");
    await mustTransition(ownerDb, job.id, "in_progress", `${secretNote}-rework`);
    job = await getJob(job.id);
  });

  it("key sets equal PUBLIC_JOB_KEYS at every level, and toPublicJob strips nothing", async () => {
    const { data, error } = await publicJob(link.hash);
    expect(error).toBeNull();
    expectWhitelistedKeys(data);
    expect(toPublicJob(data)).toStrictEqual(data);
  });

  it("no phone, email, staff names, notes, internal ids or hashes anywhere in the body", async () => {
    const json = JSON.stringify((await publicJob(link.hash)).data);
    const leaks = [
      customer.phone,
      customer.phone.slice(-7),
      customer.email,
      middleName,
      "Georgiev",
      owner.fullName,
      mechanic.fullName,
      owner.email,
      secretNote,
      job.id,
      vehicle.id,
      customer.id,
      owner.id,
      mechanic.id,
      link.hash,
    ];
    for (const leak of leaks) expect(json).not.toContain(leak);
    expect(json).not.toMatch(UUID_RE);
  });

  it("shows garage, ref, version, first name, exact lines, net/VAT/total and a timeline marking the phone approval", async () => {
    const dto = (await publicJob(link.hash)).data;
    const settings = (await admin.from("settings").select("*").single()).data;
    expect(dto.garage).toEqual({ name: settings.garage_name, address: settings.garage_address, phone: settings.garage_phone });
    expect(dto.job).toEqual({ ref: job.ref, status: "in_progress", quote_version: 1 });
    expect(dto.customer).toEqual({ first_name: "Ivan" });
    expect(dto.vehicle).toMatchObject({ make: "Toyota", model: "Vios" });
    expect(dto.lines).toEqual([
      { description: "Brake pads", quantity: "2.00", unit_price_cents: 1250, line_total_cents: 2500 },
      { description: "Fitting", quantity: "1.25", unit_price_cents: 4500, line_total_cents: 5625 },
    ]);
    expect(dto.totals).toEqual({ subtotal_cents: 8125, vat_cents: 1625, total_cents: 9750, vat_bps: 2000 });
    expect(dto.timeline.map((t: { status: string; channel: string | null }) => [t.status, t.channel])).toEqual([
      ["new", null],
      ["quoted", null],
      ["approved", "phone"],
      ["in_progress", null],
      ["ready", null],
      ["in_progress", null],
    ]);
    for (const t of dto.timeline) {
      expect(JOB_STATUSES).toContain(t.status);
      expect(Number.isNaN(Date.parse(t.at))).toBe(false);
    }
  });

  it("D-014: a lookup touches last_viewed_at", async () => {
    await publicJob(link.hash);
    const row = (await admin.from("job_links").select("last_viewed_at").eq("token_hash", link.hash).single()).data;
    expect(row?.last_viewed_at).not.toBeNull();
  });
});

describe("FR6 AC2: modified, guessed, job-ref and UUID tokens find nothing", () => {
  let job: JobRow;
  let link: LinkToken;

  beforeAll(async () => {
    job = await quotedJob();
    link = await createLink(ownerDb, job.id);
  });

  it("positive control: the real hash resolves", async () => {
    expect((await publicJob(link.hash)).data).not.toBeNull();
  });

  it.each([
    ["one hex digit changed", () => link.hash.slice(0, -1) + (link.hash.endsWith("0") ? "1" : "0")],
    ["random guess", () => newLinkToken().hash],
    ["the raw token instead of its hash", () => link.token],
    ["hash of the token with one char changed", () => sha256(link.token.slice(0, -1) + (link.token.endsWith("A") ? "B" : "A"))],
    ["job ref", () => job.ref],
    ["sha256 of job ref", () => sha256(job.ref)],
    ["job UUID", () => job.id],
    ["sha256 of job UUID", () => sha256(job.id)],
    ["empty string", () => ""],
  ])("%s → null", async (_label, makeHash) => {
    const { data, error } = await publicJob(makeHash());
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

describe("FR6: regenerate, approve and decline through the link (version-bound, D-049)", () => {
  let job: JobRow;
  let oldLink: LinkToken, link: LinkToken;
  let other: JobRow;
  let otherLink: LinkToken;

  beforeAll(async () => {
    job = await quotedJob();
    oldLink = await createLink(ownerDb, job.id);
    other = await quotedJob();
    otherLink = await createLink(ownerDb, other.id);
  });

  it("Regenerate link revokes the old token atomically (one active link per job)", async () => {
    link = await createLink(mechDb, job.id);
    expect((await publicJob(oldLink.hash)).data).toBeNull();
    expect((await publicJob(link.hash)).data).not.toBeNull();
    const rows = (await admin.from("job_links").select("token_hash, revoked_at").eq("job_id", job.id)).data ?? [];
    expect(rows.filter((r) => r.revoked_at === null).map((r) => r.token_hash)).toEqual([link.hash]);
    expect(rows.find((r) => r.token_hash === oldLink.hash)?.revoked_at).not.toBeNull();
  });

  it("approve with the revoked token is rejected", async () => {
    expect(await expectCustomerRejected(job.id, () => customerTransition(job.id, "approved", oldLink.hash, 1))).toBe("not_found");
  });

  it("approve with another job's link is rejected (no event on either job)", async () => {
    const otherEvents = await eventsFor(other.id);
    await expectCustomerRejected(job.id, () => customerTransition(job.id, "approved", otherLink.hash, 1));
    expect(await eventsFor(other.id)).toHaveLength(otherEvents.length);
    expect((await getJob(other.id)).status).toBe("quoted");
  });

  it("customer mode is service-role only: anon and signed-in staff cannot use a link hash", async () => {
    const args = { p_job_id: job.id, p_to_status: "approved", p_note: null, p_link_token_hash: link.hash, p_expected_version: 1 };
    await expectCustomerRejected(job.id, () => anonClient().rpc("transition_job", args));
    expect(await expectCustomerRejected(job.id, () => ownerDb.rpc("transition_job", args))).toBe("forbidden");
    expect(await expectCustomerRejected(job.id, () => mechDb.rpc("transition_job", args))).toBe("forbidden");
  });

  it("anon cannot look up, create links or transition", async () => {
    const anon = anonClient();
    expect((await anon.rpc("public_job_by_token_hash", { p_token_hash: link.hash })).error).not.toBeNull();
    expect((await anon.rpc("create_job_link", { p_job_id: job.id, p_token_hash: newLinkToken().hash })).error).not.toBeNull();
    await expectCustomerRejected(job.id, () => transition(anon, job.id, "cancelled", "x"));
  });

  it("Approve or Decline without the shown version, or with another one, is quote_changed and changes nothing", async () => {
    for (const to of ["approved", "declined"] as const) {
      for (const version of [undefined, null, 0, 2]) {
        expect(await expectCustomerRejected(job.id, () => customerTransition(job.id, to, link.hash, version))).toBe("quote_changed");
      }
    }
  });

  it("customer Approve stores the version's figures and one customer/link event", async () => {
    const before = await eventsFor(job.id);
    const { data, error } = await customerTransition(job.id, "approved", link.hash, 1);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      status: "approved",
      approved_quote_version: 1,
      approved_subtotal_cents: 8125,
      approved_vat_cents: 1625,
      approved_total_cents: 9750,
    });
    expect(data.approved_at).not.toBeNull();
    const after = await eventsFor(job.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({
      from_status: "quoted",
      to_status: "approved",
      actor_type: "customer",
      actor_id: null,
      channel: "link",
      quote_version: 1,
      total_cents: 9750,
    });
    expect((await publicJob(link.hash)).data.job.status).toBe("approved");
  });

  it("Approve is idempotent for the same version (no new event); another version is quote_changed", async () => {
    const before = await eventsFor(job.id);
    const { data, error } = await customerTransition(job.id, "approved", link.hash, 1);
    expect(error).toBeNull();
    expect(data.status).toBe("approved");
    expect(await eventsFor(job.id)).toHaveLength(before.length);
    expect(await expectCustomerRejected(job.id, () => customerTransition(job.id, "approved", link.hash, 2))).toBe("quote_changed");
  });

  it("the customer cannot decline or move an approved job any further", async () => {
    expect(await expectCustomerRejected(job.id, () => customerTransition(job.id, "declined", link.hash, 1))).toBe("invalid_transition");
    expect(await expectCustomerRejected(job.id, () => customerTransition(job.id, "in_progress", link.hash, 1))).toBe("invalid_transition");
  });

  it("Decline with a reason → Declined with a customer/link event; idempotent", async () => {
    const before = await eventsFor(other.id);
    const { data, error } = await customerTransition(other.id, "declined", otherLink.hash, 1, "Too expensive");
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "declined", quote_version: 1, quoted_total_cents: 9750 });
    const after = await eventsFor(other.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({
      from_status: "quoted",
      to_status: "declined",
      actor_type: "customer",
      actor_id: null,
      channel: "link",
      quote_version: 1,
      note: "Too expensive",
    });

    const again = await customerTransition(other.id, "declined", otherLink.hash, 1, "Too expensive");
    expect(again.error).toBeNull();
    expect(await eventsFor(other.id)).toHaveLength(after.length);
  });

  it("while Declined the page shows the declined quote (not lines being edited) and cannot approve", async () => {
    await addLine(ownerDb, { jobId: other.id, kind: "part", quantity: 1, unitPriceCents: 99999, description: "Draft line" });
    const dto = (await publicJob(otherLink.hash)).data;
    expectWhitelistedKeys(dto);
    expect(dto.job).toMatchObject({ status: "declined", quote_version: 1 });
    expect(dto.lines.map((l: { description: string }) => l.description)).toEqual(["Brake pads", "Fitting"]);
    expect(dto.totals.total_cents).toBe(9750);
    expect(await expectCustomerRejected(other.id, () => customerTransition(other.id, "approved", otherLink.hash, 1))).toBe("invalid_transition");
  });

  it("FR7: a re-quote shows the new version through the same link, and only that version can be approved", async () => {
    await mustTransition(ownerDb, other.id, "quoted");
    const dto = (await publicJob(otherLink.hash)).data;
    expect(dto.job).toMatchObject({ status: "quoted", quote_version: 2 });
    expect(dto.lines.map((l: { description: string }) => l.description)).toEqual(["Brake pads", "Fitting", "Draft line"]);
    expect(await expectCustomerRejected(other.id, () => customerTransition(other.id, "approved", otherLink.hash, 1))).toBe("quote_changed");
    unwrap(await customerTransition(other.id, "approved", otherLink.hash, 2), "approve v2");
  });
});

describe("FR6: stale page after extra work, and links never expire (D-053)", () => {
  it("the customer's v1 page cannot approve after staff added work (v2); v2 can", async () => {
    const job = await quotedJob();
    const link = await createLink(ownerDb, job.id);
    unwrap(await customerTransition(job.id, "approved", link.hash, 1), "approve v1");
    await addLine(mechDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 5000, description: "Extra" });

    expect(await expectCustomerRejected(job.id, () => customerTransition(job.id, "approved", link.hash, 1))).toBe("quote_changed");
    const fresh = unwrap(await customerTransition(job.id, "approved", link.hash, 2), "approve v2");
    expect(fresh).toMatchObject({ status: "approved", approved_quote_version: 2, approved_subtotal_cents: 13125 });
  });

  it("a link keeps working long after collection", async () => {
    const job = await quotedJob();
    const link = await createLink(ownerDb, job.id);
    unwrap(await customerTransition(job.id, "approved", link.hash, 1), "approve");
    await advanceTo(ownerDb, job.id, "collected");
    const yearsAgo = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
    unwrap(await admin.from("jobs").update({ collected_at: yearsAgo }).eq("id", job.id).select(), "backdate");

    expect((await publicJob(link.hash)).data.job.status).toBe("collected");
    // A replay of the old approval is still a harmless no-op.
    expect((await customerTransition(job.id, "approved", link.hash, 1)).error).toBeNull();
  });

  it("D-012: rate_limit_hit is true only once the count exceeds p_max in the window", async () => {
    const key = `qa-${rand()}`;
    const hit = async () => (await admin.rpc("rate_limit_hit", { p_key: key, p_max: 2, p_window_seconds: 60 })).data;
    try {
      expect([await hit(), await hit(), await hit(), await hit()]).toEqual([false, false, true, true]);
    } finally {
      await admin.from("rate_limits").delete().eq("key", key);
    }
  });
});

describe("D-039: revoke_job_link switches the link off in any status", () => {
  let otherMechDb: Db;

  beforeAll(async () => {
    otherMechDb = await signInAs(await createStaff("mechanic", "Mechanic Other"));
  });

  const revoke = (db: Db, jobId: string) => db.rpc("revoke_job_link", { p_job_id: jobId });

  it("works while Declined; a second revoke returns false", async () => {
    const job = await quotedJob();
    const link = await createLink(ownerDb, job.id);
    unwrap(await customerTransition(job.id, "declined", link.hash, 1), "decline");
    expect((await publicJob(link.hash)).data).not.toBeNull();

    expect(await revoke(mechDb, job.id)).toMatchObject({ data: true, error: null });
    expect((await publicJob(link.hash)).data).toBeNull();
    expect(await revoke(mechDb, job.id)).toMatchObject({ data: false, error: null });
  });

  it("works on approved, collected and cancelled jobs; the old hash then finds nothing", async () => {
    const job = await quotedJob();
    const first = await createLink(ownerDb, job.id);
    unwrap(await customerTransition(job.id, "approved", first.hash, 1), "approve");
    expect(await revoke(ownerDb, job.id)).toMatchObject({ data: true, error: null });
    expect((await publicJob(first.hash)).data).toBeNull();

    const second = await createLink(ownerDb, job.id);
    await advanceTo(ownerDb, job.id, "collected");
    expect((await publicJob(second.hash)).data).not.toBeNull();
    expect(await revoke(ownerDb, job.id)).toMatchObject({ data: true, error: null });
    expect((await publicJob(second.hash)).data).toBeNull();

    const cancelled = await quotedJob();
    const third = await createLink(ownerDb, cancelled.id);
    await mustTransition(ownerDb, cancelled.id, "cancelled", "Customer moved away");
    expect((await publicJob(third.hash)).data.job.status).toBe("cancelled");
    expect(await revoke(ownerDb, cancelled.id)).toMatchObject({ data: true, error: null });
    expect((await publicJob(third.hash)).data).toBeNull();
  });

  it("another mechanic gets not_found and the link stays active; anon cannot call it", async () => {
    const job = await quotedJob();
    const link = await createLink(ownerDb, job.id);
    const res = await revoke(otherMechDb, job.id);
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("not_found");
    expect((await revoke(anonClient(), job.id)).error).not.toBeNull();
    expect((await publicJob(link.hash)).data).not.toBeNull();
  });

  it("a missing job is not_found", async () => {
    expect((await revoke(ownerDb, randomUUID())).error?.message).toBe("not_found");
  });
});
