import { expect } from "vitest";
import { PUBLIC_JOB_KEYS } from "@/lib/public-job";

type Obj = Record<string, unknown>;
const keys = (o: unknown) => Object.keys((o ?? {}) as Obj).sort();
const sorted = (k: readonly string[]) => [...k].sort();

/** FR6: the public DTO has exactly the whitelisted keys at every level (no more, no fewer). */
export function expectWhitelistedKeys(dto: unknown): void {
  const d = dto as Obj;
  expect(keys(d)).toEqual(sorted(PUBLIC_JOB_KEYS.root));
  expect(keys(d.garage)).toEqual(sorted(PUBLIC_JOB_KEYS.garage));
  expect(keys(d.job)).toEqual(sorted(PUBLIC_JOB_KEYS.job));
  expect(keys(d.vehicle)).toEqual(sorted(PUBLIC_JOB_KEYS.vehicle));
  expect(keys(d.customer)).toEqual(sorted(PUBLIC_JOB_KEYS.customer));
  if (d.totals !== null) expect(keys(d.totals)).toEqual(sorted(PUBLIC_JOB_KEYS.totals));
  expect(Array.isArray(d.lines)).toBe(true);
  for (const line of d.lines as unknown[]) expect(keys(line)).toEqual(sorted(PUBLIC_JOB_KEYS.line));
  expect(Array.isArray(d.timeline)).toBe(true);
  for (const entry of d.timeline as unknown[]) expect(keys(entry)).toEqual(sorted(PUBLIC_JOB_KEYS.timeline));
}
