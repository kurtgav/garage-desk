import { beforeEach, describe, expect, it, vi } from "vitest";

// D-106: after a temporary password from the owner, nothing opens until the person sets their own.
const ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111", email: "jun@garagedesk.test" } as { id: string; email: string } | null,
  profile: null as Record<string, unknown> | null,
  updateUser: vi.fn(async () => ({ error: null }) as { error: unknown }),
  flagUpdate: vi.fn(),
  flagError: null as unknown,
  hasRecoverySession: vi.fn(async () => true),
}));

class Redirect extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new Error("404");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.user } }),
      getClaims: async () => ({ data: null }),
      updateUser: mocks.updateUser,
    },
  }),
}));
// getStaff reads the caller's own row with the service role (no grant to `authenticated`); the actions clear it.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: mocks.profile, error: null }) };
        return chain;
      },
      update: (patch: unknown) => ({
        eq: async (_col: string, id: string) => (mocks.flagUpdate(id, patch), { error: mocks.flagError }),
      }),
    }),
  }),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  hasRecoverySession: mocks.hasRecoverySession,
}));

const { requireStaff, getStaff } = await import("@/lib/auth");
const { setOwnPassword, setNewPassword } = await import("@/app/reset-password/actions");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

/** The URL it redirected to, or null when it returned normally. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    if (e instanceof Redirect) return e.message;
    throw e;
  }
}

const VALID = { password: "My-own-password-1", confirm: "My-own-password-1" };
const row = (patch: Record<string, unknown> = {}) => ({
  id: ID,
  full_name: "Ivan Dimitrov",
  role: "mechanic",
  active: true,
  must_change_password: true,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: ID, email: "jun@garagedesk.test" };
  mocks.profile = row();
  mocks.flagError = null;
  mocks.updateUser.mockResolvedValue({ error: null });
});

describe("requireStaff gate", () => {
  it("a flagged account is sent to /set-password", async () => {
    expect(await redirectOf(requireStaff)).toBe("/set-password");
  });

  it("an unflagged account passes; signed out still goes to /login", async () => {
    mocks.profile = row({ must_change_password: false });
    expect(await requireStaff()).toMatchObject({ id: ID, role: "mechanic", mustChangePassword: false });
    mocks.user = null;
    expect(await redirectOf(requireStaff)).toBe("/login");
  });

  it("getStaff still reports the flag (the /set-password page and action use it)", async () => {
    expect(await getStaff()).toMatchObject({ id: ID, mustChangePassword: true });
  });
});

describe("setOwnPassword", () => {
  it("sets the password on the caller's own session, clears the flag, then goes to the role home", async () => {
    expect(await redirectOf(() => setOwnPassword(null, form(VALID)))).toBe("/jobs");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: VALID.password });
    expect(mocks.flagUpdate).toHaveBeenCalledWith(ID, { must_change_password: false });
    expect(mocks.updateUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.flagUpdate.mock.invocationCallOrder[0]);
  });

  it("the temporary password again → Auth refuses (same_password), the flag stays", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: { code: "same_password" } });
    expect(await setOwnPassword(null, form(VALID))).toEqual({
      ok: false,
      error: "Choose a password that is different from your current one.",
    });
    expect(mocks.flagUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [{ password: "short1A", confirm: "short1A" }, /12 characters/],
    [{ password: "nouppercase123", confirm: "nouppercase123" }, /uppercase/],
    [{ confirm: "Something-else-1" }, /don't match/],
  ])("%j is refused before any Auth call", async (patch, message) => {
    const res = await setOwnPassword(null, form({ ...VALID, ...patch }));
    expect(!res.ok && res.error).toMatch(message);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("the flag can't be cleared → error (they are asked again)", async () => {
    mocks.flagError = { message: "boom" };
    expect(await setOwnPassword(null, form(VALID))).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });

  it("not flagged → straight to the role home, nothing changed", async () => {
    mocks.profile = row({ role: "owner", must_change_password: false });
    expect(await redirectOf(() => setOwnPassword(null, form(VALID)))).toBe("/dashboard");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("signed out or deactivated → /login, nothing changed", async () => {
    mocks.profile = row({ active: false });
    expect(await redirectOf(() => setOwnPassword(null, form(VALID)))).toBe("/login");
    mocks.user = null;
    expect(await redirectOf(() => setOwnPassword(null, form(VALID)))).toBe("/login");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("setNewPassword (recovery link)", () => {
  it("a password chosen through the recovery link also counts as their own: the flag is cleared", async () => {
    expect(await redirectOf(() => setNewPassword(null, form(VALID)))).toBe("/jobs");
    expect(mocks.flagUpdate).toHaveBeenCalledWith(ID, { must_change_password: false });
  });

  it("not flagged → no flag write", async () => {
    mocks.profile = row({ must_change_password: false });
    expect(await redirectOf(() => setNewPassword(null, form(VALID)))).toBe("/jobs");
    expect(mocks.flagUpdate).not.toHaveBeenCalled();
  });
});
