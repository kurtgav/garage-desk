import { beforeEach, describe, expect, it, vi } from "vitest";

// D-067: a signed-in staff member pressing Approve/Decline on a customer link is refused before any DB call.
const mocks = vi.hoisted(() => ({
  getStaff: vi.fn(),
  createAdminClient: vi.fn(),
  isRateLimited: vi.fn(async () => false),
}));
vi.mock("@/lib/auth", () => ({ getStaff: mocks.getStaff }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { approveQuote, declineQuote } = await import("@/app/[token]/actions");
const { STAFF_ON_CUSTOMER_LINK } = await import("@/lib/data/errors");

function form(): FormData {
  const f = new FormData();
  f.set("token", "A".repeat(43));
  f.set("expected_version", "1");
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("customer link actions refuse signed-in staff (D-067)", () => {
  it.each([
    ["approve", () => approveQuote(null, form())],
    ["decline", () => declineQuote(null, form())],
  ])("%s: staff session → refused, no rate-limit hit, no DB call", async (_name, act) => {
    mocks.getStaff.mockResolvedValue({ id: "m1", fullName: "Ivan Dimitrov", role: "mechanic" });
    expect(await act()).toEqual({ ok: false, error: STAFF_ON_CUSTOMER_LINK });
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("no staff session → proceeds to the link lookup", async () => {
    mocks.getStaff.mockResolvedValue(null);
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle };
    mocks.createAdminClient.mockReturnValue({ from: () => chain });
    const result = await approveQuote(null, form());
    expect(mocks.createAdminClient).toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "This link is no longer valid." });
  });
});
