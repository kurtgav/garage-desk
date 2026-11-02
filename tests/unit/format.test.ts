import { describe, expect, it } from "vitest";
import {
  GARAGE_TZ,
  formatDate,
  formatDateTime,
  formatPhone,
  formatPlate,
  normalisePhone,
  normalisePlate,
  whatsappUrl,
} from "@/lib/format";

describe("plates", () => {
  it.each([
    ["ABC1234", "ABC 1234"],
    ["NAB4521", "NAB 4521"],
    ["1234ABC", "1234 ABC"],
    ["AB12C", "AB12C"], // unknown shape stays as stored
  ])("formatPlate(%j) → %j", (stored, shown) => {
    expect(formatPlate(stored)).toBe(shown);
  });

  it.each([
    ["abc 1234", "ABC1234"],
    ["abc-1234", "ABC1234"],
    [" nab 4521 ", "NAB4521"],
    ["ABC1234", "ABC1234"],
  ])("normalisePlate(%j) → %j", (input, normalised) => {
    expect(normalisePlate(input)).toBe(normalised);
  });
});

describe("phones", () => {
  it.each([
    ["+63 917-123-4567", "639171234567"],
    ["0917 123 4567", "09171234567"],
    ["(02) 8123-4567", "0281234567"],
  ])("normalisePhone(%j) → %j", (input, digits) => {
    expect(normalisePhone(input)).toBe(digits);
  });

  it.each([
    ["09171234567", "0917 123 4567"],
    ["639171234567", "639171234567"],
    ["0281234567", "0281234567"],
  ])("formatPhone(%j) → %j", (digits, shown) => {
    expect(formatPhone(digits)).toBe(shown);
  });

  it("whatsappUrl converts PH mobile 09… to 639…", () => {
    expect(whatsappUrl("09171234567", "Hi there")).toBe("https://wa.me/639171234567?text=Hi%20there");
  });

  it("whatsappUrl keeps an already international PH mobile", () => {
    expect(whatsappUrl("639171234567", "x")).toBe("https://wa.me/639171234567?text=x");
  });

  it("whatsappUrl falls back to the contact picker for missing or non-mobile numbers", () => {
    expect(whatsappUrl(null, "x")).toBe("https://wa.me/?text=x");
    expect(whatsappUrl(undefined, "x")).toBe("https://wa.me/?text=x");
    expect(whatsappUrl("0281234567", "x")).toBe("https://wa.me/?text=x");
  });

  it("whatsappUrl encodes the message text", () => {
    expect(whatsappUrl("09171234567", "Quote & link: https://g.d/abc?x=1")).toBe(
      "https://wa.me/639171234567?text=Quote%20%26%20link%3A%20https%3A%2F%2Fg.d%2Fabc%3Fx%3D1",
    );
  });
});

describe("dates in the garage timezone (Asia/Manila, UTC+8)", () => {
  it("uses Asia/Manila", () => {
    expect(GARAGE_TZ).toBe("Asia/Manila");
  });

  it("formatDateTime: 2026-11-01T16:30:00Z → 2 Nov 2026, 12:30 AM local", () => {
    const s = formatDateTime("2026-11-01T16:30:00Z");
    expect(s).toMatch(/\b2\b/);
    expect(s).toMatch(/Nov/);
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/12:30\s*AM/i);
    expect(s).not.toMatch(/\b1\b/); // not the UTC date
  });

  it("formatDate: 2026-10-31T16:30:00Z is already 1 Nov in Manila", () => {
    const s = formatDate("2026-10-31T16:30:00Z");
    expect(s).toMatch(/\b1\b/);
    expect(s).toMatch(/Nov/);
    expect(s).not.toMatch(/31|Oct/);
  });

  it("renders a dash for missing values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});
