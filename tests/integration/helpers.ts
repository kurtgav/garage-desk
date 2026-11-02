// Integration helpers: run against the local Supabase stack (PLAN "Shared contracts").
// Every suite creates its own staff/customers/jobs with random values and calls cleanup() in afterAll.
import { randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JobStatus } from "@/lib/status";
import { generateLinkToken, hashLinkToken } from "@/lib/tokens";

export type Db = SupabaseClient;
export type StaffRole = "owner" | "mechanic";
type DbError = { message: string; code?: string } | null;

export interface StaffUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: StaffRole;
}

export interface JobRow {
  id: string;
  ref: string;
  vehicle_id: string;
  assigned_mechanic_id: string;
  description: string;
  status: JobStatus;
  vat_bps: number;
  quote_version: number | null;
  quoted_subtotal_cents: number | null;
  quoted_vat_cents: number | null;
  quoted_total_cents: number | null;
  quoted_at: string | null;
  approved_quote_version: number | null;
  approved_subtotal_cents: number | null;
  approved_vat_cents: number | null;
  approved_total_cents: number | null;
  approved_at: string | null;
  collected_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LineRow {
  id: string;
  job_id: string;
  kind: "labour" | "part";
  description: string;
  quantity: number | string;
  unit_price_cents: number;
  /** Exact (numeric(16,2)), may be fractional cents (D-048). */
  line_total_cents: number;
}

export interface EventRow {
  id: string;
  job_id: string;
  from_status: JobStatus | null;
  to_status: JobStatus;
  actor_type: "staff" | "customer";
  actor_id: string | null;
  channel: "link" | "phone" | null;
  quote_version: number | null;
  total_cents: number | null;
  note: string | null;
  created_at: string;
}

export interface QuoteRow {
  id: number;
  job_id: string;
  version: number;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  vat_bps: number;
  lines: { id: string; kind: string; description: string; quantity: string; unit_price_cents: number; line_total_cents: number }[];
  created_by: string;
  created_at: string;
}

/** €45.00/h, VAT 20% (PRD §8). */
export const DEFAULT_SETTINGS = { hourly_rate_cents: 4500, vat_bps: 2000 } as const;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (expected in .env.development.local or the CI environment)`);
  return v;
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const url = env("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** Service-role client: bypasses RLS. Used for setup, assertions on raw rows, and customer-mode RPCs. */
export const admin: Db = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), clientOptions);

/** Not signed in (the `anon` role). */
export function anonClient(): Db {
  return createClient(url, anonKey, clientOptions);
}

/** Returns data or throws with the DB message, for setup steps that must succeed. */
export function unwrap<T>(res: { data: T; error: DbError }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}${res.error.code ? ` (${res.error.code})` : ""}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what} returned no data`);
  return res.data;
}

export const rand = (): string => randomBytes(4).toString("hex");
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + randomInt(26))).join("");
const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");
/** Unnormalised Bulgarian layout, as typed by staff: "CA 4521 KM". */
export const randomPlate = (): string => `${letters(2)} ${digits(4)} ${letters(2)}`;
/** National mobile format "08…" (10 digits); stored as "3598…" (D-055). */
export const randomPhone = (): string => `08${digits(8)}`;

// Rows created by this test file (vitest isolates modules per file), deleted by cleanup().
const created = { users: [] as string[], customers: [] as string[], vehicles: [] as string[], jobs: [] as string[] };

