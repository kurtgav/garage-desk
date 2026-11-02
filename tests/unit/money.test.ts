import { describe, expect, it } from "vitest";
import {
  bpsToPercentString,
  formatCents,
  formatQuantity,
  parsePesoToCents,
  parseQuantity,
  percentToBps,
} from "@/lib/money";

describe("formatCents", () => {
  it.each([
    [414512, "₱4,145.12"], // FR4 AC2 total
    [370100, "₱3,701.00"],
    [44412, "₱444.12"],
    [0, "₱0.00"],
    [5, "₱0.05"],
    [100, "₱1.00"],
    [100000, "₱1,000.00"],
    [123456789012, "₱1,234,567,890.12"],
    [-414512, "-₱4,145.12"],
    [-5, "-₱0.05"],
  ])("%d → %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it("formats bigint beyond Number.MAX_SAFE_INTEGER exactly", () => {
    expect(formatCents(BigInt("9007199254740993"))).toBe("₱90,071,992,547,409.93");
  });

  it("renders a dash for missing values", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });
});

describe("parsePesoToCents", () => {
  it.each([
    ["1,250.50", 125050],
    ["₱800", 80000],
    ["₱1,250.50", 125050],
    [" ₱ 1,250.50 ", 125050],
    ["1250.5", 125050],
    ["1250", 125000],
    ["0.05", 5],
    ["0", 0],
    ["PHP 800", 80000],
    ["21474836.47", 2_147_483_647], // int4 max
  ])("%j → %d", (input, expected) => {
    expect(parsePesoToCents(input)).toBe(expected);
  });

  it.each([
    "1.234", // more than 2 decimals
    "-5",
    "",
    "abc",
    "1e3",
    ".5",
    "12.3.4",
    "21474836.48", // int4 max + 1 cent
    "999999999", // > int4 in cents
    "1234567890", // > 9 integer digits
  ])("%j → null", (input) => {
    expect(parsePesoToCents(input)).toBeNull();
  });
});

describe("parseQuantity", () => {
  it.each([
    ["1.5", "1.50"],
    ["2", "2.00"],
    [" 0.25 ", "0.25"],
    ["12345678.99", "12345678.99"],
  ])("%j → %j", (input, expected) => {
    expect(parseQuantity(input)).toBe(expected);
  });

  it.each(["0", "0.00", "-1", "1.234", "abc", "", "123456789"])("%j → null", (input) => {
    expect(parseQuantity(input)).toBeNull();
  });
});

describe("percentToBps / bpsToPercentString", () => {
  it.each([
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
