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
    ["CA4521KM", "CA 4521 KM"],
    ["C1234AB", "C 1234 AB"],
    ["PB7310TX", "PB 7310 TX"],
    ["ABC1234", "ABC 1234"], // foreign plate, letters + digits
    ["AB12C", "AB12C"], // unknown shape stays as stored
  ])("formatPlate(%j) → %j", (stored, shown) => {
    expect(formatPlate(stored)).toBe(shown);
  });

  it.each([
    ["ca 4521 km", "CA4521KM"],
    ["CA-4521-KM", "CA4521KM"],
    [" ca4521km ", "CA4521KM"],
  ])("normalisePlate(%j) → %j", (input, normalised) => {
    expect(normalisePlate(input)).toBe(normalised);
  });
});

describe("phones (Bulgaria)", () => {
  it.each([
    ["+359 88 123 4567", "359881234567"],
    ["0881 234 567", "359881234567"],
    ["088-123-4567", "359881234567"],
  ])("normalisePhone(%j) → %j", (input, digits) => {
    expect(normalisePhone(input)).toBe(digits);
  });

  it("keeps non-national numbers as plain digits", () => {
    expect(normalisePhone("(02) 987 6543")).toBe("029876543");
    expect(normalisePhone("+44 20 7946 0958")).toBe("442079460958");
  });

  it.each([
    ["359881234567", "+359 88 123 4567"],
    ["359987654321", "+359 98 765 4321"],
    ["35929876543", "+359 2 987 6543"],
    ["3593212345", "+3593212345"],
    ["442079460958", "442079460958"],
  ])("formatPhone(%j) → %j", (digits, shown) => {
    expect(formatPhone(digits)).toBe(shown);
  });

  it("whatsappUrl uses the international mobile number", () => {
    expect(whatsappUrl("359881234567", "Hi there")).toBe("https://wa.me/359881234567?text=Hi%20there");
    expect(whatsappUrl("0881234567", "x")).toBe("https://wa.me/359881234567?text=x");
  });

  it("whatsappUrl falls back to the contact picker for missing or landline numbers", () => {
    expect(whatsappUrl(null, "x")).toBe("https://wa.me/?text=x");
    expect(whatsappUrl(undefined, "x")).toBe("https://wa.me/?text=x");
    expect(whatsappUrl("35929876543", "x")).toBe("https://wa.me/?text=x");
  });

  it("whatsappUrl encodes the message text", () => {
    expect(whatsappUrl("359881234567", "Quote & link: https://g.d/abc?x=1")).toBe(
      "https://wa.me/359881234567?text=Quote%20%26%20link%3A%20https%3A%2F%2Fg.d%2Fabc%3Fx%3D1",
    );
  });
});

describe("dates in the garage timezone (Europe/Sofia, UTC+2 in winter, UTC+3 in summer)", () => {
  it("uses Europe/Sofia", () => {
    expect(GARAGE_TZ).toBe("Europe/Sofia");
  });

  it("formatDateTime: 2026-11-01T22:30:00Z → 2 Nov 2026, 00:30 local (EET)", () => {
    expect(formatDateTime("2026-11-01T22:30:00Z")).toBe("2 Nov 2026, 00:30");
  });

  it("formatDateTime: summer time 2026-07-15T21:15:00Z → 16 Jul 2026, 00:15 local (EEST)", () => {
    expect(formatDateTime("2026-07-15T21:15:00Z")).toBe("16 Jul 2026, 00:15");
  });

  it("formatDate: 2026-10-31T22:30:00Z is already 1 Nov in Sofia", () => {
    expect(formatDate("2026-10-31T22:30:00Z")).toBe("1 Nov 2026");
  });

  it("renders a dash for missing values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});
