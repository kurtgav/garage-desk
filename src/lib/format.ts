// Display helpers. Times are stored in UTC and shown in the garage timezone (PRD §7).

export const GARAGE_TZ = "Asia/Manila";

const dateTimeFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: GARAGE_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: GARAGE_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

/** Stored plates are normalised ("ABC1234"); show "ABC 1234". */
export function formatPlate(plate: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(plate) ?? /^(\d+)([A-Z]+)$/.exec(plate);
  return m ? `${m[1]} ${m[2]}` : plate;
}

/** Same normalisation as the DB trigger, for search input. */
export function normalisePlate(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function normalisePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/** Stored phones are digits only; PH mobile "09171234567" → "0917 123 4567". */
export function formatPhone(digits: string): string {
  const m = /^(09\d{2})(\d{3})(\d{4})$/.exec(digits);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : digits;
}

/** wa.me link; PH mobile 09… becomes 639…, anything else opens the contact picker. */
export function whatsappUrl(phoneDigits: string | null | undefined, text: string): string {
  const d = phoneDigits ?? "";
  const intl = /^09\d{9}$/.test(d) ? `63${d.slice(1)}` : /^639\d{9}$/.test(d) ? d : "";
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
