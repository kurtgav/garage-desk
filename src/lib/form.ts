import { z } from "zod";

// Shared by the server action modules ("use server" files may only export async functions).

export type Fail = { ok: false; error: string };
export const fail = (error: string): Fail => ({ ok: false, error });

/** First zod issue message, or the parsed data. */
export function parseForm<T extends z.ZodType>(schema: T, formData: FormData): { data: z.infer<T> } | Fail {
  const res = schema.safeParse(Object.fromEntries(formData));
  return res.success ? { data: res.data } : fail(res.error.issues[0]?.message ?? "Check the form and try again.");
}

/** Optional text field: "" (empty input) → undefined. */
export const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, message).optional(),
  );
