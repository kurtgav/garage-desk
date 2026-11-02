import { beforeEach, describe, expect, it, vi } from "vitest";

// D-012 / D-100: per-client limits through rate_limit_hit; a DB error blocks the request (fails closed).
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  result: { data: false as boolean | null, error: null as unknown },
  forwardedFor: "203.0.113.7, 10.0.0.1" as string | null,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(mocks.forwardedFor ? { "x-forwarded-for": mocks.forwardedFor } : {}),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: async (fn: string, args: unknown) => (mocks.rpc(fn, args), mocks.result) }),
}));

const { isRateLimited, LIMITS } = await import("@/lib/rate-limit");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.result = { data: false, error: null };
  mocks.forwardedFor = "203.0.113.7, 10.0.0.1";
});

describe("isRateLimited", () => {
  it("under the limit → false (go ahead)", async () => {
    expect(await isRateLimited("login")).toBe(false);
  });

  it("over the limit → limited", async () => {
    mocks.result = { data: true, error: null };
    expect(await isRateLimited("login")).toBe("limited");
  });

  it("the DB call fails → unavailable, never a pass (fails closed)", async () => {
    mocks.result = { data: null, error: { message: "connection refused" } };
    expect(await isRateLimited("publicView")).toBe("unavailable");
  });

  it("sends the bucket's limits and a hash of bucket + first forwarded IP, never the IP itself", async () => {
    await isRateLimited("passwordReset");
    const [fn, args] = mocks.rpc.mock.calls[0] as [string, { p_key: string; p_max: number; p_window_seconds: number }];
    expect(fn).toBe("rate_limit_hit");
    expect(args).toMatchObject({ p_max: LIMITS.passwordReset.max, p_window_seconds: LIMITS.passwordReset.windowSeconds });
    expect(args.p_key).toMatch(/^[0-9a-f]{64}$/);

    await isRateLimited("login"); // same client, other bucket → other key
    mocks.forwardedFor = "198.51.100.2"; // other client, same bucket → other key
    await isRateLimited("passwordReset");
    const keys = mocks.rpc.mock.calls.map(([, a]) => (a as { p_key: string }).p_key);
    expect(new Set(keys).size).toBe(3);
  });
});
