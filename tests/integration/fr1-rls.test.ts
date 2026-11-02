import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  eventsFor,
  getJob,
  insertLine,
  linesFor,
  mustTransition,
  newLinkToken,
  rand,
  signInAs,
  transition,
} from "./helpers";

let owner: StaffUser, mechA: StaffUser, mechB: StaffUser;
let ownerDb: Db, aDb: Db, bDb: Db;
let customerId: string, vehicleId: string;
let quotedJob: JobRow; // assigned to A, quoted, with an active link
let newJob: JobRow; // assigned to A, still `new` (lines editable)
let link: LinkToken;
const rateKey = `qa-${rand()}`;

beforeAll(async () => {
  [owner, mechA, mechB] = await Promise.all([
    createStaff("owner", "Owner"),
    createStaff("mechanic", "Mechanic A"),
    createStaff("mechanic", "Mechanic B"),
  ]);
  [ownerDb, aDb, bDb] = await Promise.all([signInAs(owner), signInAs(mechA), signInAs(mechB)]);
  const { customer, vehicle } = await createCustomerWithVehicle(admin);
  customerId = customer.id;
  vehicleId = vehicle.id;

  quotedJob = await createJob(ownerDb, { vehicleId, mechanicId: mechA.id });
  await addLine(ownerDb, { jobId: quotedJob.id, kind: "part", quantity: 1, unitPriceCents: 50000 });
  quotedJob = await mustTransition(ownerDb, quotedJob.id, "quoted");
  link = await createLink(ownerDb, quotedJob.id);

  newJob = await createJob(ownerDb, { vehicleId, mechanicId: mechA.id });
  await addLine(ownerDb, { jobId: newJob.id, kind: "part", quantity: 1, unitPriceCents: 1000 });
});

afterAll(async () => {
  await admin.from("rate_limits").delete().eq("key", rateKey);
  await cleanup();
});

