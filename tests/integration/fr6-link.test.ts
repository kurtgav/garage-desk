import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toPublicJob } from "@/lib/public-job";
import { JOB_STATUSES } from "@/lib/status";
import { expectWhitelistedKeys } from "../support/public-job";
import {
  type Db,
  type JobRow,
  type LinkToken,
  type StaffUser,
  addLine,
  admin,
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
  publicJob,
  rand,
  restoreSettings,
  signInAs,
  transition,
} from "./helpers";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let owner: StaffUser, mechanic: StaffUser;
let ownerDb: Db, mechDb: Db;
let customer: { id: string; full_name: string; phone: string; email: string };
let vehicle: { id: string; plate: string };
const middleName = `QA${rand()}`;
const secretNote = `internal-note-${rand()}`;

async function quotedJob(unitPriceCents = 125050): Promise<JobRow> {
  const job = await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId: mechanic.id });
  await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 2, unitPriceCents, description: "Brake pads" });
  return mustTransition(ownerDb, job.id, "quoted");
}

/** Customer-mode call that must fail without touching the job. */
async function expectCustomerRejected(jobId: string, run: () => PromiseLike<{ data: unknown; error: unknown }>) {
  const before = await getJob(jobId);
  const events = await eventsFor(jobId);
  const { data, error } = await run();
  expect(data).toBeNull();
  expect(error).not.toBeNull();
  expect(await eventsFor(jobId)).toHaveLength(events.length);
  expect(await getJob(jobId)).toEqual(before);
}

beforeAll(async () => {
  [owner, mechanic] = await Promise.all([createStaff("owner", "Owner Olga"), createStaff("mechanic", "Mechanic Ben")]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mechanic)]);
  await restoreSettings();
  ({ customer, vehicle } = await createCustomerWithVehicle(admin, { fullName: `Juan ${middleName} Dela Cruz` }));
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

  it("D-015: no link for a job still in New", async () => {
    const job = await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId: mechanic.id });
    await addLine(ownerDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 100 });
    const { error } = await ownerDb.rpc("create_job_link", { p_job_id: job.id, p_token_hash: newLinkToken().hash });
    expect(error).not.toBeNull();
    expect((await admin.from("job_links").select("id").eq("job_id", job.id)).data).toHaveLength(0);
  });
});

