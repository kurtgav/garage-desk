import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, type StaffUser, admin, anonClient, cleanup, createStaff, signInAs } from "./helpers";

// Phase 5 RBAC matrix (PLAN "Phase 5", D-076…D-078): own profile edits, colleagues' data, owner-only
// activation, and the avatars bucket. The DB is the boundary; the UI only hides.

let owner: StaffUser, owner2: StaffUser, mechA: StaffUser, mechB: StaffUser;
let ownerDb: Db, owner2Db: Db, aDb: Db, bDb: Db;
const uploaded: string[] = [];

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const avatarPath = (user: StaffUser) => `${user.id}/${randomUUID()}.png`;

async function upload(db: Db, path: string, type = "image/png", body: Uint8Array = PNG) {
  const res = await db.storage.from("avatars").upload(path, body, { contentType: type, upsert: false });
  if (!res.error) uploaded.push(path);
  return res;
}

beforeAll(async () => {
  [owner, owner2, mechA, mechB] = await Promise.all([
    createStaff("owner", "Owner"),
    createStaff("owner", "Second Owner"),
    createStaff("mechanic", "Mechanic A"),
    createStaff("mechanic", "Mechanic B"),
  ]);
  [ownerDb, owner2Db, aDb, bDb] = await Promise.all([signInAs(owner), signInAs(owner2), signInAs(mechA), signInAs(mechB)]);
});

afterAll(async () => {
  if (uploaded.length) await admin.storage.from("avatars").remove(uploaded);
  await cleanup();
});

