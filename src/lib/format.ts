// Display helpers. Times are stored in UTC and shown in the garage timezone (PRD §7, D-055).

export const GARAGE_TZ = "Europe/Sofia";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: GARAGE_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: GARAGE_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "2 Nov 2026, 14:05" in Europe/Sofia. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}

/** "2 Nov 2026" in Europe/Sofia. */
export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

/** Stored plates are normalised ("CA4521KM"); show the Bulgarian layout "CA 4521 KM". */
export function formatPlate(plate: string): string {
  const bg = /^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/.exec(plate);
  if (bg) return `${bg[1]} ${bg[2]} ${bg[3]}`;
  const m = /^([A-Z]+)(\d+)$/.exec(plate) ?? /^(\d+)([A-Z]+)$/.exec(plate);
  return m ? `${m[1]} ${m[2]}` : plate;
}

// The 12 Cyrillic letters Bulgarian plates share with Latin, as typed on a Bulgarian keyboard (D-099).
const CYRILLIC = "АВЕКМНОРСТУХ";
const LATIN = "ABEKMHOPCTYX";

/** Same normalisation as the DB (private.normalise_plate: trigger and search): "са 1234-км" → "CA1234KM". */
export function normalisePlate(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[АВЕКМНОРСТУХ]/g, (c) => LATIN[CYRILLIC.indexOf(c)]);
}

/** Digits only; a Bulgarian national number "0881234567" becomes "359881234567" (D-055). */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return /^0\d{9}$/.test(digits) ? `359${digits.slice(1)}` : digits;
}

/** "359881234567" → "+359 88 123 4567"; Sofia landline "35929876543" → "+359 2 987 6543". */
export function formatPhone(digits: string): string {
  const mobile = /^359(8\d|9\d)(\d{3})(\d{4})$/.exec(digits);
  if (mobile) return `+359 ${mobile[1]} ${mobile[2]} ${mobile[3]}`;
  const sofia = /^3592(\d{3})(\d{4})$/.exec(digits);
  if (sofia) return `+359 2 ${sofia[1]} ${sofia[2]}`;
  return digits.startsWith("359") ? `+${digits}` : digits;
}

/** wa.me link for a Bulgarian mobile; anything else opens the contact picker. */
export function whatsappUrl(phoneDigits: string | null | undefined, text: string): string {
  const d = normalisePhone(phoneDigits ?? "");
  const intl = /^359[89]\d{8}$/.test(d) ? d : "";
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
