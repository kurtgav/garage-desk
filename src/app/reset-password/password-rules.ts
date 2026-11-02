/**
 * The new-password rule as the form shows it, checked while typing. Mirrors newPasswordSchema in
 * src/lib/password.ts, which is server-only; tests/unit/password-rules.test.ts keeps the two in step.
 */
export const PASSWORD_RULES = [
  { label: "12 or more characters", test: (v: string) => v.length >= 12 },
  { label: "A lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "An uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "A digit", test: (v: string) => /[0-9]/.test(v) },
] as const;

/** bcrypt's input limit; Auth refuses longer. Not a maxLength: that would cut a pasted password silently. */
export const PASSWORD_MAX = 72;

export const meetsPasswordRule = (v: string) => v.length <= PASSWORD_MAX && PASSWORD_RULES.every((r) => r.test(v));