describe("own profile", () => {
  it("a mechanic edits their own name, phone and about", async () => {
    const { data, error } = await aDb
      .from("profiles")
      .update({ full_name: mechA.fullName, phone: "+359 88 123 4567", about: "Brakes and suspension." })
      .eq("id", mechA.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = await admin.from("profiles").select("phone, about, updated_at").eq("id", mechA.id).single();
    expect(row.data).toMatchObject({ phone: "+359 88 123 4567", about: "Brakes and suspension." });
  });

  it("cannot edit another staff member's profile (0 rows, unchanged)", async () => {
    const { data } = await aDb.from("profiles").update({ full_name: "Hacked" }).eq("id", mechB.id).select("id");
    expect(data ?? []).toHaveLength(0);
    const owners = await aDb.from("profiles").update({ about: "Hacked" }).eq("id", owner.id).select("id");
    expect(owners.data ?? []).toHaveLength(0);
    expect((await admin.from("profiles").select("full_name").eq("id", mechB.id).single()).data?.full_name).toBe(mechB.fullName);
  });

  it.each([{ role: "owner" }, { active: false }])("cannot change own %j (no column grant)", async (patch) => {
    const { error } = await aDb.from("profiles").update(patch).eq("id", mechA.id);
    expect(error?.code).toBe("42501");
    expect((await admin.from("profiles").select("role, active").eq("id", mechA.id).single()).data).toEqual({
      role: "mechanic",
      active: true,
    });
  });

  it("must_change_password: no client reads or clears it, not even their own; only the service role (D-106)", async () => {
    expect((await admin.from("profiles").update({ must_change_password: true }).eq("id", mechA.id)).error).toBeNull();
    for (const db of [aDb, ownerDb]) {
      expect((await db.from("profiles").select("must_change_password").eq("id", mechA.id)).error?.code).toBe("42501");
      expect((await db.from("profiles").update({ must_change_password: false }).eq("id", mechA.id)).error?.code).toBe("42501");
    }
    expect((await admin.from("profiles").select("must_change_password").eq("id", mechA.id).single()).data).toEqual({
      must_change_password: true,
    });
    expect((await admin.from("profiles").update({ must_change_password: false }).eq("id", mechA.id)).error).toBeNull();
  });

  it.each([
    [{ phone: "1".repeat(31) }],
    [{ about: "x".repeat(501) }],
    [{ full_name: "x".repeat(101) }],
    [{ full_name: "   " }],
  ])("limits hold in the DB: %j", async (patch) => {
    const { error } = await aDb.from("profiles").update(patch).eq("id", mechA.id);
    expect(error?.code).toBe("23514");
  });

  it("avatar_path can only point into the own folder", async () => {
    const { error } = await aDb.from("profiles").update({ avatar_path: avatarPath(mechB) }).eq("id", mechA.id);
    expect(error?.code).toBe("23514");
  });
});

describe("colleagues", () => {
  it("staff read colleagues' name, role and photo path", async () => {
    const { data, error } = await aDb.from("profiles").select("id, full_name, role, avatar_path").eq("id", mechB.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it.each(["phone", "about", "*"])("nobody reads %s through the API (not even the owner)", async (column) => {
    for (const db of [aDb, ownerDb]) {
      const { error } = await db.from("profiles").select(column).eq("id", mechB.id);
      expect(error?.code).toBe("42501");
    }
  });

  it("anon reads no profiles", async () => {
    const { data } = await anonClient().from("profiles").select("id, full_name");
    expect(data ?? []).toHaveLength(0);
  });
});

describe("set_staff_active (owner only, never self, at least one active owner)", () => {
  it("a mechanic cannot (de)activate anyone", async () => {
    const { error } = await aDb.rpc("set_staff_active", { p_profile_id: mechB.id, p_active: false });
    expect(error?.message).toBe("forbidden");
    expect((await admin.from("profiles").select("active").eq("id", mechB.id).single()).data?.active).toBe(true);
  });

  it("an owner cannot deactivate themselves", async () => {
    const { error } = await ownerDb.rpc("set_staff_active", { p_profile_id: owner.id, p_active: false });
    expect(error?.message).toBe("cannot_change_self");
  });

  it("unknown id → not_found", async () => {
    const { error } = await ownerDb.rpc("set_staff_active", { p_profile_id: randomUUID(), p_active: false });
    expect(error?.message).toBe("not_found");
  });

  it("deactivated mechanic loses everything at once; reactivation restores it", async () => {
    expect((await ownerDb.rpc("set_staff_active", { p_profile_id: mechB.id, p_active: false })).error).toBeNull();
    expect((await bDb.from("profiles").select("id")).data ?? []).toHaveLength(0);
    expect((await bDb.from("jobs").select("id")).data ?? []).toHaveLength(0);
    const own = await bDb.from("profiles").update({ about: "still here?" }).eq("id", mechB.id).select("id");
    expect(own.data ?? []).toHaveLength(0);
    expect((await upload(bDb, avatarPath(mechB))).error).not.toBeNull();

    expect((await ownerDb.rpc("set_staff_active", { p_profile_id: mechB.id, p_active: true })).error).toBeNull();
    expect((await bDb.from("profiles").select("id").eq("id", mechB.id)).data).toHaveLength(1);
  });

  it("deactivation ends every session: after reactivation the old refresh token is dead", async () => {
    const mechC = await createStaff("mechanic", "Mechanic C");
    const cDb = await signInAs(mechC);
    const refreshToken = (await cDb.auth.getSession()).data.session?.refresh_token;
    expect(refreshToken).toBeTruthy();

    expect((await ownerDb.rpc("set_staff_active", { p_profile_id: mechC.id, p_active: false })).error).toBeNull();
    expect((await ownerDb.rpc("set_staff_active", { p_profile_id: mechC.id, p_active: true })).error).toBeNull();

    const { error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken! });
    expect(error?.code).toBe("refresh_token_not_found");
    // A new sign-in after reactivation works.
    expect((await signInAs(mechC)).auth).toBeDefined();
  });

  it("the last active owner cannot be deactivated: a deactivated owner can no longer act", async () => {
    expect((await ownerDb.rpc("set_staff_active", { p_profile_id: owner2.id, p_active: false })).error).toBeNull();
    // owner2 is now inactive, so it cannot deactivate `owner` (who would otherwise be the last one).
    const { error } = await owner2Db.rpc("set_staff_active", { p_profile_id: owner.id, p_active: false });
    expect(error?.message).toBe("forbidden");
    expect((await admin.from("profiles").select("active").eq("id", owner.id).single()).data?.active).toBe(true);
    expect((await ownerDb.rpc("set_staff_active", { p_profile_id: owner2.id, p_active: true })).error).toBeNull();
  });

  it("anon cannot call it", async () => {
    const { error } = await anonClient().rpc("set_staff_active", { p_profile_id: mechB.id, p_active: false });
    expect(error).not.toBeNull();
  });
});

describe("avatars bucket", () => {
  let aPath: string;

  beforeAll(async () => {
    aPath = avatarPath(mechA);
    expect((await upload(aDb, aPath)).error).toBeNull();
  });

  it("other staff can read (sign) it; anon cannot", async () => {
    for (const db of [bDb, ownerDb]) {
      const { data, error } = await db.storage.from("avatars").createSignedUrl(aPath, 60);
      expect(error).toBeNull();
      expect(data?.signedUrl).toContain("/storage/v1/object/sign/avatars/");
    }
    const anon = await anonClient().storage.from("avatars").createSignedUrl(aPath, 60);
    expect(anon.data).toBeNull();
    const pub = await fetch(anonClient().storage.from("avatars").getPublicUrl(aPath).data.publicUrl);
    expect(pub.ok).toBe(false);
  });

  it("nobody writes into someone else's folder (not even the owner)", async () => {
    expect((await upload(bDb, avatarPath(mechA))).error).not.toBeNull();
    expect((await upload(ownerDb, avatarPath(mechA))).error).not.toBeNull();
  });

  it("nobody deletes someone else's photo", async () => {
    await bDb.storage.from("avatars").remove([aPath]);
    await ownerDb.storage.from("avatars").remove([aPath]);
    expect((await bDb.storage.from("avatars").createSignedUrl(aPath, 60)).error).toBeNull();
  });

  it("the bucket refuses SVG and files over 2 MB", async () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect((await upload(aDb, `${mechA.id}/${randomUUID()}.png`, "image/svg+xml", svg)).error).not.toBeNull();
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await upload(aDb, avatarPath(mechA), "image/png", big)).error).not.toBeNull();
  });

  it("the owner of the folder can delete their own photo", async () => {
    const path = avatarPath(mechA);
    expect((await upload(aDb, path)).error).toBeNull();
    const { data } = await aDb.storage.from("avatars").remove([path]);
    expect(data).toHaveLength(1);
  });
});
