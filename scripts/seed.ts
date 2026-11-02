// Deterministic, re-runnable demo seed (PRD §8). Service role, so it bypasses RLS.
//
//   pnpm seed:local                         → local stack (.env.development.local)
//   pnpm seed -- --confirm-wipe             → project in .env.local (wipes demo data!)
//
// Wipes customers/vehicles/jobs (and their lines/events/links), upserts the 4 staff
// accounts (passwords from SEED_*_PASSWORD env vars, never printed), then creates
// 10 customers, 15 vehicles and 20 jobs across all statuses with consistent,
// backdated timelines (D-016, D-024). Prints the active customer link(s).
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { SEED_STAFF } from "./staff";

/** Plaintext secrets: owner-only file mode (mode applies on create; chmod covers existing files). */
function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

type Status = Database["public"]["Enums"]["job_status"];
const args = process.argv.slice(2);
const local = args.includes("--local");

// Local: stack keys from .env.development.local, passwords from .env.local. loadEnvFile never overrides.
if (local && existsSync(".env.development.local")) process.loadEnvFile(".env.development.local");
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = (local ? "http://localhost:3000" : process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const isLocalUrl = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(url);
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

// ---------- time helpers (garage timezone Asia/Manila = UTC+8, no DST) ----------
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const MANILA = 8 * HOUR;
const manila = new Date(now + MANILA);
const monthStart = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), 1) - MANILA; // UTC instant
const iso = (t: number) => new Date(t).toISOString();

// ---------- demo data ----------
const GARAGE = {
  garage_name: "Dela Cruz Auto Works",
  garage_address: "128 Kalayaan Ave, Diliman, Quezon City",
  garage_phone: "0917 555 0128",
};
const OLD_RATE = 80_000; // ₱800/h
const RATE = 100_000; // ₱1,000/h
const VAT = 1200;

const CUSTOMERS: { name: string; phone: string; email?: string; vehicles: [string, string, string, number][] }[] = [
  { name: "Maria Santos", phone: "0917 812 4401", email: "maria.santos@example.com", vehicles: [["NAB 4521", "Toyota", "Vios", 2019], ["DAE 7310", "Toyota", "Innova", 2016]] },
  { name: "Jose Ramirez", phone: "0918 233 9015", vehicles: [["NCX 1184", "Mitsubishi", "Montero Sport", 2020]] },
  { name: "Ana Villanueva", phone: "0927 645 1180", email: "ana.v@example.com", vehicles: [["ABC 1234", "Honda", "City", 2018], ["WQT 5562", "Honda", "BR-V", 2021]] },
  { name: "Roberto Garcia", phone: "0919 402 7733", vehicles: [["NFH 9021", "Ford", "Ranger", 2017]] },
  { name: "Liza Fernandez", phone: "0905 118 2264", email: "liza.fernandez@example.com", vehicles: [["PKO 3348", "Nissan", "Almera", 2022]] },
  { name: "Carlo Mendoza", phone: "0936 770 4129", vehicles: [["UIO 6620", "Toyota", "Fortuner", 2015], ["CAR 2051", "Suzuki", "Ertiga", 2020]] },
  { name: "Grace Tan", phone: "0998 301 5547", email: "grace.tan@example.com", vehicles: [["NDS 8813", "Hyundai", "Accent", 2017]] },
  { name: "Emmanuel Aquino", phone: "0917 604 3392", vehicles: [["ZXA 4407", "Nissan", "Navara", 2019], ["BLU 9930", "Mitsubishi", "Mirage", 2021]] },
  { name: "Rosario Lim", phone: "0920 555 7814", vehicles: [["TRE 1609", "Ford", "Everest", 2018]] },
  { name: "Paolo Navarro", phone: "0945 287 0061", email: "paolo.navarro@example.com", vehicles: [["NGT 2745", "Toyota", "Hilux", 2020], ["KLM 8190", "Honda", "Civic", 2016]] },
];

type Line = { kind: "labour" | "part"; description: string; quantity: string; price?: number };
const L = (description: string, hours: string): Line => ({ kind: "labour", description, quantity: hours });
const P = (description: string, quantity: string, price: number): Line => ({ kind: "part", description, quantity, price });

