import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5 /staff actions (owner only): refusal, validation, call order. The RPC guards are in integration.
const OWNER = { id: "00000000-0000-4000-8000-000000000001", fullName: "Georgi Petrov", email: "owner@garagedesk.test", role: "owner" };
const MECH = "00000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => {
  const state = {
    created: { data: { user: { id: "new-user" } }, error: null } as { data: { user: { id: string } | null }; error: unknown },
    insertError: null as unknown,
    rpcError: null as unknown,
    updateUserErrors: [] as unknown[], // one per call, in order; then no error
    profileRow: { role: "mechanic", active: true } as { role: string; active: boolean } | null,
    flagError: null as unknown,
  };
  return {
    state,
    requireOwner: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    updateUserById: vi.fn(),
    insert: vi.fn(),
    flag: vi.fn(),
    rpc: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: async (attrs: unknown) => (mocks.createUser(attrs), mocks.state.created),
        deleteUser: mocks.deleteUser,
        updateUserById: async (id: string, attrs: unknown) => (mocks.updateUserById(id, attrs), { error: mocks.state.updateUserErrors.shift() ?? null }),
      },
    },
    from: () => ({
      insert: async (row: unknown) => (mocks.insert(row), { error: mocks.state.insertError }),
      update: (patch: unknown) => ({
        eq: async (_col: string, id: string) => (mocks.flag(id, patch), { error: mocks.state.flagError }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: unknown) => (mocks.rpc(fn, args), { error: mocks.state.rpcError }),
    from: () => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mocks.state.profileRow, error: null }) };
      return chain;
    },
  }),
}));

const { createStaff, setStaffActive, resetStaffPassword } = await import("@/app/(staff)/staff/actions");
const { newPasswordSchema } = await import("@/lib/password");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue(OWNER);
  Object.assign(mocks.state, {
    created: { data: { user: { id: "new-user" } }, error: null },
    insertError: null,
    rpcError: null,
    updateUserErrors: [],
    profileRow: { role: "mechanic", active: true },
    flagError: null,
  });
});

