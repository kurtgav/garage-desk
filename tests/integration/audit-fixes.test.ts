import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Db,
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
  mustTransition,
  rand,
  signInAs,
  unwrap,
} from "./helpers";

// QA audit fixes: timeline actor-name snapshots and unique staff names (D-091), the dashboard workload with
// deactivated mechanics (D-092), and link lookups that don't count as a customer view (D-093).

let owner: StaffUser, mech: StaffUser, leaver: StaffUser, idle: StaffUser;
let ownerDb: Db, mechDb: Db;

beforeAll(async () => {
  [owner, mech, leaver, idle] = await Promise.all([
    createStaff("owner", "Audit Owner"),
    createStaff("mechanic", "Audit Mechanic"),
    createStaff("mechanic", "Audit Leaver"),
    createStaff("mechanic", "Audit Idle"),
  ]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mech)]);
});

afterAll(cleanup);

/** A job assigned to `mechanicId`, with one part line, quoted by `quoter`. */
async function quotedJob(mechanicId: string, quoter: Db) {
  const { vehicle } = await createCustomerWithVehicle(ownerDb);
  const job = await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId });
  await addLine(quoter, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 1000 });
  return mustTransition(quoter, job.id, "quoted");
}

const eventsOf = async (jobId: string) =>
  unwrap(
    await admin.from("job_events").select("to_status, actor_name").eq("job_id", jobId).order("created_at").order("id"),
    "select events",
  );

describe("timeline actor names are a snapshot (D-091)", () => {
  it("renaming a mechanic keeps the old name on their past events; customer decisions say Customer", async () => {
    const quoted = await quotedJob(mech.id, mechDb);
    const link = await createLink(ownerDb, quoted.id);
    unwrap(await customerTransition(quoted.id, "approved", link.hash, quoted.quote_version), "customer approve");

    const renamed = `Renamed Mechanic ${rand()}`;
    unwrap(await mechDb.from("profiles").update({ full_name: renamed }).eq("id", mech.id).select("id"), "rename");
    await mustTransition(mechDb, quoted.id, "in_progress");

    const events = await eventsOf(quoted.id);
    expect(events).toContainEqual({ to_status: "quoted", actor_name: mech.fullName });
    expect(events).toContainEqual({ to_status: "approved", actor_name: "Customer" });
    expect(events).toContainEqual({ to_status: "in_progress", actor_name: renamed });
    expect(events.every((e) => e.actor_name.trim() !== "")).toBe(true);
  });

  it.each([
    ["the same name in other case", (name: string) => name.toUpperCase()],
    ["the same name with outer spaces", (name: string) => `  ${name.toLowerCase()} `],
  ])("a staff member cannot take another's name: %s (23505)", async (_label, variant) => {
    const { error } = await mechDb.from("profiles").update({ full_name: variant(owner.fullName) }).eq("id", mech.id);
    expect(error?.code).toBe("23505");
  });
});

describe("dashboard workload (D-092)", () => {
  it("keeps a deactivated mechanic who still holds open jobs (active: false) and always adds up", async () => {
    await quotedJob(leaver.id, ownerDb);
    for (const who of [leaver, idle]) {
      expect((await ownerDb.rpc("set_staff_active", { p_profile_id: who.id, p_active: false })).error).toBeNull();
    }

    type Row = { mechanic_id: string; active: boolean; total_open: number };
    const dash = unwrap(await ownerDb.rpc("get_dashboard"), "get_dashboard") as { workload: Row[] };
    expect(dash.workload.find((w) => w.mechanic_id === leaver.id)).toMatchObject({ active: false, total_open: 1 });
    expect(dash.workload.find((w) => w.mechanic_id === mech.id)).toMatchObject({ active: true });
    expect(dash.workload.some((w) => w.mechanic_id === idle.id)).toBe(false);

    const open = await admin.from("jobs").select("id", { count: "exact", head: true }).not("status", "in", "(collected,cancelled)");
    expect(dash.workload.reduce((sum, w) => sum + w.total_open, 0)).toBe(open.count);
  });
});

describe("customer link lookups (D-093)", () => {
  it("p_count_view false leaves last_viewed_at alone; the default stamps it", async () => {
    const quoted = await quotedJob(mech.id, mechDb);
    const link = await createLink(ownerDb, quoted.id);
    const lastViewed = async () =>
      unwrap(await admin.from("job_links").select("last_viewed_at").eq("token_hash", link.hash).single(), "select link")
        .last_viewed_at;

    const peek = await admin.rpc("public_job_by_token_hash", { p_token_hash: link.hash, p_count_view: false });
    expect(peek.error).toBeNull();
    expect(peek.data).not.toBeNull();
    expect(await lastViewed()).toBeNull();

    expect((await admin.rpc("public_job_by_token_hash", { p_token_hash: link.hash })).error).toBeNull();
    expect(await lastViewed()).not.toBeNull();
  });

  it.each(["anon", "mechanic"])("%s cannot call the lookup, with or without p_count_view", async (who) => {
    const db = who === "anon" ? anonClient() : mechDb;
    const hash = "0".repeat(64);
    expect((await db.rpc("public_job_by_token_hash", { p_token_hash: hash, p_count_view: false })).error).not.toBeNull();
    expect((await db.rpc("public_job_by_token_hash", { p_token_hash: hash })).error).not.toBeNull();
  });
});
