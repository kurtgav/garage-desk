import { GARAGE_TZ } from "./format";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: GARAGE_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** The garage's wall-clock fields at instant `ms`. */
function wallClock(ms: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** The UTC instant at which the garage's clock shows 00:00 on the 1st of `month` (1–12, may overflow into the next year). */
function localMonthStart(year: number, month: number): Date {
  const guess = Date.UTC(year, month - 1, 1);
  let ms = guess;
  // Two passes: the offset at the guess and at the corrected instant can differ near a DST change.
  for (let i = 0; i < 2; i++) {
    const w = wallClock(ms);
    const offset = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - ms;
    ms = guess - offset;
  }
  return new Date(ms);
}

/**
 * [start, end) of the calendar month containing `now` on the garage's clock (Europe/Sofia), as UTC instants.
 * Same bounds as get_dashboard's revenue month (D-027): local midnight on the 1st, end exclusive.
 */
export function garageMonthBounds(now: Date = new Date()): { start: Date; end: Date } {
  const { year, month } = wallClock(now.getTime());
  return { start: localMonthStart(year, month), end: localMonthStart(year, month + 1) };
}
