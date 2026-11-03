import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5 public auth flow: forgot password → /auth/confirm → reset password, and sign-in → role home.
const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(async (): Promise<false | "limited" | "unavailable"> => false),
  hasRecoverySession: vi.fn(async () => true),
  getStaff: vi.fn(),
  resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null }) as { data: unknown; error: unknown }),
  verifyOtp: vi.fn(async () => ({ error: null }) as { error: unknown }),
  updateUser: vi.fn(async () => ({ error: null }) as { error: unknown }),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  aal: vi.fn(async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) as { data: unknown; error: unknown }),
  profile: vi.fn(),
  after: vi.fn(),
}));

class Redirect extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getStaff: mocks.getStaff,
  hasRecoverySession: mocks.hasRecoverySession,
}));
vi.mock("@/lib/supabase/server", () => ({
  createStatelessClient: () => ({ auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } }),
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      verifyOtp: mocks.verifyOtp,
      updateUser: mocks.updateUser,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      mfa: { getAuthenticatorAssuranceLevel: mocks.aal },
    },
    from: () => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mocks.profile(), error: null }) };
      return chain;
    },
  }),
}));

const { requestPasswordReset } = await import("@/app/forgot-password/actions");
const { setNewPassword } = await import("@/app/reset-password/actions");
const { GET: confirm } = await import("@/app/auth/confirm/route");
const { signIn, signOut } = await import("@/app/login/actions");
const { RESET_EMAIL_OFF } = await import("@/lib/password");
const { NextRequest } = await import("next/server");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

/** The URL an action/route redirected to, or null when it returned normally. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    if (e instanceof Redirect) return e.message;
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PASSWORD_RESET_EMAIL", "on");
  mocks.isRateLimited.mockResolvedValue(false);
  mocks.hasRecoverySession.mockResolvedValue(true);
  mocks.getStaff.mockResolvedValue({ id: "m1", fullName: "Ivan Dimitrov", email: "jun@garagedesk.test", role: "mechanic" });
});

describe("requestPasswordReset (no account enumeration)", () => {
  it("answers before the email is sent (same timing for any address), then sends it after the response", async () => {
    expect(await requestPasswordReset(null, form({ email: " jun@garagedesk.test " }))).toEqual({ ok: true });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("jun@garagedesk.test");
  });

  it("unknown address → the same neutral ok; Auth's error is never surfaced", async () => {
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { code: "user_not_found" } });
    expect(await requestPasswordReset(null, form({ email: "nobody@example.com" }))).toEqual({ ok: true });
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeDefined();
  });

  it("invalid email → refused, no email sent", async () => {
    expect(await requestPasswordReset(null, form({ email: "nope" }))).toEqual({ ok: false, error: "Enter a valid email address." });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([
    ["limited", "Too many requests. Please wait a few minutes and try again."],
    ["unavailable", "Something went wrong. Please try again."], // limiter DB error: fails closed (D-100)
  ] as const)("rate limit %s (per client) → refused with the right sentence, no email sent", async (blocked, error) => {
    mocks.isRateLimited.mockResolvedValueOnce(blocked);
    expect(await requestPasswordReset(null, form({ email: "jun@garagedesk.test" }))).toEqual({ ok: false, error });
    expect(mocks.isRateLimited).toHaveBeenCalledWith("passwordReset");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("PASSWORD_RESET_EMAIL not on (no SMTP yet) → 'ask the owner' for every address, nothing sent (D-094)", async () => {
    vi.stubEnv("PASSWORD_RESET_EMAIL", "");
    expect(await requestPasswordReset(null, form({ email: "jun@garagedesk.test" }))).toEqual({ ok: false, error: RESET_EMAIL_OFF });
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("/auth/confirm", () => {
  const get = (query: string) => redirectOf(() => confirm(new NextRequest(`http://localhost:3000/auth/confirm${query}`)));

  it("valid recovery token → session → /reset-password", async () => {
    expect(await get("?token_hash=pkce_abc&type=recovery")).toBe("/reset-password");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "pkce_abc" });
  });

  it("used or expired token → /forgot-password?expired=1", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { code: "otp_expired" } });
    expect(await get("?token_hash=pkce_abc&type=recovery")).toBe("/forgot-password?expired=1");
  });

  it.each(["", "?type=recovery", "?token_hash=abc&type=signup", `?token_hash=${"a".repeat(300)}&type=recovery`])(
    "%s → expired, no Auth call",
    async (query) => {
      expect(await get(query)).toBe("/forgot-password?expired=1");
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
    },
  );
});

describe("setNewPassword", () => {
  const VALID = { password: "Brand-new-pass-1", confirm: "Brand-new-pass-1" };

  it("recovery session → password updated → role home", async () => {
    expect(await redirectOf(() => setNewPassword(null, form(VALID)))).toBe("/jobs");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: VALID.password });
  });

  it("no recovery session (signed out, or a normal password session) → /forgot-password, nothing changed", async () => {
    mocks.hasRecoverySession.mockResolvedValueOnce(false);
    expect(await redirectOf(() => setNewPassword(null, form(VALID)))).toBe("/forgot-password");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ confirm: "Different-pass-1" }, /don't match/],
    [{ password: "short1A", confirm: "short1A" }, /12 characters/],
  ])("%j is refused", async (patch, message) => {
    const res = await setNewPassword(null, form({ ...VALID, ...patch }));
    expect(!res.ok && res.error).toMatch(message);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("deactivated account → password set, signed out, /login", async () => {
    mocks.getStaff.mockResolvedValueOnce(null);
    expect(await redirectOf(() => setNewPassword(null, form(VALID)))).toBe("/login");
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("Auth refuses → sentence, no redirect", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: { code: "same_password" } });
    expect(await setNewPassword(null, form(VALID))).toEqual({
      ok: false,
      error: "Choose a password that is different from your current one.",
    });
  });
});

describe("signIn → role home", () => {
  it.each([
    ["owner", "/dashboard"],
    ["mechanic", "/jobs"],
  ])("%s lands on %s", async (role, home) => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.profile.mockReturnValue({ active: true, role });
    expect(await redirectOf(() => signIn(null, form({ email: "a@b.bg", password: "x" })))).toBe(home);
  });

  it.each([
    ["limited", "Too many sign-in attempts. Please wait a few minutes and try again."],
    ["unavailable", "Something went wrong. Please try again."], // limiter DB error: fails closed (D-100)
  ] as const)("rate limit %s → refused before Auth, email kept", async (blocked, error) => {
    mocks.isRateLimited.mockResolvedValueOnce(blocked);
    expect(await signIn(null, form({ email: "a@b.bg", password: "x" }))).toEqual({ ok: false, error, email: "a@b.bg" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("two-step sign-in on → /login/verify before the profile is read (RLS hides it at aal1, D-110)", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.aal.mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    expect(await redirectOf(() => signIn(null, form({ email: "a@b.bg", password: "x" })))).toBe("/login/verify");
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("inactive → signed out, generic error", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.profile.mockReturnValue({ active: false, role: "mechanic" });
    const res = await signIn(null, form({ email: "a@b.bg", password: "x" }));
    expect(res).toMatchObject({ ok: false, error: "Email or password is incorrect." });
    expect(mocks.signOut).toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("ends this device's session only; other devices stay signed in (D-092)", async () => {
    expect(await redirectOf(() => signOut())).toBe("/login");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
