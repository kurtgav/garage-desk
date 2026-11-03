import { beforeEach, describe, expect, it, vi } from "vitest";

// D-110 two-step sign-in (TOTP): the requireStaff gate, /login/verify and the /profile card's actions.
// Auth itself (codes, aal, which sessions survive) is exercised end to end in e2e/mfa.spec.ts.
const ID = "11111111-1111-4111-8111-111111111111";

type FactorRow = { id: string; factor_type: string; status: string };
type Result = { data: unknown; error: unknown };

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string; factors?: FactorRow[] } | null,
  aal: "aal1" as string | null,
  amr: [] as { method: string; timestamp: number }[],
  profile: null as Record<string, unknown> | null,
  isRateLimited: vi.fn(async (): Promise<false | "limited" | "unavailable"> => false),
  challengeAndVerify: vi.fn(async (): Promise<Result> => ({ data: {}, error: null })),
  listFactorsError: null as unknown,
  enroll: vi.fn(async (): Promise<Result> => ({ data: { totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXP" } }, error: null })),
  unenroll: vi.fn(async (): Promise<Result> => ({ data: {}, error: null })),
  signOut: vi.fn(async () => ({ error: null })),
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("@/lib/data/profile", () => ({ AVATAR_BUCKET: "avatars" }));
// One profile row for both reads: getStaff (service role) and the sign-in check after the code (user client).
const profileChain = () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mocks.profile, error: null }) };
  return chain;
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: profileChain }) }));
vi.mock("@/lib/supabase/server", () => ({
  createStatelessClient: vi.fn(),
  createClient: async () => ({
    from: profileChain,
    auth: {
      getUser: async () => ({ data: { user: mocks.user } }),
      getClaims: async () => ({ data: { claims: { amr: mocks.amr } }, error: null }),
      signOut: mocks.signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: mocks.aal }, error: null }),
        challengeAndVerify: mocks.challengeAndVerify,
        enroll: mocks.enroll,
        unenroll: mocks.unenroll,
        listFactors: async () => {
          if (mocks.listFactorsError) return { data: null, error: mocks.listFactorsError };
          const all = mocks.user?.factors ?? [];
          return { data: { all, totp: all.filter((f) => f.factor_type === "totp" && f.status === "verified") }, error: null };
        },
      },
    },
  }),
}));

const { requireStaff } = await import("@/lib/auth");
const { verifyCode } = await import("@/app/login/actions");
const { startTwoStep, confirmTwoStep, turnOffTwoStep } = await import("@/app/(staff)/profile/actions");

const BAD_CODE = "That code didn't work. Check the code in your authenticator app and try again.";
const GENERIC = "Something went wrong. Please try again.";
const verified: FactorRow = { id: "f-on", factor_type: "totp", status: "verified" };
const pending: FactorRow = { id: "f-new", factor_type: "totp", status: "unverified" };

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

const row = (patch: Record<string, unknown> = {}) => ({
  id: ID,
  full_name: "Ivan Dimitrov",
  role: "mechanic",
  active: true,
  must_change_password: false,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: ID, email: "jun@garagedesk.test", factors: [] };
  mocks.aal = "aal1";
  mocks.amr = [{ method: "password", timestamp: Date.now() / 1000 }];
  mocks.profile = row();
  mocks.listFactorsError = null;
  mocks.isRateLimited.mockResolvedValue(false);
  mocks.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  mocks.unenroll.mockResolvedValue({ data: {}, error: null });
});

describe("requireStaff gate", () => {
  it("two-step on but no code yet (aal1) → /login/verify, before the forced password change", async () => {
    mocks.user!.factors = [verified];
    mocks.profile = row({ must_change_password: true });
    expect(await redirectOf(requireStaff)).toBe("/login/verify");
  });

  it("after the code (aal2) the app opens", async () => {
    mocks.user!.factors = [verified];
    mocks.aal = "aal2";
    expect(await requireStaff()).toMatchObject({ id: ID, mfaPending: false });
  });

  it.each([
    ["no factor", []],
    ["only an unfinished set-up", [pending]],
  ])("%s → no code asked", async (_name, factors) => {
    mocks.user!.factors = factors;
    expect(await requireStaff()).toMatchObject({ id: ID, mfaPending: false });
  });
});

