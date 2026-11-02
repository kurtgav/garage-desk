// Money is integer cents everywhere (PRD FR4). These helpers only format/parse;
// all arithmetic lives in the database (compute_job_totals).

const MAX_INT4 = 2_147_483_647;

/** 414512 → "₱4,145.12". Integer math only, no floats. */
export function formatCents(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const n = BigInt(cents);
  const neg = n < BigInt(0);
  const abs = neg ? -n : n;
  const pesos = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const centavos = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${neg ? "-" : ""}₱${pesos}.${centavos}`;
}

/** "₱1,250.50" | "1250.5" | "1250" → 125050. Returns null when invalid or out of range. */
export function parsePesoToCents(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "").replace(/^PHP/i, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_INT4 ? cents : null;
}

/** "1.5" → "1.50" (string, sent as-is to numeric(10,2)). Must be > 0. */
export function parseQuantity(input: string): string | null {
  const m = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const value = `${m[1]}.${(m[2] ?? "").padEnd(2, "0")}`;
  return /^0+\.00$/.test(value) ? null : value;
}

/** "12" | "12.5" | "12.34" → 1200 | 1250 | 1234. 0–100% only. */
export function percentToBps(input: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/%$/, ""));
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

/** 1200 → "12", 1250 → "12.5", 1234 → "12.34". */
export function bpsToPercentString(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = (bps % 100).toString().padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Quantity from the DB (numeric → string or number) for display: "1.50" → "1.5". */
export function formatQuantity(q: string | number): string {
  const s = typeof q === "number" ? q.toFixed(2) : q;
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
