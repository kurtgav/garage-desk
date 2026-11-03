import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Db,
  type StaffUser,
  addLine,
  cleanup,
  createCustomerWithVehicle,
  createJob,
  createLink,
  createStaff,
  customerTransition,
  mustTransition,
  publicJob,
  signInAs,
  unwrap,
} from "./helpers";

// Security audit hardening: data access ends with the session (D-109), two-step sign-in is enforced by RLS
// (D-110), staff names cannot pose as the customer or a colleague, and link decisions name who shared the link (D-111).

let owner: StaffUser, mech: StaffUser;
let ownerDb: Db, mechDb: Db;

beforeAll(async () => {
  [owner, mech] = await Promise.all([createStaff("owner", "Ivan Petrov"), createStaff("mechanic", "Hard Mechanic")]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mech)]);
});

afterAll(cleanup);

/** A client that only ever sends this access token (no refresh), like a copied cookie would. */
function pinnedTo(accessToken: string): Db {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as Db;
}

async function accessToken(db: Db): Promise<string> {
  const { data } = await db.auth.getSession();
  if (!data.session) throw new Error("no session");
  return data.session.access_token;
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) from a base32 secret. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

describe("data access ends with the session (D-109)", () => {
  it("after a global sign-out the old access token reads nothing", async () => {
    const staff = await createStaff("owner", "Session Owner");
    const db = await signInAs(staff);
    const pinned = pinnedTo(await accessToken(db));
    expect(unwrap(await pinned.from("settings").select("id"), "before")).toHaveLength(1);

    expect((await db.auth.signOut({ scope: "global" })).error).toBeNull();
    const after = await pinned.from("settings").select("id");
    expect(after.data ?? []).toHaveLength(0);
  });

  it("other sessions of the same account keep working after a local sign-out", async () => {
    const staff = await createStaff("owner", "Two Devices");
    const [phone, desk] = await Promise.all([signInAs(staff), signInAs(staff)]);
    await phone.auth.signOut({ scope: "local" });
    expect(unwrap(await desk.from("settings").select("id"), "other device")).toHaveLength(1);
  });
});

describe("two-step sign-in is enforced by the database (D-110)", () => {
  it("once enrolled, a password-only (aal1) session reads nothing; a verified (aal2) one does", async () => {
    const staff = await createStaff("owner", "Mfa Owner");
    const db = await signInAs(staff);
    const enrolled = await db.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || enrolled.data.type !== "totp") throw new Error(`enroll failed: ${enrolled.error?.message}`);
    // Before verification the factor is unverified: nothing changes yet.
    expect(unwrap(await db.from("settings").select("id"), "unverified factor")).toHaveLength(1);

    const verified = await db.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp(enrolled.data.totp.secret),
    });
    expect(verified.error).toBeNull();
    expect(unwrap(await db.from("settings").select("id"), "aal2")).toHaveLength(1);

    const passwordOnly = await signInAs(staff);
    expect((await passwordOnly.from("settings").select("id")).data ?? []).toHaveLength(0);
    expect((await passwordOnly.from("profiles").select("id")).data ?? []).toHaveLength(0);
  });
});

describe("staff names (D-111)", () => {
  it.each([
    ["Cyrillic look-alike letters", (n: string) => n.replace(/a/g, "а").replace(/o/g, "о")],
    ["an invisible character", (n: string) => `${n.slice(0, 2)}​${n.slice(2)}`],
    ["a doubled inner space", (n: string) => n.replace(" ", "  ")],
  ])("cannot take a colleague's name with %s (23505)", async (_label, variant) => {
    const { error } = await mechDb.from("profiles").update({ full_name: variant(owner.fullName) }).eq("id", mech.id);
    expect(error?.code).toBe("23505");
  });

  it.each(["Customer", "  customer ", "Сustomer", "CUSTOMER"])("cannot be called %j (23514)", async (name) => {
    const { error } = await mechDb.from("profiles").update({ full_name: name }).eq("id", mech.id);
    expect(error?.code).toBe("23514");
  });

  it("a Bulgarian name in Cyrillic is still fine", async () => {
    const { error } = await mechDb.from("profiles").update({ full_name: "Стефан Колев" }).eq("id", mech.id);
    expect(error).toBeNull();
    const restored = await mechDb.from("profiles").update({ full_name: mech.fullName }).eq("id", mech.id);
    expect(restored.error).toBeNull();
  });
});

describe("link decisions name who shared the link (D-111)", () => {
  it("records the mechanic who created the link on the customer's approval, staff-only", async () => {
    const { vehicle } = await createCustomerWithVehicle(ownerDb);
    const job = await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId: mech.id });
    await addLine(mechDb, { jobId: job.id, kind: "part", quantity: 1, unitPriceCents: 1000 });
    const quoted = await mustTransition(mechDb, job.id, "quoted");
    const link = await createLink(mechDb, job.id);
    unwrap(await customerTransition(job.id, "approved", link.hash, quoted.quote_version), "approve via link");

    const events = unwrap(
      await mechDb.from("job_events").select("to_status, channel, link_shared_by").eq("job_id", job.id).order("id"),
      "events",
    );
    expect(events).toContainEqual({ to_status: "approved", channel: "link", link_shared_by: mech.fullName });
    expect(events.filter((e) => e.to_status !== "approved").every((e) => e.link_shared_by === null)).toBe(true);

    const page = unwrap(await publicJob(link.hash), "public job");
    expect(JSON.stringify(page)).not.toContain(mech.fullName);
  });
});
