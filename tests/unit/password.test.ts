import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClaims: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.getClaims } }) }));

const { generateTempPassword, newPasswordSchema, passwordErrorMessage } = await import("@/lib/password");
const { hasRecoverySession, roleHome } = await import("@/lib/auth");

beforeEach(() => vi.clearAllMocks());

describe("new password rule (mirrors Supabase Auth: 12+, lower, upper, digit)", () => {
  it.each(["Abcdefghijk1", "x".repeat(60) + "A1", "Garage-Desk-2026"])("accepts %j", (pw) => {
    expect(newPasswordSchema.safeParse(pw).success).toBe(true);
  });

  it.each([
    ["Abcdefghij1", /12 characters/],
    ["abcdefghijk1", /uppercase/],
    ["ABCDEFGHIJK1", /lowercase/],
    ["Abcdefghijkl", /digit/],
    ["Aa1" + "x".repeat(70), /72/],
  ])("refuses %j", (pw, message) => {
    const res = newPasswordSchema.safeParse(pw);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toMatch(message);
  });
});

describe("generateTempPassword", () => {
  it("always satisfies the rule, avoids look-alikes and does not repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const pw = generateTempPassword();
      expect(newPasswordSchema.safeParse(pw).success).toBe(true);
      expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
      seen.add(pw);
    }
    expect(seen.size).toBe(500);
  });
});

describe("passwordErrorMessage", () => {
  it("maps Auth codes to sentences and nothing else", () => {
    expect(passwordErrorMessage("reauthentication_needed")).toBe("Please sign in again to change your password.");
    expect(passwordErrorMessage("same_password")).toMatch(/different/);
    expect(passwordErrorMessage("weak_password")).toMatch(/12 characters/);
    expect(passwordErrorMessage("unexpected_failure")).toBeNull();
    expect(passwordErrorMessage(undefined)).toBeNull();
  });
});

describe("auth helpers", () => {
  it("roleHome: owner → /dashboard, mechanic → /jobs", () => {
    expect(roleHome("owner")).toBe("/dashboard");
    expect(roleHome("mechanic")).toBe("/jobs");
  });

  const now = Math.floor(Date.now() / 1000);
  it.each([
    ["recovery link opened just now", [{ method: "otp", timestamp: now - 5 }], true],
    ["recovery link opened 59 min ago", [{ method: "otp", timestamp: now - 59 * 60 }], true],
    ["recovery link opened 61 min ago", [{ method: "otp", timestamp: now - 61 * 60 }], false],
    ["otp without a timestamp", ["otp"], false],
    ["password sign-in", [{ method: "password", timestamp: now }], false],
    ["no amr", undefined, false],
  ])("hasRecoverySession: %s → %s", async (_name, amr, expected) => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { amr } }, error: null });
    expect(await hasRecoverySession()).toBe(expected);
  });

  it("hasRecoverySession without a session → false", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    expect(await hasRecoverySession()).toBe(false);
  });
});