describe("FR1 AC1: a mechanic gets not-found and no data for another mechanic's job (API)", () => {
  it("positive control: the assigned mechanic sees the job, its lines, events, customer and vehicle", async () => {
    expect((await aDb.from("jobs").select("id").eq("id", quotedJob.id)).data).toHaveLength(1);
    expect((await aDb.from("job_line_items").select("id").eq("job_id", quotedJob.id)).data?.length).toBeGreaterThan(0);
    expect((await aDb.from("job_events").select("id").eq("job_id", quotedJob.id)).data?.length).toBeGreaterThan(0);
    expect((await aDb.from("job_links").select("id").eq("job_id", quotedJob.id)).data).toHaveLength(1);
    expect((await aDb.from("customers").select("id").eq("id", customerId)).data).toHaveLength(1);
    expect((await aDb.from("vehicles").select("id").eq("id", vehicleId)).data).toHaveLength(1);
  });

  it("select by id returns no row", async () => {
    const { data } = await bDb.from("jobs").select("*").eq("id", quotedJob.id).maybeSingle();
    expect(data).toBeNull();
  });

  // Select a column every role may read (job_links.token_hash is not client-readable at all),
  // so an empty result proves RLS filtering rather than a privilege error.
  it.each(["job_line_items", "job_events", "job_links", "job_totals"])("cannot see its %s", async (table) => {
    const { data, error } = await bDb.from(table).select("job_id").eq("job_id", quotedJob.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("staff can never read job_links.token_hash", async () => {
    const { data, error } = await aDb.from("job_links").select("token_hash").eq("job_id", quotedJob.id);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("cannot see its customer or vehicle", async () => {
    expect((await bDb.from("customers").select("*").eq("id", customerId)).data ?? []).toHaveLength(0);
    expect((await bDb.from("vehicles").select("*").eq("id", vehicleId)).data ?? []).toHaveLength(0);
  });

  it("transition_job raises not_found/forbidden and writes no event", async () => {
    for (const [job, to] of [
      [quotedJob, "new"],
      [newJob, "quoted"],
    ] as const) {
      const before = await eventsFor(job.id);
      const { data, error } = await transition(bDb, job.id, to, "hijack");
      expect(data).toBeNull();
      expect(error?.message).toMatch(/not_found|forbidden/);
      expect(await eventsFor(job.id)).toHaveLength(before.length);
      expect((await getJob(job.id)).status).toBe(job.status);
    }
  });

  it("cannot add, change or delete its line items", async () => {
    const before = await linesFor(newJob.id);
    const ins = await insertLine(bDb, { jobId: newJob.id, kind: "part", quantity: 1, unitPriceCents: 1 });
    expect(ins.error).not.toBeNull();
    const upd = await bDb.from("job_line_items").update({ description: "hijack" }).eq("job_id", newJob.id).select();
    expect(upd.data ?? []).toHaveLength(0);
    const del = await bDb.from("job_line_items").delete().eq("job_id", newJob.id).select();
    expect(del.data ?? []).toHaveLength(0);
    expect(await linesFor(newJob.id)).toEqual(before);
  });

  it("cannot update the job", async () => {
    const { data } = await bDb.from("jobs").update({ description: "hijack" }).eq("id", newJob.id).select();
    expect(data ?? []).toHaveLength(0);
    expect((await getJob(newJob.id)).description).toBe(newJob.description);
  });

  it("cannot create or regenerate its customer link", async () => {
    const { error } = await bDb.rpc("create_job_link", { p_job_id: quotedJob.id, p_token_hash: newLinkToken().hash });
    expect(error).not.toBeNull();
    const active = (await admin.from("job_links").select("token_hash").eq("job_id", quotedJob.id).is("revoked_at", null)).data;
    expect(active).toEqual([{ token_hash: link.hash }]);
  });
});

describe("FR1 AC2 (DB side): settings, dashboard and the customer directory are owner-only", () => {
  it("mechanic cannot read settings (owner can)", async () => {
    expect((await ownerDb.from("settings").select("*")).data).toHaveLength(1);
    expect((await aDb.from("settings").select("*")).data ?? []).toHaveLength(0);
  });

  it("mechanic cannot change settings", async () => {
    const before = unwrapOne(await admin.from("settings").select("*"));
    const { data } = await aDb.from("settings").update({ hourly_rate_cents: 1 }).not("id", "is", null).select();
    expect(data ?? []).toHaveLength(0);
    expect(unwrapOne(await admin.from("settings").select("*"))).toEqual(before);
  });

  it("get_dashboard raises forbidden for a mechanic (owner can call it)", async () => {
    expect((await ownerDb.rpc("get_dashboard")).error).toBeNull();
    const { data, error } = await aDb.rpc("get_dashboard");
    expect(data).toBeNull();
    expect(error?.message).toMatch(/forbidden/);
  });

  it("mechanic sees only customers on their own jobs", async () => {
    const { data } = await aDb.from("customers").select("id");
    expect((data ?? []).map((c) => c.id)).toEqual([customerId]);
    expect((await bDb.from("customers").select("id")).data ?? []).toHaveLength(0);
  });

  it("PRD Q7: mechanic cannot create customers or jobs", async () => {
    const tag = `qa-forbidden-${rand()}`;
    const cust = await aDb.from("customers").insert({ full_name: tag, phone: "09170000000" });
    const job = await aDb.from("jobs").insert({ vehicle_id: vehicleId, assigned_mechanic_id: mechA.id, description: tag });
    // Remove anything that slipped through so cleanup stays simple.
    await admin.from("jobs").delete().eq("description", tag);
    await admin.from("customers").delete().eq("full_name", tag);
    expect(cust.error).not.toBeNull();
    expect(job.error).not.toBeNull();
  });
});

describe("FR1 / D-009: status and frozen money columns cannot be written directly", () => {
  it.each([
    { status: "approved" },
    { quoted_total_cents: 1 },
    { approved_total_cents: 1 },
    { approved_at: "2026-01-01T00:00:00Z" },
    { collected_at: "2026-01-01T00:00:00Z" },
  ])("owner update %j is rejected", async (patch) => {
    const before = await getJob(quotedJob.id);
    const { error } = await ownerDb.from("jobs").update(patch).eq("id", quotedJob.id);
    expect(error).not.toBeNull();
    expect(await getJob(quotedJob.id)).toEqual(before);
  });
});

describe("FR1: anonymous (no session) sees nothing", () => {
  const tables = [
    "profiles",
    "settings",
    "customers",
    "vehicles",
    "jobs",
    "job_line_items",
    "job_events",
    "job_links",
    "job_totals",
    "rate_limits",
  ];

  it.each(tables)("%s: no rows for anon (admin sees rows)", async (table) => {
    if (table === "rate_limits") await admin.rpc("rate_limit_hit", { p_key: rateKey, p_max: 100, p_window_seconds: 60 });
    expect((await admin.from(table).select("*").limit(1)).data).toHaveLength(1);
    const { data } = await anonClient().from(table).select("*").limit(1);
    expect(data ?? []).toHaveLength(0);
  });

  it.each(["anon", "owner", "mechanic"])("%s cannot call public_job_by_token_hash or rate_limit_hit", async (who) => {
    const db = who === "anon" ? anonClient() : who === "owner" ? ownerDb : aDb;
    const lookup = await db.rpc("public_job_by_token_hash", { p_token_hash: link.hash });
    expect(lookup.data).toBeNull();
    expect(lookup.error).not.toBeNull();
    const hit = await db.rpc("rate_limit_hit", { p_key: rateKey, p_max: 100, p_window_seconds: 60 });
    expect(hit.data).toBeNull();
    expect(hit.error).not.toBeNull();
  });

  it("anon cannot call get_dashboard, create_job_link or search_customers", async () => {
    const anon = anonClient();
    expect((await anon.rpc("get_dashboard")).data).toBeNull();
    expect((await anon.rpc("create_job_link", { p_job_id: quotedJob.id, p_token_hash: newLinkToken().hash })).error).not.toBeNull();
    const search = await anon.rpc("search_customers", { p_query: "a" });
    expect(search.data ?? []).toHaveLength(0);
  });
});

function unwrapOne<T>(res: { data: T[] | null }): T {
  expect(res.data).toHaveLength(1);
  return (res.data as T[])[0];
}
