// Deterministic, re-runnable demo seed (PRD §8). Service role, so it bypasses RLS.
//
//   pnpm seed:local                         → local stack (.env.development.local)
//   pnpm seed -- --confirm-wipe             → project in .env.local (wipes demo data!)
//
// Wipes customers/vehicles/jobs (and their lines/events/quotes/links), upserts the 4 staff
// accounts (passwords from SEED_*_PASSWORD env vars, never printed), then creates
// 10 customers, 15 vehicles and 20 jobs across all 8 statuses with consistent, backdated
// timelines: events, frozen quote versions and approvals written directly (D-016, D-024,
// D-061). Prints the demo customer links.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Constants, type Database, type Json } from "../src/lib/database.types";
import { SEED_STAFF } from "./staff";

/** Plaintext secrets: owner-only file mode (mode applies on create; chmod covers existing files). */
function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

type Status = Database["public"]["Enums"]["job_status"];
// actor_name is always set by the job_events_actor_name trigger (D-091), never by the caller.
type EventInsert = Omit<Database["public"]["Tables"]["job_events"]["Insert"], "actor_name">;
const args = process.argv.slice(2);
const local = args.includes("--local");

// Local: stack keys from .env.development.local, passwords from .env.local. loadEnvFile never overrides.
if (local && existsSync(".env.development.local")) process.loadEnvFile(".env.development.local");
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = (local ? "http://localhost:3000" : process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const isLocalUrl = ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
if (!isLocalUrl && !args.includes("--confirm-wipe")) {
  throw new Error(`Refusing to wipe ${new URL(url).host} without --confirm-wipe`);
}
const missing = SEED_STAFF.filter((s) => !process.env[s.envKey]);
if (missing.length) throw new Error(`Missing ${missing.map((s) => s.envKey).join(", ")} — run pnpm credentials:generate`);

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: no data`);
  return res.data;
}

function ok(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

// ---------- time helpers (garage timezone Europe/Sofia, with DST) ----------
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const sofiaParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Sofia",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
/** Sofia's UTC offset (ms) at instant t. */
function sofiaOffset(t: number): number {
  const p = Object.fromEntries(sofiaParts.formatToParts(t).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}
const sofiaNow = new Date(now + sofiaOffset(now));
const monthGuess = Date.UTC(sofiaNow.getUTCFullYear(), sofiaNow.getUTCMonth(), 1);
const monthStart = monthGuess - sofiaOffset(monthGuess); // DST never changes on the 1st at midnight
const iso = (t: number) => new Date(t).toISOString();

// Demo times fall in workshop hours (audit L4): weekdays 08:00–18:30 Sofia. Step gaps count working hours.
type SofiaDay = { y: number; m: number; d: number; weekday: number };
function sofiaDay(t: number): SofiaDay {
  const local = new Date(t + sofiaOffset(t));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), weekday: local.getUTCDay() };
}
/** The instant of hh:mm Sofia time on `day` (DST never switches at 08:00 or 18:30). */
function sofiaAt(day: SofiaDay, h: number, min: number): number {
  const guess = Date.UTC(day.y, day.m, day.d, h, min);
  return guess - sofiaOffset(guess);
}
const opens = (day: SofiaDay) => sofiaAt(day, 8, 0);
const closes = (day: SofiaDay) => sofiaAt(day, 18, 30);
const isWorkday = (day: SofiaDay) => day.weekday >= 1 && day.weekday <= 5;

/** The latest working instant at or before t. */
function workingBefore(t: number): number {
  for (;;) {
    const day = sofiaDay(t);
    if (isWorkday(day) && t >= opens(day)) return Math.min(t, closes(day));
    t = sofiaAt(day, 0, 0) - 1; // last moment of the previous day
  }
}
/** t moved back by `ms` of working time (nights and weekends skipped). */
function workBack(t: number, ms: number): number {
  t = workingBefore(t);
  for (;;) {
    const open = opens(sofiaDay(t));
    if (t - ms >= open) return t - ms;
    ms -= t - open;
    t = workingBefore(open - 1);
  }
}
/** Working time between a and b (a ≤ b). */
function workingMs(a: number, b: number): number {
  let total = 0;
  for (let t = workingBefore(b); t > a; ) {
    const open = Math.max(opens(sofiaDay(t)), a);
    total += t - open;
    t = workingBefore(opens(sofiaDay(t)) - 1);
  }
  return total;
}

// ---------- demo data ----------
const GARAGE = {
  garage_name: "Petrov Auto Service",
  garage_address: "27 Tsarigradsko Shose Blvd, 1113 Sofia",
  garage_phone: "+359 2 812 3456",
};
const OLD_RATE = 4000; // €40.00/h
const RATE = 4500; // €45.00/h
const VAT = 2000; // 20%

type VehicleSpec = [plate: string, make: string, model: string, year: number];
const CUSTOMERS: { name: string; phone: string; email?: string; vehicles: VehicleSpec[] }[] = [
  { name: "Maria Ivanova", phone: "0888 214 401", email: "maria.ivanova@example.com", vehicles: [["CA 4521 KM", "Volkswagen", "Golf", 2017], ["CB 7310 AH", "Skoda", "Fabia", 2012]] },
  { name: "Dimitar Georgiev", phone: "0887 233 901", vehicles: [["PB 1184 TX", "Toyota", "Corolla", 2019]] },
  { name: "Elena Petkova", phone: "0899 645 118", email: "elena.petkova@example.com", vehicles: [["CA 1234 BP", "Renault", "Clio", 2018], ["CA 5562 MX", "Dacia", "Duster", 2021]] },
  { name: "Nikolai Todorov", phone: "0878 402 773", vehicles: [["B 9021 PA", "Ford", "Focus", 2015]] },
  { name: "Svetlana Hristova", phone: "0885 118 226", email: "svetlana.hristova@example.com", vehicles: [["CB 3348 KT", "Hyundai", "i30", 2020]] },
  { name: "Petar Angelov", phone: "0896 770 412", vehicles: [["CA 6620 HB", "BMW", "320d", 2014], ["C 2051 XK", "Peugeot", "308", 2019]] },
  { name: "Yana Koleva", phone: "0884 301 554", email: "yana.koleva@example.com", vehicles: [["CA 8813 PM", "Kia", "Ceed", 2016]] },
  { name: "Hristo Vasilev", phone: "0877 604 339", vehicles: [["A 4407 KX", "Opel", "Astra", 2013], ["CA 9930 BT", "Toyota", "RAV4", 2022]] },
  { name: "Desislava Marinova", phone: "0882 555 781", vehicles: [["CB 1609 EP", "Citroen", "C3", 2017]] },
  { name: "Krasimir Nikolov", phone: "0898 287 006", email: "krasimir.nikolov@example.com", vehicles: [["CA 2745 TM", "Audi", "A4", 2018], ["PA 8190 BK", "Mercedes-Benz", "C 200", 2011]] },
];

type Line = { kind: "labour" | "part"; description: string; quantity: string; price?: number };
const L = (description: string, hours: string): Line => ({ kind: "labour", description, quantity: hours });
const P = (description: string, quantity: string, price: number): Line => ({ kind: "part", description, quantity, price });

const WORK = {
  oil: { description: "Oil and filter change, 15,000 km service", lines: [P("Engine oil 5W-30 (5 L)", "1", 4890), P("Oil filter", "1", 1250), L("Oil change and inspection", "0.5")] },
  brakes: { description: "Front brakes squealing when braking", lines: [P("Front brake pads (set)", "1", 5800), L("Replace front brake pads", "1.25")] },
  caliper: { description: "Rear left brake caliper sticking", lines: [L("Caliper service", "1.5"), P("Caliper repair kit", "2", 2575)] },
  aircon: { description: "Air conditioning not cold, service and recharge", lines: [L("A/C service and leak test", "1.25"), P("Refrigerant R1234yf (500 g)", "1", 6500)] },
  timing: { description: "Timing belt due at 120,000 km", lines: [P("Timing belt kit with water pump", "1", 21500), L("Replace timing belt and water pump", "3.5")] },
  battery: { description: "Hard starting in the morning, battery weak", lines: [P("Battery 74 Ah", "1", 13900), L("Battery replacement and charging test", "0.25")] },
  alignment: { description: "Car pulls to the right, steering wheel vibrates", lines: [L("Wheel alignment and balancing", "1"), P("Wheel weights", "4", 175)] },
  shocks: { description: "Bouncy ride, front shock absorbers leaking", lines: [P("Front shock absorber", "2", 7450), L("Replace front shock absorbers", "2.5")] },
  plugs: { description: "Rough idle, replace spark plugs", lines: [P("Iridium spark plug", "4", 1390), L("Replace spark plugs", "0.75")] },
  coolant: { description: "Engine running hot, coolant flush", lines: [P("Coolant G13 (5 L)", "1", 2290), L("Cooling system flush", "1")] },
  clutch: { description: "Clutch slipping on uphill starts", lines: [P("Clutch kit with flywheel", "1", 48900), L("Replace clutch and flywheel", "6")] },
} satisfies Record<string, { description: string; lines: Line[] }>;

/**
 * One step of a job's history, `gap` hours after the previous one. `quoted` freezes a new quote
 * version from the lines at that moment (after `add`/`remove`); from quoted/approved/in_progress
 * it is the line-edit re-quote the DB trigger writes (D-050).
 */
type Step =
  | { to: "quoted"; gap: number; add?: Line[]; remove?: string[]; by?: "owner" }
  | { to: "approved"; gap: number; phone?: string } // phone: owner's note (D-051); else via link
  | { to: "declined"; gap: number; note?: string }
  | { to: "in_progress" | "ready"; gap: number; note?: string }
  | { to: "collected"; gap: number }
  | { to: "cancelled"; gap: number; note: string };

interface JobSpec {
  vehicle: string; // plate as listed above
  mechanic: 1 | 2 | 3;
  work: keyof typeof WORK;
  /** When the last step happened (ms since epoch); earlier steps are counted back from here. */
  lastAt: number;
  steps: Step[];
  oldRate?: boolean;
  /** Print this job's customer link (PRD §8). */
  demoLink?: boolean;
}

const REQUOTE_NOTE = "Lines changed — new quote"; // as written by private.line_items_requote
const quote = (gap = 2): Step => ({ to: "quoted", gap });
const approve = (gap = 3): Step => ({ to: "approved", gap });
const start = (gap = 16): Step => ({ to: "in_progress", gap });
const ready = (gap = 6): Step => ({ to: "ready", gap });
const collect = (gap = 20): Step => ({ to: "collected", gap });
const HAPPY = [quote(), approve(), start(), ready()];

// Collected-this-month times spread over this month's working time so far. Before the month's first working
// hours (the 1st before 08:00, or a weekend start) nothing can have been collected this month yet, so they go
// to the previous month's last working day instead and this month's revenue starts at €0 (D-102).
const monthWorkingMs = workingMs(monthStart, now);
const inThisMonth = (i: number, of: number) =>
  monthWorkingMs > 0
    ? workBack(now, (monthWorkingMs * (of - i)) / (of + 1))
    : workBack(monthStart, (of - i) * 2 * HOUR);

const JOBS: JobSpec[] = [
  // Collected last month at the OLD rate (€40.00/h): outside this month's revenue.
  { vehicle: "CB 1609 EP", mechanic: 1, work: "timing", oldRate: true, lastAt: monthStart - 9 * DAY, steps: [...HAPPY, collect()] },
  { vehicle: "CA 6620 HB", mechanic: 2, work: "shocks", oldRate: true, lastAt: monthStart - 3 * DAY, steps: [...HAPPY, collect()] },
  // Quoted at the old rate before it went up, still open: the rate-snapshot rule (FR4).
  { vehicle: "PB 1184 TX", mechanic: 3, work: "caliper", oldRate: true, lastAt: now - 5 * HOUR, steps: [quote(), approve(30), start(20)] },
  // Collected this month.
  { vehicle: "CA 4521 KM", mechanic: 1, work: "oil", lastAt: inThisMonth(0, 3), steps: [...HAPPY, collect(4)] },
  { vehicle: "CA 8813 PM", mechanic: 2, work: "battery", lastAt: inThisMonth(1, 3), steps: [quote(1), { to: "approved", gap: 1, phone: "Approved by phone, wants the car back today." }, start(1), ready(1), collect(3)] },
  { vehicle: "A 4407 KX", mechanic: 3, work: "alignment", lastAt: inThisMonth(2, 3), steps: [...HAPPY, collect(5)] },
  // Ready for collection; one went back for rework (Ready → In progress → Ready).
  { vehicle: "CB 7310 AH", mechanic: 2, work: "aircon", lastAt: now - 2 * DAY - 3 * HOUR, demoLink: true, steps: [...HAPPY] },
  { vehicle: "CA 2745 TM", mechanic: 3, work: "brakes", lastAt: now - 1 * DAY - 2 * HOUR, steps: [...HAPPY, { to: "in_progress", gap: 2, note: "Squeak still audible on the test drive, rechecking the pads." }, ready(3)] },
  // In progress. Extra work after approval: v1 approved, discs found worn, v2 approved too.
  { vehicle: "CA 5562 MX", mechanic: 2, work: "coolant", lastAt: now - 3 * HOUR, steps: [quote(), approve(), start(5)] },
  {
    vehicle: "PA 8190 BK", mechanic: 1, work: "brakes", lastAt: now - 1 * DAY, demoLink: true,
    steps: [quote(), approve(), start(18), { to: "quoted", gap: 2, add: [P("Brake disc, front", "2", 4250), L("Replace front brake discs", "0.75")] }, approve(2), start(1)],
  },
  // Approved, work not started: once by the customer's link, once by the owner on the phone.
  { vehicle: "B 9021 PA", mechanic: 3, work: "timing", lastAt: now - 6 * HOUR, steps: [quote(), approve(5)] },
  { vehicle: "CA 9930 BT", mechanic: 2, work: "oil", lastAt: now - 2 * HOUR, steps: [quote(), { to: "approved", gap: 1, phone: "Customer called at 10:15 and approved the quote." }] },
  // Quoted, waiting for the customer. One was declined, adjusted and re-quoted (v2).
  {
    vehicle: "CA 1234 BP", mechanic: 1, work: "aircon", lastAt: now - 90 * 60_000, demoLink: true,
    steps: [
      { to: "quoted", gap: 2, add: [P("Cabin air filter", "1", 1890)] },
      { to: "declined", gap: 3, note: "Please skip the cabin air filter, I'll replace it myself." },
      { to: "quoted", gap: 1, remove: ["Cabin air filter"] },
    ],
  },
  { vehicle: "CA 4521 KM", mechanic: 3, work: "brakes", lastAt: now - 4 * HOUR, steps: [quote()] },
  // Declined, with the customer's reason.
  { vehicle: "C 2051 XK", mechanic: 2, work: "clutch", lastAt: now - 20 * HOUR, demoLink: true, steps: [quote(), { to: "declined", gap: 5, note: "Too expensive right now, I'll get a second quote." }] },
  { vehicle: "CB 3348 KT", mechanic: 1, work: "shocks", lastAt: now - 2 * DAY, steps: [quote(), { to: "declined", gap: 26, note: "We are selling the car next month." }] },
  // Cancelled by the owner, with a reason.
  { vehicle: "CA 6620 HB", mechanic: 3, work: "timing", lastAt: now - 3 * DAY, steps: [quote(), { to: "cancelled", gap: 30, note: "Customer did not answer for a week, car collected unrepaired." }] },
  { vehicle: "CB 3348 KT", mechanic: 2, work: "battery", lastAt: now - 4 * DAY, steps: [quote(), approve(), { to: "cancelled", gap: 4, note: "Battery out of stock for two weeks, customer bought one elsewhere." }] },
  // New: lines being prepared.
  { vehicle: "PB 1184 TX", mechanic: 1, work: "plugs", lastAt: now - 40 * 60_000, steps: [] },
  { vehicle: "PA 8190 BK", mechanic: 3, work: "alignment", lastAt: now - 15 * 60_000, steps: [] },
];

// ---------- run ----------
async function upsertStaff(): Promise<{ ids: Map<string, string>; existing: Map<string, string> }> {
  const ids = new Map<string, string>();
  const existing = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    data.users.forEach((u) => u.email && existing.set(u.email.toLowerCase(), u.id));
    if (data.users.length < 1000) break;
  }
  for (const s of SEED_STAFF) {
    const password = process.env[s.envKey]!;
    let id = existing.get(s.email);
    if (id) {
      const { error } = await db.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw new Error(`update ${s.email}: ${error.message}`);
    } else {
      const { data, error } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`create ${s.email}: ${error?.message}`);
      id = data.user.id;
    }
    ok(await db.from("profiles").upsert({ id, full_name: s.fullName, role: s.role, active: true }), `profile ${s.email}`);
    ids.set(s.envKey, id);
  }
  return { ids, existing };
}

/** After the wipe (jobs reference profiles): remove test accounts on the demo domains (e2e/integration runs). */
async function removeTestAccounts(existing: Map<string, string>): Promise<number> {
  const roster = new Set(SEED_STAFF.map((s) => s.email));
  let removed = 0;
  for (const [email, id] of existing) {
    if (!/@(e2e.)?garagedesk.test$/.test(email) || roster.has(email)) continue;
    ok(await db.from("profiles").delete().eq("id", id), `remove profile ${email}`);
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`remove user ${email}: ${error.message}`);
    removed++;
  }
  return removed;
}

async function wipe() {
  ok(await db.from("jobs").delete().not("id", "is", null), "wipe jobs"); // cascades lines/events/quotes/links
  ok(await db.from("vehicles").delete().not("id", "is", null), "wipe vehicles");
  ok(await db.from("customers").delete().not("id", "is", null), "wipe customers");
}

async function setRate(hourly: number) {
  ok(await db.from("settings").update({ ...GARAGE, hourly_rate_cents: hourly, vat_bps: VAT }).eq("id", 1), "settings");
}

function linkToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

const lineRow = (jobId: string, l: Line) => ({
  job_id: jobId,
  kind: l.kind,
  description: l.description,
  quantity: Number(l.quantity),
  unit_price_cents: l.price ?? 0, // labour: replaced by the settings rate (DB trigger)
});

interface Figures {
  version: number;
  subtotal: number;
  vat: number;
  total: number;
  at: number;
}

/**
 * Writes one job's whole history while the row is still `new` (so the line guard lets the
 * service role edit lines and no re-quote trigger fires), then sets the final state once.
 */
async function createJob(spec: JobSpec, vehicleId: string, ownerId: string, mechanicId: string, links: string[]) {
  // Step times counted back from the last one in working hours (nights and weekends skipped).
  const last = workingBefore(spec.lastAt);
  const stepAt: number[] = [];
  let back = last;
  for (let i = spec.steps.length - 1; i >= 0; i--) {
    stepAt[i] = back;
    back = workBack(back, spec.steps[i].gap * HOUR);
  }
  const createdAt = workBack(back, 2 * HOUR); // inspection before the first quote
  const job = must(
    await db
      .from("jobs")
      .insert({ vehicle_id: vehicleId, assigned_mechanic_id: mechanicId, description: WORK[spec.work].description, created_by: mechanicId, created_at: iso(createdAt) })
      .select("id, vat_bps")
      .single(),
    "insert job",
  );
  ok(await db.from("job_line_items").insert(WORK[spec.work].lines.map((l) => lineRow(job.id, l))), "insert lines");

  const events: EventInsert[] = [];
  const quotes: Database["public"]["Tables"]["job_quotes"]["Insert"][] = [];
  let status: Status = "new";
  let quoted = null as Figures | null;
  let approved = null as Figures | null;
  let collectedAt: number | null = null;
  let link: { token: string; hash: string } | null = null;

  for (const [i, step] of spec.steps.entries()) {
    const t = stepAt[i];
    const from = status;
    let detail: Partial<EventInsert>;

    if (step.to === "quoted") {
      if (step.add) ok(await db.from("job_line_items").insert(step.add.map((l) => lineRow(job.id, l))), "add lines");
      for (const d of step.remove ?? []) ok(await db.from("job_line_items").delete().eq("job_id", job.id).eq("description", d), "remove line");
      const totals = must(await db.from("job_totals").select("subtotal_cents, vat_cents, total_cents").eq("job_id", job.id).single(), "totals");
      const lines = must(
        await db.from("job_line_items").select("id, kind, description, quantity::text, unit_price_cents, line_total_cents").eq("job_id", job.id).order("created_at").order("id"),
        "lines",
      );
      quoted = { version: (quoted?.version ?? 0) + 1, subtotal: totals.subtotal_cents!, vat: totals.vat_cents!, total: totals.total_cents!, at: t };
      const actor = step.by === "owner" ? ownerId : mechanicId;
      quotes.push({ job_id: job.id, version: quoted.version, subtotal_cents: quoted.subtotal, vat_cents: quoted.vat, total_cents: quoted.total, vat_bps: job.vat_bps, lines: lines as unknown as Json[], created_by: actor, created_at: iso(t) });
      detail = { actor_id: actor, quote_version: quoted.version, total_cents: quoted.total, note: ["quoted", "approved", "in_progress"].includes(from) ? REQUOTE_NOTE : null };
      // The first quote is sent to the customer as a link.
      link ??= linkToken();
    } else if (step.to === "approved" || step.to === "declined") {
      if (!quoted || from !== "quoted") throw new Error(`${spec.vehicle}: ${step.to} needs a quote`);
      const phone = step.to === "approved" ? step.phone : undefined;
      detail = {
        actor_type: phone ? "staff" : "customer",
        actor_id: phone ? ownerId : null,
        channel: phone ? "phone" : "link",
        quote_version: quoted.version,
        total_cents: quoted.total,
        note: phone ?? (step.to === "declined" ? step.note ?? null : null),
      };
      if (step.to === "approved") approved = { ...quoted, at: t };
    } else {
      if (step.to === "collected") collectedAt = t;
      detail = {
        actor_id: step.to === "collected" || step.to === "cancelled" ? ownerId : mechanicId, // owner hands back / cancels
        note: "note" in step ? step.note ?? null : null,
      };
    }
    events.push({ job_id: job.id, from_status: from, to_status: step.to, actor_type: "staff", created_at: iso(t), ...detail });
    status = step.to;
  }

  if (events.length) ok(await db.from("job_events").insert(events.map((e) => ({ ...e, actor_name: "" }))), "insert events");
  if (quotes.length) ok(await db.from("job_quotes").insert(quotes), "insert quotes");
  if (link) {
    const firstQuote = quotes[0].created_at!;
    ok(await db.from("job_links").insert({ job_id: job.id, token_hash: link.hash, created_by: mechanicId, created_at: iso(workingBefore(Date.parse(firstQuote) + 10 * 60_000)) }), "insert link");
    if (spec.demoLink) links.push(`${status.padEnd(11)} ${siteUrl}/${link.token}`);
  }
  if (status === "new") return;

  ok(
    await db
      .from("jobs")
      .update({
        status,
        quote_version: quoted?.version ?? null,
        quoted_subtotal_cents: quoted?.subtotal ?? null,
        quoted_vat_cents: quoted?.vat ?? null,
        quoted_total_cents: quoted?.total ?? null,
        quoted_at: quoted ? iso(quoted.at) : null,
        approved_quote_version: approved?.version ?? null,
        approved_subtotal_cents: approved?.subtotal ?? null,
        approved_vat_cents: approved?.vat ?? null,
        approved_total_cents: approved?.total ?? null,
        approved_at: approved ? iso(approved.at) : null,
        collected_at: collectedAt === null ? null : iso(collectedAt),
      })
      .eq("id", job.id),
    "advance job",
  );
}

async function main() {
  const { ids: staff, existing } = await upsertStaff();
  const ownerId = staff.get("SEED_OWNER_PASSWORD")!;
  const mechanicIds = [1, 2, 3].map((n) => staff.get(`SEED_MECHANIC_${n}_PASSWORD`)!);

  await wipe();
  const removed = await removeTestAccounts(existing);
  if (removed) console.log(`seed: removed ${removed} test account(s)`);
  await setRate(OLD_RATE);

  const vehicleIds = new Map<string, string>();
  for (const c of CUSTOMERS) {
    const customer = must(
      await db.from("customers").insert({ full_name: c.name, phone: c.phone, email: c.email ?? null }).select("id").single(),
      `customer ${c.name}`,
    );
    for (const [plate, make, model, year] of c.vehicles) {
      const v = must(
        await db.from("vehicles").insert({ customer_id: customer.id, plate, make, model, year }).select("id").single(),
        `vehicle ${plate}`,
      );
      vehicleIds.set(plate, v.id);
    }
  }

  const links: string[] = [];
  // Old-rate jobs first, then the rate goes up to €45.00/h for everything after (FR4 rate rule).
  for (const spec of JOBS.filter((j) => j.oldRate)) {
    await createJob(spec, vehicleIds.get(spec.vehicle)!, ownerId, mechanicIds[spec.mechanic - 1], links);
  }
  await setRate(RATE);
  for (const spec of JOBS.filter((j) => !j.oldRate)) {
    await createJob(spec, vehicleIds.get(spec.vehicle)!, ownerId, mechanicIds[spec.mechanic - 1], links);
  }

  // Verify counts by status.
  const rows = must(await db.from("jobs").select("status"), "count");
  const counts = Object.fromEntries(Constants.public.Enums.job_status.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const customers = must(await db.from("customers").select("id"), "count customers").length;
  const vehicles = must(await db.from("vehicles").select("id"), "count vehicles").length;
  console.log(`seed: ${customers} customers, ${vehicles} vehicles, ${rows.length} jobs`);
  console.log(`seed: by status ${JSON.stringify(counts)}`);
  console.log("seed: demo customer links:");
  links.forEach((l) => console.log(`  ${l}`));

  if (!local && existsSync("CREDENTIALS.local.md")) {
    const creds = readFileSync("CREDENTIALS.local.md", "utf8").replace(/\n## Demo customer link[\s\S]*$/, "");
    writePrivate(
      "CREDENTIALS.local.md",
      `${creds.trimEnd()}\n\n## Demo customer links\n\nOpen on a phone, no login needed.\n\n${links.map((l) => `- ${l.replace(/^(\S+)\s+/, "$1: ")}`).join("\n")}\n`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(`seed failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
