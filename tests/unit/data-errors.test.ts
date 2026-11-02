import { describe, expect, it } from "vitest";
import { customerErrorMessage, GENERIC_ERROR, INVALID_LINK, QUOTE_CHANGED, staffErrorMessage } from "@/lib/data/errors";

describe("DB error → user sentence", () => {
  it("maps every stable staff error to a sentence (never the raw code)", () => {
    for (const code of [
      "invalid_transition",
      "forbidden",
      "not_found",
      "no_line_items",
      "job_locked",
      "invalid_mechanic",
      "not_linkable",
      "kind_immutable",
      "quote_changed",
      "note_required",
    ]) {
      const msg = staffErrorMessage({ message: code, code: "P0001" });
      expect(msg).not.toContain(code);
      expect(msg).toMatch(/[.!]$/);
    }
  });

  it("maps RLS / privilege failures to the forbidden sentence", () => {
    expect(staffErrorMessage({ message: 'new row violates row-level security policy for table "jobs"', code: "42501" })).toBe(
      staffErrorMessage({ message: "forbidden" }),
    );
  });

  it("never echoes unknown DB text; uses the fallback", () => {
    const raw = { message: 'duplicate key value violates unique constraint "vehicles_plate_key"', code: "23505" };
    expect(staffErrorMessage(raw)).toBe(GENERIC_ERROR);
    expect(staffErrorMessage(raw, "Could not add the line.")).toBe("Could not add the line.");
    expect(staffErrorMessage(null)).toBe(GENERIC_ERROR);
    // Prototype keys are not error codes.
    expect(staffErrorMessage({ message: "toString" })).toBe(GENERIC_ERROR);
  });

  it("customer link errors reveal nothing beyond 'no longer valid'", () => {
    expect(customerErrorMessage({ message: "not_found" })).toBe(INVALID_LINK);
    expect(customerErrorMessage({ message: "invalid_transition" })).not.toContain("invalid_transition");
    expect(customerErrorMessage({ message: "forbidden" })).toBe(GENERIC_ERROR);
    expect(customerErrorMessage({ message: "quote_changed" })).toBe(QUOTE_CHANGED);
    expect(customerErrorMessage({ message: "connection refused 10.0.0.3" })).toBe(GENERIC_ERROR);
  });
});
