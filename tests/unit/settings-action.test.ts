import { beforeEach, describe, expect, it, vi } from "vitest";

// FR9 boundary validation of saveSettings; the DB write (RLS) is mocked here and covered by integration tests.
const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  updateSettings: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/auth", () => ({ requireStaff: mocks.requireStaff }));
vi.mock("@/lib/data/settings", () => ({ updateSettings: mocks.updateSettings }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveSettings } = await import("@/app/(staff)/settings/actions");

const VALID = {
  hourly_rate: "45.00",
  vat_percent: "20",
  garage_name: "Petrov Auto Service",
  garage_address: "27 Tsarigradsko Shose Blvd, 1113 Sofia",
  garage_phone: "+359 2 812 3456",
};

function form(overrides: Partial<Record<keyof typeof VALID, string>> = {}): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...VALID, ...overrides })) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ id: "o1", fullName: "Georgi Petrov", role: "owner" });
});

describe("saveSettings (FR9)", () => {
  it("saves trimmed text, the rate in cents and VAT in basis points", async () => {
    const result = await saveSettings(null, form({ garage_name: "  Petrov Auto  ", hourly_rate: "€1 234,50", vat_percent: "20,5 %" }));
    expect(result).toEqual({ ok: true });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      garageName: "Petrov Auto",
      garageAddress: VALID.garage_address,
      garagePhone: VALID.garage_phone,
      hourlyRateCents: 123450,
      vatBps: 2050,
    });
  });

  it.each([
    ["45", 4500],
    ["45.5", 4550],
    ["45,50", 4550],
    ["€45.00", 4500],
  ])("rate %s → %d cents", async (rate, cents) => {
    await saveSettings(null, form({ hourly_rate: rate }));
    expect(mocks.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ hourlyRateCents: cents }));
  });

  it.each([
    ["0", 0],
    ["0%", 0],
    ["100", 10000],
    ["12.25", 1225],
  ])("VAT %s → %d bps", async (vat, bps) => {
    await saveSettings(null, form({ vat_percent: vat }));
    expect(mocks.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ vatBps: bps }));
  });

  it.each([
    ["hourly_rate", "0", /hourly rate/],
    ["hourly_rate", "-45", /hourly rate/],
    ["hourly_rate", "45.555", /hourly rate/],
    ["hourly_rate", "1,234", /hourly rate/], // ambiguous
    ["hourly_rate", "abc", /hourly rate/],
    ["vat_percent", "100.01", /VAT/],
    ["vat_percent", "-1", /VAT/],
    ["vat_percent", "20.125", /VAT/],
    ["vat_percent", "", /VAT/],
    ["garage_name", "   ", /Enter the garage name/],
    ["garage_name", "x".repeat(101), /100 characters/],
    ["garage_address", "x".repeat(201), /200 characters/],
    ["garage_phone", "x".repeat(31), /30 characters/],
  ] as const)("%s = %j is refused and nothing is saved", async (field, value, message) => {
    const result = await saveSettings(null, form({ [field]: value }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("a mechanic is refused before any write", async () => {
    mocks.requireStaff.mockResolvedValue({ id: "m1", fullName: "Ivan Dimitrov", role: "mechanic" });
    expect(await saveSettings(null, form())).toEqual({ ok: false, error: "You don't have permission to do that." });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("passes the data layer's error through", async () => {
    mocks.updateSettings.mockResolvedValueOnce({ ok: false, error: "Could not save the settings. Please try again." } as never);
    expect(await saveSettings(null, form())).toEqual({ ok: false, error: "Could not save the settings. Please try again." });
  });
});
