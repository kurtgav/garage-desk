import { meetsPasswordRule } from "@/app/reset-password/password-rules";

// Browser-side checks before the round trip; uploadAvatar/changePassword and Supabase Auth decide.

// Mirrors the avatars bucket (PLAN Phase 5): the server re-checks size, MIME and magic bytes.
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export const PASSWORD_HINT = "12 to 72 characters, with upper- and lower-case letters and a digit.";

export const PASSWORD_REQUIRED: Record<string, string> = {
  current_password: "Enter your current password.",
  new_password: "Enter a new password.",
  confirm_password: "Enter the new password again.",
};

export function photoError(file: { type: string; size: number }): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Choose a PNG, JPEG or WebP image.";
  if (file.size > PHOTO_MAX_BYTES) return "The photo must be 2 MB or smaller.";
  return null;
}

/** Field name → error sentence; empty when the form can go to the server. */
export function passwordErrors(formData: FormData): Record<string, string> {
  const value = (name: string) => String(formData.get(name) ?? "");
  const errors: Record<string, string> = {};
  for (const [name, message] of Object.entries(PASSWORD_REQUIRED)) if (!value(name)) errors[name] = message;
  const next = value("new_password");
  if (next && !meetsPasswordRule(next)) errors.new_password = PASSWORD_HINT;
  if (next && value("confirm_password") && value("confirm_password") !== next)
    errors.confirm_password = "The new passwords don't match.";
  return errors;
}
