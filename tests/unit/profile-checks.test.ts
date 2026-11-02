import { describe, expect, it } from "vitest";
import { PASSWORD_HINT, passwordErrors, photoError } from "@/app/(staff)/profile/profile-checks";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("profile photo check (browser side)", () => {
  it("accepts PNG, JPEG and WebP up to 2 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) expect(photoError({ type, size: 2 * 1024 * 1024 })).toBeNull();
  });

  it("refuses other types (SVG, GIF) and files over 2 MB", () => {
    expect(photoError({ type: "image/svg+xml", size: 10 })).toBe("Choose a PNG, JPEG or WebP image.");
    expect(photoError({ type: "image/gif", size: 10 })).toBe("Choose a PNG, JPEG or WebP image.");
    expect(photoError({ type: "image/png", size: 2 * 1024 * 1024 + 1 })).toBe("The photo must be 2 MB or smaller.");
  });
});

describe("change password check (browser side)", () => {
  it("passes a complete, valid, matching form", () => {
    expect(passwordErrors(form({ current_password: "x", new_password: "Abcdefghijk1", confirm_password: "Abcdefghijk1" }))).toEqual({});
  });

  it("names every empty field", () => {
    expect(Object.keys(passwordErrors(form({})))).toEqual(["current_password", "new_password", "confirm_password"]);
  });

  it("shows the rule for a weak or over-long new password", () => {
    for (const weak of ["short1A", "abcdefghijk1", "ABCDEFGHIJK1", "Abcdefghijkl", `Aa1${"x".repeat(70)}`])
      expect(passwordErrors(form({ current_password: "x", new_password: weak, confirm_password: weak })).new_password).toBe(
        PASSWORD_HINT,
      );
  });

  it("flags a confirmation that does not match", () => {
    const errors = passwordErrors(form({ current_password: "x", new_password: "Abcdefghijk1", confirm_password: "Abcdefghijk2" }));
    expect(errors).toEqual({ confirm_password: "The new passwords don't match." });
  });
});