const WORK: Record<string, { description: string; lines: Line[] }> = {
  oil: { description: "Change oil and oil filter, 10,000 km service", lines: [P("Engine oil 5W-30 (4L)", "1", 245_000), P("Oil filter", "1", 38_000), L("Oil change and inspection", "0.5")] },
  brakes: { description: "Front brake pads worn, squealing when braking", lines: [P("Brake pads, front set", "1", 285_000), L("Replace front brake pads", "1.5")] },
  caliper: { description: "Brake caliper sticking, rear left", lines: [L("Caliper service", "1.5"), P("Caliper repair kit", "2", 125_050)] },
  aircon: { description: "Aircon not cold, cleaning and recharge", lines: [L("Aircon cleaning", "2"), P("Refrigerant R134a", "1", 120_000)] },
  timing: { description: "Timing belt due at 100,000 km", lines: [P("Timing belt kit", "1", 680_000), L("Replace timing belt", "3.5")] },
  battery: { description: "Hard starting in the morning, battery weak", lines: [P("Battery 2SMF", "1", 525_000), L("Battery replacement and test", "0.25")] },
  alignment: { description: "Car pulls to the right, steering vibrates", lines: [L("Wheel alignment and balancing", "1"), P("Wheel weights", "4", 3_550)] },
  shocks: { description: "Bouncy ride, front shock absorbers leaking", lines: [P("Front shock absorber", "2", 315_000), L("Replace front shocks", "2.5")] },
  plugs: { description: "Rough idle, replace spark plugs", lines: [P("Iridium spark plug", "4", 65_000), L("Replace spark plugs", "0.75")] },
  radiator: { description: "Engine running hot, radiator flush", lines: [P("Coolant (4L)", "1", 89_000), L("Radiator flush", "1")] },
  clutch: { description: "Clutch slipping on uphill", lines: [P("Clutch kit", "1", 950_000), L("Replace clutch", "5")] },
};

interface JobSpec {
  vehicle: string; // plate
  mechanic: 1 | 2 | 3;
  work: keyof typeof WORK;
  status: Status;
  /** When the last transition happened (ms since epoch). */
  lastAt: number;
  oldRate?: boolean;
  declinedThenRequoted?: boolean;
  link?: boolean;
}

// Collected-this-month times spread between month start and now (works on the 1st too).
const inThisMonth = (i: number, of: number) => monthStart + ((now - monthStart) * (i + 1)) / (of + 1);

const JOBS: JobSpec[] = [
  // Collected last month at the OLD rate (₱800/h) — excluded from this month's revenue.
  { vehicle: "TRE 1609", mechanic: 1, work: "timing", status: "collected", lastAt: monthStart - 9 * DAY, oldRate: true },
  { vehicle: "UIO 6620", mechanic: 2, work: "shocks", status: "collected", lastAt: monthStart - 3 * DAY, oldRate: true },
  // Quoted at the old rate, still open: the rate-snapshot rule in action (FR4 worked example: ₱4,145.12).
  { vehicle: "NCX 1184", mechanic: 3, work: "caliper", status: "in_progress", lastAt: now - 5 * HOUR, oldRate: true },
  { vehicle: "PKO 3348", mechanic: 1, work: "clutch", status: "approved", lastAt: now - 20 * HOUR, oldRate: true },
  // Collected this month.
  { vehicle: "NAB 4521", mechanic: 1, work: "oil", status: "collected", lastAt: inThisMonth(0, 3) },
  { vehicle: "NDS 8813", mechanic: 2, work: "battery", status: "collected", lastAt: inThisMonth(1, 3) },
  { vehicle: "ZXA 4407", mechanic: 3, work: "alignment", status: "collected", lastAt: inThisMonth(2, 3) },
  // Ready for collection.
  { vehicle: "DAE 7310", mechanic: 2, work: "aircon", status: "ready", lastAt: now - 2 * DAY - 3 * HOUR, link: true },
  { vehicle: "NGT 2745", mechanic: 3, work: "brakes", status: "ready", lastAt: now - 1 * DAY - 2 * HOUR },
  { vehicle: "CAR 2051", mechanic: 1, work: "plugs", status: "ready", lastAt: now - 4 * HOUR },
  // In progress.
  { vehicle: "WQT 5562", mechanic: 2, work: "radiator", status: "in_progress", lastAt: now - 3 * HOUR },
  { vehicle: "KLM 8190", mechanic: 1, work: "shocks", status: "in_progress", lastAt: now - 1 * DAY },
  // Approved by the customer, work not started.
  { vehicle: "NFH 9021", mechanic: 3, work: "timing", status: "approved", lastAt: now - 6 * HOUR },
  { vehicle: "BLU 9930", mechanic: 2, work: "oil", status: "approved", lastAt: now - 2 * HOUR },
  // Quoted, waiting for the customer. One was declined and re-quoted; it has the active demo link.
  { vehicle: "ABC 1234", mechanic: 1, work: "aircon", status: "quoted", lastAt: now - 90 * 60_000, declinedThenRequoted: true, link: true },
  { vehicle: "NAB 4521", mechanic: 3, work: "brakes", status: "quoted", lastAt: now - 4 * HOUR },
  { vehicle: "TRE 1609", mechanic: 2, work: "battery", status: "quoted", lastAt: now - 26 * HOUR },
  // New: lines being prepared.
  { vehicle: "UIO 6620", mechanic: 3, work: "plugs", status: "new", lastAt: now - 40 * 60_000 },
  { vehicle: "NDS 8813", mechanic: 1, work: "radiator", status: "new", lastAt: now - 2 * HOUR },
  { vehicle: "KLM 8190", mechanic: 2, work: "alignment", status: "new", lastAt: now - 15 * 60_000 },
];