describe("FR6 AC3: the public DTO contains only whitelisted fields", () => {
  let job: JobRow;
  let link: LinkToken;

  beforeAll(async () => {
    job = await quotedJob();
    // A revise note that must never reach the customer.
    await mustTransition(ownerDb, job.id, "new", secretNote);
    job = await mustTransition(ownerDb, job.id, "quoted");
    link = await createLink(ownerDb, job.id);
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
      "Dela Cruz",
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

  it("shows the whitelisted values: garage, ref, first name, lines, frozen totals, timeline", async () => {
    const dto = (await publicJob(link.hash)).data;
    const settings = (await admin.from("settings").select("*").single()).data;
    expect(dto.garage).toEqual({ name: settings.garage_name, address: settings.garage_address, phone: settings.garage_phone });
    expect(dto.job).toEqual({ ref: job.ref, status: "quoted" });
    expect(dto.customer).toEqual({ first_name: "Juan" });
    expect(dto.vehicle).toMatchObject({ make: "Toyota", model: "Vios" });
    expect(dto.lines).toHaveLength(1);
    expect(dto.lines[0]).toMatchObject({ description: "Brake pads", unit_price_cents: 125050, line_total_cents: 250100 });
    expect(Number(dto.lines[0].quantity)).toBe(2);
    expect(dto.totals).toEqual({
      subtotal_cents: job.quoted_subtotal_cents,
      vat_cents: job.quoted_vat_cents,
      total_cents: job.quoted_total_cents,
      vat_bps: job.vat_bps,
    });
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

describe("FR6: regenerate, approve and decline through the link", () => {
  let job: JobRow;
  let oldLink: LinkToken, link: LinkToken;
  let other: JobRow;
  let otherLink: LinkToken;

  beforeAll(async () => {
    job = await quotedJob();
    oldLink = await createLink(ownerDb, job.id);
    other = await quotedJob(9900);
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
    await expectCustomerRejected(job.id, () => customerTransition(job.id, "approved", oldLink.hash));
  });

  it("approve with another job's link is rejected (no event on either job)", async () => {
    const otherEvents = await eventsFor(other.id);
    await expectCustomerRejected(job.id, () => customerTransition(job.id, "approved", otherLink.hash));
    expect(await eventsFor(other.id)).toHaveLength(otherEvents.length);
    expect((await getJob(other.id)).status).toBe("quoted");
  });

  it("customer mode is service-role only: anon and signed-in staff cannot use a link hash", async () => {
    const args = { p_job_id: job.id, p_to_status: "approved", p_note: null, p_link_token_hash: link.hash };
    await expectCustomerRejected(job.id, () => anonClient().rpc("transition_job", args));
    await expectCustomerRejected(job.id, () => ownerDb.rpc("transition_job", args));
    await expectCustomerRejected(job.id, () => mechDb.rpc("transition_job", args));
  });

  it("anon cannot look up, create links or transition", async () => {
    const anon = anonClient();
    expect((await anon.rpc("public_job_by_token_hash", { p_token_hash: link.hash })).error).not.toBeNull();
    expect((await anon.rpc("create_job_link", { p_job_id: job.id, p_token_hash: newLinkToken().hash })).error).not.toBeNull();
    await expectCustomerRejected(job.id, () => transition(anon, job.id, "new"));
  });

  it("customer Approve records approved_at/approved_total_cents and one customer event", async () => {
    const before = await eventsFor(job.id);
    const { data, error } = await customerTransition(job.id, "approved", link.hash);
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "approved", approved_total_cents: job.quoted_total_cents });
    expect(data.approved_at).not.toBeNull();
    const after = await eventsFor(job.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1]).toMatchObject({
      from_status: "quoted",
      to_status: "approved",
      actor_type: "customer",
      actor_id: null,
    });
    expect((await publicJob(link.hash)).data.job.status).toBe("approved");
  });

  it("Approve is idempotent: a second call succeeds with no new event", async () => {
    const before = await eventsFor(job.id);
    const { data, error } = await customerTransition(job.id, "approved", link.hash);
    expect(error).toBeNull();
    expect(data.status).toBe("approved");
    expect(await eventsFor(job.id)).toHaveLength(before.length);
  });

  it("the customer cannot move an approved job any further", async () => {
    await expectCustomerRejected(job.id, () => customerTransition(job.id, "in_progress", link.hash));
  });

  it("Decline with a reason returns the job to New with a customer event; idempotent", async () => {
    const before = await eventsFor(other.id);
    const { data, error } = await customerTransition(other.id, "new", otherLink.hash, "Too expensive");
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "new", quoted_total_cents: null, quoted_at: null });
    const after = await eventsFor(other.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1]).toMatchObject({
      from_status: "quoted",
      to_status: "new",
      actor_type: "customer",
      actor_id: null,
      note: "Too expensive",
    });

    const again = await customerTransition(other.id, "new", otherLink.hash, "Too expensive");
    expect(again.error).toBeNull();
    expect(await eventsFor(other.id)).toHaveLength(after.length);
  });

  it("D-023: after Decline the link shows no lines/totals and cannot approve", async () => {
    const dto = (await publicJob(otherLink.hash)).data;
    expectWhitelistedKeys(dto);
    expect(dto.job.status).toBe("new");
    expect(dto.lines).toEqual([]);
    expect(dto.totals).toBeNull();
    await expectCustomerRejected(other.id, () => customerTransition(other.id, "approved", otherLink.hash));
  });
});

describe("FR6 hardening", () => {
  it("D-015: a link stops working 30 days after collection", async () => {
    const job = await quotedJob();
    const link = await createLink(ownerDb, job.id);
    unwrapOk(await customerTransition(job.id, "approved", link.hash));
    for (const to of ["in_progress", "ready", "collected"] as const) await mustTransition(ownerDb, job.id, to);
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

    await admin.from("jobs").update({ collected_at: daysAgo(29) }).eq("id", job.id);
    expect((await publicJob(link.hash)).data).not.toBeNull();
    await admin.from("jobs").update({ collected_at: daysAgo(31) }).eq("id", job.id);
    expect((await publicJob(link.hash)).data).toBeNull();
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

function unwrapOk(res: { error: { message: string } | null }) {
  expect(res.error).toBeNull();
}
