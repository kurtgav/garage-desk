import { describe, expect, it } from "vitest";
import {
  bpsToPercentString,
  formatCents,
  formatQuantity,
  formatLineAmount,
  parseMoneyToCents,
  parseQuantity,
  percentToBps,
} from "@/lib/money";

describe("formatCents", () => {
  it.each([
    [7560, "€75.60"], // FR4 AC2 total
    [6300, "€63.00"],
    [1260, "€12.60"],
    [4096, "€40.96"], // FR4 AC3 total
    [0, "€0.00"],
    [5, "€0.05"],
    [100, "€1.00"],
    [100000, "€1,000.00"],
    [123456789012, "€1,234,567,890.12"],
    [-7560, "-€75.60"],
    [-5, "-€0.05"],
  ])("%d → %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it("formats bigint beyond Number.MAX_SAFE_INTEGER exactly", () => {
    expect(formatCents(BigInt("9007199254740993"))).toBe("€90,071,992,547,409.93");
  });

  it("renders a dash for missing values", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });
});

describe("formatLineAmount (exact, D-048)", () => {
  it.each([
    [5687.5, "€56.875"], // 1.25 h × €45.50
    ["5687.50", "€56.875"],
    [612.5, "€6.125"], // 0.5 × €12.25
    [3412.5, "€34.125"], // 0.75 h × €45.50
    ["6300.00", "€63.00"],
    [6300, "€63.00"],
    [0.33, "€0.0033"],
    [5, "€0.05"],
    [0, "€0.00"],
    [123456789.25, "€1,234,567.8925"],
    [-612.5, "-€6.125"],
    ["-0.00", "€0.00"],
  ])("%j → %s", (cents, expected) => {
    expect(formatLineAmount(cents)).toBe(expected);
  });

  it.each([null, undefined, "abc", "1e21"])("%j → dash", (v) => {
    expect(formatLineAmount(v as never)).toBe("—");
  });
});

describe("parseMoneyToCents (D-055)", () => {
  it.each([
    ["1234.56", 123456],
    ["1234,56", 123456],
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["1 234,56", 123456],
    ["1 234,56", 123456], // no-break space
    ["€45.50", 4550],
    ["45,5 €", 4550],
    ["EUR 45", 4500],
    ["1,234,567", 123456700],
    ["1.234.567,89", 123456789],
    ["12,5", 1250],
    ["0.05", 5],
    ["0", 0],
    ["21474836.47", 2_147_483_647], // int4 max
  ])("%j → %d", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each([
    "1,234", // ambiguous: thousands or 3 decimals
    "1.234",
    "12.345",
    "1.2345",
    "-5",
    "",
    "abc",
    "1e3",
    ".5",
    ",5",
    "12.",
    "12.3.4",
    "1,2.34",
    "1.234.56",
    "21474836.48", // int4 max + 1 cent
    "999999999", // 9 integer digits
  ])("%j → null", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("parseQuantity", () => {
  it.each([
    ["1.5", "1.50"],
    ["2", "2.00"],
    [" 0.25 ", "0.25"],
    ["12345678.99", "12345678.99"],
    ["1,5", "1.50"],
  ])("%j → %j", (input, expected) => {
    expect(parseQuantity(input)).toBe(expected);
  });

  it.each(["0", "0.00", "-1", "1.234", "abc", "", "123456789"])("%j → null", (input) => {
    expect(parseQuantity(input)).toBeNull();
  });
});

describe("percentToBps / bpsToPercentString", () => {
  it.each([
    ["20", 2000],
    ["20,5", 2050],
    ["20 %", 2000],
    ["12", 1200],
    ["12.5", 1250],
    ["12.34", 1234],
    ["12%", 1200],
    ["0", 0],
    ["100", 10_000],
  ])("percentToBps(%j) → %d", (input, expected) => {
    expect(percentToBps(input)).toBe(expected);
  });

  it.each(["100.01", "101", "-1", "1.234", "abc", ""])("percentToBps(%j) → null", (input) => {
    expect(percentToBps(input)).toBeNull();
  });

  it.each([
    [1200, "12"],
    [1250, "12.5"],
    [1234, "12.34"],
    [0, "0"],
    [5, "0.05"],
    [50, "0.5"],
    [10_000, "100"],
  ])("bpsToPercentString(%d) → %j", (bps, expected) => {
    expect(bpsToPercentString(bps)).toBe(expected);
  });

  it("round-trips every bps value from 0 to 10000", () => {
    for (let bps = 0; bps <= 10_000; bps++) expect(percentToBps(bpsToPercentString(bps))).toBe(bps);
  });
});

describe("formatQuantity", () => {
  it.each([
    ["1.50", "1.5"],
    ["2.00", "2"],
    ["0.25", "0.25"],
    ["10.50", "10.5"],
    ["100.00", "100"],
    ["10", "10"],
    [1.5, "1.5"],
    [2, "2"],
  ])("%j → %j", (input, expected) => {
    expect(formatQuantity(input)).toBe(expected);
  });
});