/** Auth user (confirmed, random strong password) + active profile. `name` gets a random suffix so leak checks are exact. */
export async function createStaff(role: StaffRole, name: string = `QA ${role}`): Promise<StaffUser> {
  const tag = rand();
  const email = `qa-${role}-${tag}@garagedesk.test`;
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const fullName = `${name} ${tag}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`auth.admin.createUser failed: ${error?.message ?? "no user"}`);
  const user = data.user;
  created.users.push(user.id);
  // upsert: tolerate a profile row created by an auth trigger, if the schema adds one.
  unwrap(
    await admin.from("profiles").upsert({ id: user.id, full_name: fullName, role, active: true }).select().single(),
    "insert profile",
  );
  return { id: user.id, email, password, fullName, role };
}

/** supabase-js client authenticated as `staff` (anon key + password sign-in; RLS applies). */
export async function signInAs(staff: StaffUser): Promise<Db> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: staff.email, password: staff.password });
  if (error) throw new Error(`sign in as ${staff.role} failed: ${error.message}`);
  return client;
}

export interface CustomerOptions {
  fullName?: string;
  phone?: string;
  email?: string;
  plate?: string;
}

export async function createCustomerWithVehicle(db: Db = admin, opts: CustomerOptions = {}) {
  const tag = rand();
  const customer = unwrap(
    await db
      .from("customers")
      .insert({
        full_name: opts.fullName ?? `Juan QA${tag} Dela Cruz`,
        phone: opts.phone ?? randomPhone(),
        email: opts.email ?? `cust-${tag}@garagedesk.test`,
      })
      .select()
      .single(),
    "insert customer",
  );
  created.customers.push(customer.id);
  const vehicle = unwrap(
    await db
      .from("vehicles")
      .insert({ customer_id: customer.id, plate: opts.plate ?? randomPlate(), make: "Toyota", model: "Vios", year: 2019 })
      .select()
      .single(),
    "insert vehicle",
  );
  created.vehicles.push(vehicle.id);
  return { customer, vehicle };
}

export async function createJob(
  db: Db,
  input: { vehicleId: string; mechanicId: string; description?: string },
): Promise<JobRow> {
  const job = unwrap(
    await db
      .from("jobs")
      .insert({
        vehicle_id: input.vehicleId,
        assigned_mechanic_id: input.mechanicId,
        description: input.description ?? `QA job ${rand()}`,
      })
      .select()
      .single(),
    "insert job",
  );
  created.jobs.push(job.id);
  return job;
}

export interface LineInput {
  jobId: string;
  kind: "labour" | "part";
  description?: string;
  quantity: string | number;
  unitPriceCents?: number;
}

/** Raw insert result, for tests that expect an error. */
export function insertLine(db: Db, input: LineInput) {
  return db
    .from("job_line_items")
    .insert({
      job_id: input.jobId,
      kind: input.kind,
      description: input.description ?? `${input.kind} ${rand()}`,
      quantity: String(input.quantity),
      ...(input.unitPriceCents === undefined ? {} : { unit_price_cents: input.unitPriceCents }),
    })
    .select()
    .single();
}

export async function addLine(db: Db, input: LineInput): Promise<LineRow> {
  return unwrap(await insertLine(db, input), `insert ${input.kind} line`);
}

/** Staff mode: actor = the signed-in user. Raw result. */
export function transition(db: Db, jobId: string, to: JobStatus, note?: string) {
  return db.rpc("transition_job", { p_job_id: jobId, p_to_status: to, ...(note === undefined ? {} : { p_note: note }) });
}

/**
 * Customer mode (D-009): service role + the link's token hash, as the public server action does. Raw result.
 * Approve/decline name the quote version the page showed (D-049); undefined means the argument is not sent.
 */
export function customerTransition(
  jobId: string,
  to: JobStatus,
  tokenHash: string,
  expectedVersion: number | null | undefined,
  note: string | null = null,
) {
  return admin.rpc("transition_job", {
    p_job_id: jobId,
    p_to_status: to,
    p_note: note,
    p_link_token_hash: tokenHash,
    ...(expectedVersion === undefined ? {} : { p_expected_version: expectedVersion }),
  });
}

/** Owner phone approval (D-051): staff mode, note required, version the owner saw. Raw result. */
export function phoneApproval(db: Db, jobId: string, expectedVersion: number | null, note: string | null) {
  return db.rpc("transition_job", {
    p_job_id: jobId,
    p_to_status: "approved",
    p_note: note,
    p_expected_version: expectedVersion,
  });
}

export async function mustTransition(db: Db, jobId: string, to: JobStatus, note?: string): Promise<JobRow> {
  return unwrap(await transition(db, jobId, to, note), `transition to ${to}`);
}

export interface LinkToken {
  token: string;
  hash: string;
}

export const newLinkToken = (): LinkToken => {
  const token = generateLinkToken();
  return { token, hash: hashLinkToken(token) };
};

/** create_job_link with a fresh token; returns the raw token and its sha256 hex. */
export async function createLink(db: Db, jobId: string): Promise<LinkToken> {
  const link = newLinkToken();
  unwrap(await db.rpc("create_job_link", { p_job_id: jobId, p_token_hash: link.hash }), "create_job_link");
  return link;
}

export function publicJob(tokenHash: string) {
  return admin.rpc("public_job_by_token_hash", { p_token_hash: tokenHash });
}

const FLOW: JobStatus[] = ["new", "quoted", "approved", "in_progress", "ready", "collected"];

/** Walks a job (with ≥1 line) along the happy path; approval goes through a customer link. */
export async function advanceTo(staff: Db, jobId: string, target: JobStatus): Promise<JobRow> {
  let job = await getJob(jobId);
  let link: LinkToken | undefined;
  while (job.status !== target) {
    const next = FLOW[FLOW.indexOf(job.status) + 1];
    if (!next) throw new Error(`cannot advance from ${job.status} to ${target}`);
    if (next === "approved") {
      link ??= await createLink(staff, jobId);
      job = unwrap(await customerTransition(jobId, "approved", link.hash, job.quote_version), "customer approve");
    } else {
      job = await mustTransition(staff, jobId, next);
    }
  }
  return job;
}

export async function getJob(jobId: string): Promise<JobRow> {
  return unwrap(await admin.from("jobs").select("*").eq("id", jobId).single(), "select job");
}

export async function linesFor(jobId: string): Promise<LineRow[]> {
  return unwrap(await admin.from("job_line_items").select("*").eq("job_id", jobId).order("id"), "select lines");
}

export async function quotesFor(jobId: string): Promise<QuoteRow[]> {
  return unwrap(await admin.from("job_quotes").select("*").eq("job_id", jobId).order("version"), "select quotes");
}

export async function eventsFor(jobId: string): Promise<EventRow[]> {
  return unwrap(
    await admin.from("job_events").select("*").eq("job_id", jobId).order("created_at").order("id"),
    "select events",
  );
}

/** compute_job_totals(p_job_id) as `db` sees it. */
export async function jobTotals(db: Db, jobId: string) {
  const rows = unwrap(await db.rpc("compute_job_totals", { p_job_id: jobId }), "compute_job_totals") as {
    subtotal_cents: number;
    vat_cents: number;
    total_cents: number;
  }[];
  return rows[0];
}

/** Updates the settings singleton. Pass the owner client to exercise FR9, or `admin` for setup. */
export async function setSettings(
  db: Db,
  values: Partial<{ hourly_rate_cents: number; vat_bps: number }>,
): Promise<void> {
  const rows = unwrap(await db.from("settings").update(values).not("id", "is", null).select(), "update settings");
  if (rows.length !== 1) throw new Error(`update settings touched ${rows.length} rows, expected the singleton`);
}

export const restoreSettings = (): Promise<void> => setSettings(admin, DEFAULT_SETTINGS);

/** Deletes everything this file created. Problems are reported, not thrown, so they never mask a test failure. */
export async function cleanup(): Promise<void> {
  const problems: string[] = [];
  const step = async (what: string, run: () => PromiseLike<{ error: DbError }>) => {
    const { error } = await run();
    if (error) problems.push(`${what}: ${error.message}`);
  };
  const { jobs, vehicles, customers, users } = created;
  // Line items, events and links cascade from jobs (the line lock trigger allows cascade deletes).
  if (jobs.length) await step("delete jobs", () => admin.from("jobs").delete().in("id", jobs));
  if (vehicles.length) await step("delete vehicles", () => admin.from("vehicles").delete().in("id", vehicles));
  if (customers.length) await step("delete customers", () => admin.from("customers").delete().in("id", customers));
  if (users.length) await step("delete profiles", () => admin.from("profiles").delete().in("id", users));
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) problems.push(`delete auth user: ${error.message}`);
  }
  created.users = [];
  created.customers = [];
  created.vehicles = [];
  created.jobs = [];
  if (problems.length) console.warn(`[integration cleanup] leftovers possible: ${problems.join("; ")}`);
}