describe("owner only", () => {
  it.each([
    ["createStaff", () => createStaff(null, form({ full_name: "Petar", email: "petar@garagedesk.test" }))],
    ["setStaffActive", () => setStaffActive(null, form({ id: MECH, active: "false" }))],
    ["resetStaffPassword", () => resetStaffPassword(null, form({ id: MECH }))],
  ])("%s: a mechanic gets the 404 before anything happens", async (_name, act) => {
    mocks.requireOwner.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(act()).rejects.toThrow("404");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});

describe("createStaff", () => {
  it("creates a confirmed Auth user with a strong one-time password and a mechanic profile", async () => {
    const res = await createStaff(null, form({ full_name: "  Petar Ivanov ", email: " Petar@GarageDesk.test " }));
    expect(res.ok).toBe(true);
    const tempPassword = res.ok ? res.tempPassword : "";
    expect(newPasswordSchema.safeParse(tempPassword).success).toBe(true);
    expect(mocks.createUser).toHaveBeenCalledWith({ email: "petar@garagedesk.test", password: tempPassword, email_confirm: true });
    // They must set their own password at first sign-in (D-106).
    expect(mocks.insert).toHaveBeenCalledWith({
      id: "new-user",
      full_name: "Petar Ivanov",
      role: "mechanic",
      active: true,
      must_change_password: true,
    });
  });

  it.each([
    [{ full_name: "", email: "a@b.bg" }, /Enter their name/],
    [{ full_name: "x".repeat(101), email: "a@b.bg" }, /100 characters/],
    [{ full_name: "Petar", email: "not-an-email" }, /valid email/],
  ])("%j is refused before any Auth call", async (fields, message) => {
    const res = await createStaff(null, form(fields));
    expect(!res.ok && res.error).toMatch(message);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("an email that already has an account → friendly message", async () => {
    mocks.state.created = { data: { user: null }, error: { code: "email_exists", message: "A user with this email address has already been registered" } };
    expect(await createStaff(null, form({ full_name: "Petar", email: "jun@garagedesk.test" }))).toEqual({
      ok: false,
      error: "That email already has an account.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("profile insert fails → the Auth user is deleted again (no half-made account)", async () => {
    mocks.state.insertError = { message: "boom" };
    const res = await createStaff(null, form({ full_name: "Petar", email: "petar@garagedesk.test" }));
    expect(res.ok).toBe(false);
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("a name another staff member already uses → NAME_TAKEN, Auth user deleted (D-091)", async () => {
    mocks.state.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    expect(await createStaff(null, form({ full_name: "Georgi Petrov", email: "g2@garagedesk.test" }))).toEqual({
      ok: false,
      error: "Another staff member already uses that name.",
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
  });
});

describe("setStaffActive", () => {
  it("deactivate: RPC as the owner, then an Auth ban (signs them out everywhere)", async () => {
    expect(await setStaffActive(null, form({ id: MECH, active: "false" }))).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("set_staff_active", { p_profile_id: MECH, p_active: false });
    expect(mocks.updateUserById).toHaveBeenCalledWith(MECH, { ban_duration: "876000h" });
  });

  it("reactivate: RPC, then the ban is lifted", async () => {
    expect(await setStaffActive(null, form({ id: MECH, active: "true" }))).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("set_staff_active", { p_profile_id: MECH, p_active: true });
    expect(mocks.updateUserById).toHaveBeenCalledWith(MECH, { ban_duration: "none" });
  });

  it("the ban call fails once → retried, still ok (D-092)", async () => {
    mocks.state.updateUserErrors = [{ message: "network" }];
    expect(await setStaffActive(null, form({ id: MECH, active: "false" }))).toEqual({ ok: true });
    expect(mocks.updateUserById).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["false", "Deactivated, but signing them out failed. Try again."],
    ["true", "Reactivated, but unblocking their sign-in failed. Try again."],
  ])("active=%s: the ban fails twice → partial-success message", async (active, error) => {
    mocks.state.updateUserErrors = [{ message: "a" }, { message: "b" }];
    expect(await setStaffActive(null, form({ id: MECH, active }))).toEqual({ ok: false, error });
    expect(mocks.updateUserById).toHaveBeenCalledTimes(2);
  });

  it("never self", async () => {
    expect(await setStaffActive(null, form({ id: OWNER.id, active: "false" }))).toEqual({
      ok: false,
      error: "You can't deactivate your own account.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["last_owner", "The garage needs at least one active owner."],
    ["cannot_change_self", "You can't deactivate your own account."],
    ["not_found", "This staff member doesn't exist."],
    ["forbidden", "You don't have permission to do that."],
  ])("DB %s → sentence, no ban", async (message, sentence) => {
    mocks.state.rpcError = { code: "P0001", message };
    expect(await setStaffActive(null, form({ id: MECH, active: "false" }))).toEqual({ ok: false, error: sentence });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it.each([{ id: "nope", active: "false" }, { id: MECH, active: "maybe" }])("%j is refused", async (fields) => {
    expect((await setStaffActive(null, form(fields))).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("resetStaffPassword", () => {
  it("sets a strong one-time password and returns it once", async () => {
    const res = await resetStaffPassword(null, form({ id: MECH }));
    expect(res.ok).toBe(true);
    const tempPassword = res.ok ? res.tempPassword : "";
    expect(newPasswordSchema.safeParse(tempPassword).success).toBe(true);
    expect(mocks.updateUserById).toHaveBeenCalledWith(MECH, { password: tempPassword });
  });

  it("flags the forced password change before replacing the password (D-106)", async () => {
    expect((await resetStaffPassword(null, form({ id: MECH }))).ok).toBe(true);
    expect(mocks.flag).toHaveBeenCalledWith(MECH, { must_change_password: true });
    expect(mocks.flag.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUserById.mock.invocationCallOrder[0]);
  });

  it("the flag can't be set → error, the password is left alone", async () => {
    mocks.state.flagError = { message: "boom" };
    expect(await resetStaffPassword(null, form({ id: MECH }))).toEqual({ ok: false, error: "Something went wrong. Please try again." });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it.each([
    ["another owner", "00000000-0000-4000-8000-000000000003"],
    ["themselves", OWNER.id],
  ])("an owner's password (%s) is never reset here", async (_name, id) => {
    mocks.state.profileRow = { role: "owner", active: true };
    expect(await resetStaffPassword(null, form({ id }))).toEqual({
      ok: false,
      error: "Owners change their own password on their profile.",
    });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("a deactivated mechanic → reactivate first, no Auth call (D-092)", async () => {
    mocks.state.profileRow = { role: "mechanic", active: false };
    expect(await resetStaffPassword(null, form({ id: MECH }))).toEqual({ ok: false, error: "Reactivate them first." });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.flag).not.toHaveBeenCalled();
  });

  it("not a staff profile → not found, no Auth call", async () => {
    mocks.state.profileRow = null;
    expect(await resetStaffPassword(null, form({ id: MECH }))).toEqual({ ok: false, error: "This staff member doesn't exist." });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});