describe("verifyCode (/login/verify)", () => {
  beforeEach(() => {
    mocks.user!.factors = [pending, verified];
  });

  it("the right code → the verified TOTP factor is checked, then the role home", async () => {
    expect(await redirectOf(() => verifyCode(null, form({ code: "123 456" })))).toBe("/jobs");
    expect(mocks.isRateLimited).toHaveBeenCalledWith("mfaVerify", ID);
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-on", code: "123456" });
    mocks.profile = row({ role: "owner" });
    expect(await redirectOf(() => verifyCode(null, form({ code: "123456" })))).toBe("/dashboard");
  });

  it("from a forgot-password link → back to /reset-password: Auth only takes the new password at aal2", async () => {
    mocks.amr = [{ method: "otp", timestamp: Date.now() / 1000 - 60 }];
    expect(await redirectOf(() => verifyCode(null, form({ code: "123456" })))).toBe("/reset-password");
  });

  it.each([
    ["limited", "Too many attempts. Please wait a few minutes and try again."],
    ["unavailable", GENERIC], // limiter DB error: fails closed (D-100)
  ] as const)("rate limit %s → refused before Auth", async (blocked, error) => {
    mocks.isRateLimited.mockResolvedValueOnce(blocked);
    expect(await verifyCode(null, form({ code: "123456" }))).toEqual({ ok: false, error });
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("Auth refuses the code → the one generic message, never Auth's text", async () => {
    mocks.challengeAndVerify.mockResolvedValueOnce({ data: null, error: { code: "mfa_verification_failed", message: "Invalid TOTP code entered" } });
    expect(await verifyCode(null, form({ code: "000000" }))).toEqual({ ok: false, error: BAD_CODE });
  });

  it.each(["12345", "1234567", "abcdef", ""])("%j is refused without asking Auth", async (code) => {
    expect(await verifyCode(null, form({ code }))).toEqual({ ok: false, error: BAD_CODE });
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("no verified factor → the same message", async () => {
    mocks.user!.factors = [pending];
    expect(await verifyCode(null, form({ code: "123456" }))).toEqual({ ok: false, error: BAD_CODE });
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it.each([
    ["inactive", row({ active: false })],
    ["missing", null],
  ])("%s profile after the code → signed out, generic failure", async (_name, profile) => {
    mocks.profile = profile;
    expect(await verifyCode(null, form({ code: "123456" }))).toEqual({ ok: false, error: BAD_CODE });
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("signed out → /login, nothing counted", async () => {
    mocks.user = null;
    expect(await redirectOf(() => verifyCode(null, form({ code: "123456" })))).toBe("/login");
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
  });
});

describe("/profile two-step actions", () => {
  it.each([
    ["startTwoStep", () => startTwoStep()],
    ["confirmTwoStep", () => confirmTwoStep(null, form({ code: "123456" }))],
    ["turnOffTwoStep", () => turnOffTwoStep()],
  ])("%s: requireStaff first (an aal1 session goes to /login/verify)", async (_name, act) => {
    mocks.user!.factors = [verified];
    expect(await redirectOf(act)).toBe("/login/verify");
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.unenroll).not.toHaveBeenCalled();
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("turn on: leftover unfinished TOTP set-ups go, then a new TOTP factor; QR and secret come back", async () => {
    mocks.user!.factors = [pending, { id: "p-old", factor_type: "phone", status: "unverified" }];
    expect(await startTwoStep()).toEqual({ ok: true, qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXP" });
    expect(mocks.unenroll.mock.calls).toEqual([[{ factorId: "f-new" }]]);
    expect(mocks.enroll).toHaveBeenCalledWith({ factorType: "totp", issuer: "Garage Desk" });
  });

  it.each([
    ["listing factors fails", () => (mocks.listFactorsError = { message: "boom" })],
    ["removing a leftover fails", () => mocks.unenroll.mockResolvedValueOnce({ data: null, error: { message: "boom" } })],
    ["enrolling fails", () => mocks.enroll.mockResolvedValueOnce({ data: null, error: { message: "boom" } })],
  ])("turn on: %s → generic error", async (_name, arrange) => {
    mocks.user!.factors = [pending];
    arrange();
    expect(await startTwoStep()).toEqual({ ok: false, error: GENERIC });
  });

  it("confirm: the first code verifies the unfinished factor", async () => {
    mocks.user!.factors = [pending];
    expect(await confirmTwoStep(null, form({ code: " 654321 " }))).toEqual({ ok: true });
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-new", code: "654321" });
  });

  it("confirm: a wrong or malformed code → the generic code message", async () => {
    mocks.user!.factors = [pending];
    mocks.challengeAndVerify.mockResolvedValueOnce({ data: null, error: { message: "Invalid TOTP code entered" } });
    expect(await confirmTwoStep(null, form({ code: "000000" }))).toEqual({ ok: false, error: BAD_CODE });
    expect(await confirmTwoStep(null, form({ code: "12ab56" }))).toEqual({ ok: false, error: BAD_CODE });
    expect(mocks.challengeAndVerify).toHaveBeenCalledTimes(1);
  });

  it("confirm: nothing being set up → generic error", async () => {
    expect(await confirmTwoStep(null, form({ code: "123456" }))).toEqual({ ok: false, error: GENERIC });
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("turn off: the verified TOTP factor is removed (aal2 session)", async () => {
    mocks.user!.factors = [verified];
    mocks.aal = "aal2";
    expect(await turnOffTwoStep()).toEqual({ ok: true });
    expect(mocks.unenroll.mock.calls).toEqual([[{ factorId: "f-on" }]]);
  });

  it("turn off: Auth refuses → generic error", async () => {
    mocks.user!.factors = [verified];
    mocks.aal = "aal2";
    mocks.unenroll.mockResolvedValueOnce({ data: null, error: { code: "insufficient_aal", message: "AAL2 required" } });
    expect(await turnOffTwoStep()).toEqual({ ok: false, error: GENERIC });
  });
});
