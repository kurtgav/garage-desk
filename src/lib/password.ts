import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";

// Same rule as Supabase Auth (config.toml: minimum_password_length = 12, lower_upper_letters_digits).
// 72 is bcrypt's input limit; Auth refuses longer passwords.
export const newPasswordSchema = z
  .string("Enter a new password.")
  .min(12, "Use at least 12 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a digit.");

/** Supabase Auth error codes → sentences (the raw Auth text never reaches the UI). */
export function passwordErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case "weak_password":
      return "Choose a stronger password: at least 12 characters with upper- and lowercase letters and a digit.";
    case "same_password":
      return "Choose a password that is different from your current one.";
    case "reauthentication_needed":
      return "Please sign in again to change your password.";
    default:
      return null;
  }
}

// No look-alikes (0/O, 1/l/I), so the owner can read it out or copy it by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 16 random characters (~93 bits) that always satisfy newPasswordSchema. Shown once, never stored. */
export function generateTempPassword(): string {
  for (;;) {
    const pw = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (newPasswordSchema.safeParse(pw).success) return pw;
  }
}
