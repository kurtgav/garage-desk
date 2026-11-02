import { describe, expect, it } from "vitest";
import { meetsPasswordRule } from "@/app/reset-password/password-rules";
import { newPasswordSchema } from "@/lib/password";

describe("reset form's live password rule", () => {
  it.each([
    "Abcdefghijk1",
    "Abcdefghij1",
    "abcdefghijk1",
    "ABCDEFGHIJK1",
    "Abcdefghijkl",
    "",
    "Garage-Desk-2026",
    "Aa1" + "x".repeat(69),
    "Aa1" + "x".repeat(70),
    "Ünïcödé-Pass-1",
  ])("agrees with the server schema on %j", (pw) => {
    expect(meetsPasswordRule(pw)).toBe(newPasswordSchema.safeParse(pw).success);
  });
});