const FLOW: Status[] = ["new", "quoted", "approved", "in_progress", "ready", "collected"];
// Gap before each step, counted back from lastAt (so timelines read naturally).
const GAP: Record<Status, number> = { new: 0, quoted: 3 * HOUR, approved: 5 * HOUR, in_progress: 20 * HOUR, ready: 26 * HOUR, collected: 22 * HOUR };

// ---------- run ----------
async function upsertStaff(): Promise<Map<string, string>> {
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
  // Remove leftover test accounts (e2e/integration runs) on the demo domain.
  const roster = new Set(SEED_STAFF.map((s) => s.email));
  for (const [email, id] of existing) {
    if (email.endsWith("@garagedesk.test") && !roster.has(email)) {
      await db.from("profiles").delete().eq("id", id);
      await db.auth.admin.deleteUser(id);
    }
  }
  return ids;
}

async function wipe() {
  ok(await db.from("jobs").delete().not("id", "is", null), "wipe jobs"); // cascades lines/events/links
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

async function createJob(spec: JobSpec, vehicleId: string, ownerId: string, mechanicId: string, links: string[]) {
  const target = FLOW.indexOf(spec.status);
  // Event times: walk back from lastAt through the flow.
  const times: number[] = [];
  let t = spec.lastAt;
  for (let i = target; i >= 0; i--) {
    times[i] = t;
    t -= GAP[FLOW[i]] || 0;
  }
  const extraForDecline = spec.declinedThenRequoted ? 6 * HOUR : 0;
  const createdAt = Math.min(times[0], (times[1] ?? spec.lastAt) - 2 * HOUR - extraForDecline - HOUR);
  times[0] = createdAt;

  const job = must(
    await db
      .from("jobs")
      .insert({ vehicle_id: vehicleId, assigned_mechanic_id: mechanicId, description: WORK[spec.work].description, created_by: ownerId, created_at: iso(createdAt) })
      .select("id")
      .single(),
    "insert job",
  );
  const lines = WORK[spec.work].lines;
  const toInsert = spec.declinedThenRequoted ? [...lines, P("Cabin air filter", "1", 65_000)] : lines;
  ok(
    await db.from("job_line_items").insert(
      toInsert.map((l) => ({ job_id: job.id, kind: l.kind, description: l.description, quantity: Number(l.quantity), unit_price_cents: l.price ?? 0 })),
    ),
    "insert lines",
  );
  if (target === 0) return;

  const events: Database["public"]["Tables"]["job_events"]["Insert"][] = [];
  if (spec.declinedThenRequoted) {
    // First quote included a cabin filter; customer declined; staff removed it and re-quoted.
    const firstQuote = times[1] - 6 * HOUR;
    events.push({ job_id: job.id, from_status: "new", to_status: "quoted", actor_type: "staff", actor_id: mechanicId, created_at: iso(firstQuote) });
    events.push({ job_id: job.id, from_status: "quoted", to_status: "new", actor_type: "customer", actor_id: null, note: "Please skip the cabin air filter, I'll replace it myself.", created_at: iso(firstQuote + 2 * HOUR) });
    ok(await db.from("job_line_items").delete().eq("job_id", job.id).eq("description", "Cabin air filter"), "requote edit");
  }
  for (let i = 1; i <= target; i++) {
    const to = FLOW[i];
    const customer = to === "approved";
    events.push({
      job_id: job.id,
      from_status: FLOW[i - 1],
      to_status: to,
      actor_type: customer ? "customer" : "staff",
      actor_id: customer ? null : i === 5 ? ownerId : mechanicId, // owner hands the car back
      created_at: iso(times[i]),
    });
  }
  ok(await db.from("job_events").insert(events), "insert events");

  const totals = must(await db.from("job_totals").select("subtotal_cents, vat_cents, total_cents").eq("job_id", job.id).single(), "totals");
  const at = (s: Status) => (FLOW.indexOf(s) <= target ? iso(times[FLOW.indexOf(s)]) : null);
  ok(
    await db
      .from("jobs")
      .update({
        status: spec.status,
        quoted_subtotal_cents: totals.subtotal_cents,
        quoted_vat_cents: totals.vat_cents,
        quoted_total_cents: totals.total_cents,
        quoted_at: at("quoted"),
        approved_at: at("approved"),
        approved_total_cents: target >= 2 ? totals.total_cents : null,
        collected_at: at("collected"),
      })
      .eq("id", job.id),
    "advance job",
  );

  if (spec.link) {
    const { token, hash } = linkToken();
    ok(await db.from("job_links").insert({ job_id: job.id, token_hash: hash, created_by: ownerId, created_at: iso(times[1] + 10 * 60_000) }), "insert link");
    links.push(`${spec.status.padEnd(10)} ${siteUrl}/${token}`);
  }
}

async function main() {
  const staff = await upsertStaff();
  const ownerId = staff.get("SEED_OWNER_PASSWORD")!;
  const mechanicIds = [1, 2, 3].map((n) => staff.get(`SEED_MECHANIC_${n}_PASSWORD`)!);

  await wipe();
  await setRate(OLD_RATE);

  const vehicleIds = new Map<string, string>();
  for (const c of CUSTOMERS) {
    const customer = must(
      await db.from("customers").insert({ full_name: c.name, phone: c.phone, email: c.email ?? null }).select("id").single(),
      `customer ${c.name}`,
    );
    for (const [plate, make, model, year] of c.vehicles) {
      const v = must(
        await db.from("vehicles").insert({ customer_id: customer.id, plate, make, model, year }).select("id, plate").single(),
        `vehicle ${plate}`,
      );
      vehicleIds.set(plate, v.id);
    }
  }

  const links: string[] = [];
  // Old-rate jobs first, then the rate goes up to ₱1,000/h for everything after (FR4 rate rule).
  for (const spec of JOBS.filter((j) => j.oldRate)) {
    await createJob(spec, vehicleIds.get(spec.vehicle)!, ownerId, mechanicIds[spec.mechanic - 1], links);
  }
  await setRate(RATE);
  for (const spec of JOBS.filter((j) => !j.oldRate)) {
    await createJob(spec, vehicleIds.get(spec.vehicle)!, ownerId, mechanicIds[spec.mechanic - 1], links);
  }

  // Verify counts by status.
  const rows = must(await db.from("jobs").select("status"), "count");
  const counts = Object.fromEntries(FLOW.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const customers = must(await db.from("customers").select("id"), "count customers").length;
  const vehicles = must(await db.from("vehicles").select("id"), "count vehicles").length;
  console.log(`seed: ${customers} customers, ${vehicles} vehicles, ${rows.length} jobs`);
  console.log(`seed: by status ${JSON.stringify(counts)}`);
  console.log("seed: active customer links:");
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
