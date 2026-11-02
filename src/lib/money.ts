// Money is integer cents for prices and job totals; line totals are exact (possibly
// fractional) cents (PRD FR4, D-048). These helpers only format/parse; all arithmetic
// lives in the database (compute_job_totals). Currency EUR, shown as "€1,234.56" (D-055).

const MAX_INT4 = 2_147_483_647;

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 7560 → "€75.60". Integer cents only; integer math, no floats. */
export function formatCents(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const n = BigInt(cents);
  const neg = n < BigInt(0);
  const abs = neg ? -n : n;
  const euros = groupThousands((abs / BigInt(100)).toString());
  const rest = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${neg ? "-" : ""}€${euros}.${rest}`;
}

/**
 * Exact line amount, never rounded (D-048): 5687.5 → "€56.875", "6300.00" → "€63.00",
 * 0.33 → "€0.0033". Accepts the numeric(16,2) value as a number or string.
 */
export function formatLineAmount(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(typeof cents === "number" ? String(cents) : cents.trim());
  if (!m) return "—";
  const [, sign, whole, frac = ""] = m;
  const padded = whole.padStart(3, "0");
  const euros = groupThousands(padded.slice(0, -2).replace(/^0+(?=\d)/, ""));
  const decimals = (padded.slice(-2) + frac).replace(/0+$/, "").padEnd(2, "0");
  const isZero = /^0+$/.test(whole) && /^0*$/.test(frac);
  return `${sign && !isZero ? "-" : ""}€${euros}.${decimals}`;
}

/**
 * EUR input → integer cents, or null when invalid, ambiguous or out of int4 range (D-055).
 * Accepts "1234.56", "1234,56", "1,234.56", "1.234,56", "1 234,56", optional "€"/"EUR".
 * A single separator followed by exactly 3 digits ("1,234", "1.234") is ambiguous → null.
 */
export function parseMoneyToCents(input: string): number | null {
  const s = input.replace(/[\s  €]/g, "").replace(/^EUR|EUR$/i, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  let intPart = s;
  let frac = "";
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (lastSep >= 0) {
    const sep = s[lastSep];
    const other = sep === "." ? "," : ".";
    const after = s.slice(lastSep + 1);
    const sepCount = s.split(sep).length - 1;
    if (sepCount === 1 && after.length >= 1 && after.length <= 2) {
      // `sep` is the decimal separator; `other` may group thousands before it.
      intPart = s.slice(0, lastSep);
      frac = after;
      if (intPart.includes(other)) {
        if (!new RegExp(`^\\d{1,3}(\\${other}\\d{3})+$`).test(intPart)) return null;
        intPart = intPart.split(other).join("");
      }
    } else if (sepCount >= 2 && !s.includes(other) && new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s)) {
      intPart = s.split(sep).join(""); // "1,234,567" — thousands only
    } else {
      return null;
    }
  }
  if (!/^\d{1,8}$/.test(intPart) || !/^\d{0,2}$/.test(frac)) return null;
  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0"));
  return cents <= MAX_INT4 ? cents : null;
}

/** Integer cents → plain input value that parseMoneyToCents reads back: 4500 → "45.00", 5 → "0.05". */
export function centsToInput(cents: number): string {
  const s = String(cents).padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** "1.5" | "1,5" → "1.50" (string, sent as-is to numeric(10,2)). Must be > 0. */
export function parseQuantity(input: string): string | null {
  const m = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const value = `${m[1]}.${(m[2] ?? "").padEnd(2, "0")}`;
  return /^0+\.00$/.test(value) ? null : value;
}

/** "20" | "20.5" | "20,5" | "20%" → 2000 | 2050 | 2050 | 2000. 0–100% only. */
export function percentToBps(input: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(input.trim().replace(/\s*%$/, ""));
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

/** 2000 → "20", 1250 → "12.5", 1234 → "12.34". */
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
