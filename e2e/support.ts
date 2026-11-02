// Shared e2e helpers. Specs create their own data (unique suffix) so they stay independent and can run
// against production via E2E_BASE_URL. Never log key, password or token values.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("..", import.meta.url));
export const AUTH_DIR = path.join(root, "e2e", ".auth"); // gitignored (/e2e/.auth/)
export const OWNER_STATE = path.join(AUTH_DIR, "owner.json");
export const MECHANIC_STATE = path.join(AUTH_DIR, "mechanic.json");
export const USERS_PATH = path.join(AUTH_DIR, "users.json"); // ids and names only, no passwords

const isLocal = !process.env.E2E_BASE_URL || /\/\/(localhost|127\.0\.0\.1)[:/]/.test(process.env.E2E_BASE_URL);

/** Real env wins; against a local server fall back to the local stack keys in .env.development.local. */
function env(name: string): string {
  const file = path.join(root, ".env.development.local");
  if (!process.env[name] && isLocal && existsSync(file)) {
    const value = parseEnv(readFileSync(file, "utf8"))[name];
    if (value) process.env[name] = value;
  }
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (env or .env.development.local)`);
  return v;
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

let adminClient: SupabaseClient | undefined;
/** Service-role client for setup and DB assertions (bypasses RLS). */
export function admin(): SupabaseClient {
  adminClient ??= createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), clientOptions);
  return adminClient;
}

/**
 * The logged-in owner as a supabase-js client (RLS applies), reusing the session from OWNER_STATE so no extra
 * login is spent. @supabase/ssr stores it as "base64-<base64url JSON>", split into .0/.1 cookies when large.
 */
export function ownerDb(): SupabaseClient {
  const { cookies } = JSON.parse(readFileSync(OWNER_STATE, "utf8")) as { cookies: { name: string; value: string }[] };
  const raw = cookies
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8"));
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

/** Returns data or throws with the DB message. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what} returned no data`);
  return res.data;
}

export interface E2EUser {
  id: string;
  email: string;
  fullName: string;
}
export interface E2EUsers {
  owner: E2EUser;
  /** Logged in (MECHANIC_STATE). */
  mechanic: E2EUser;
  /** Never logs in: owns jobs the logged-in mechanic must not see. */
  mechanicB: E2EUser;
}
export const readUsers = (): E2EUsers => JSON.parse(readFileSync(USERS_PATH, "utf8")) as E2EUsers;

export const tag = (): string => randomBytes(4).toString("hex");
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + randomInt(26))).join("");
const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");
/** As typed by staff ("QZK 4821"); the DB stores it normalised ("QZK4821"). */
export const randomPlate = (): string => `${letters(3)} ${digits(4)}`;
export const randomPhone = (): string => `09${digits(9)}`;
/** Same shape as the app's link tokens (D-013): 32 random bytes, base64url, 43 chars. */
export const randomToken = (): string => randomBytes(32).toString("base64url");
export const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Customer + vehicle via the admin API (the Customers UI is Phase 3, PLAN 3.1). */
export async function createCustomerWithVehicle(opts: { fullName: string; phone?: string; email?: string }) {
  const db = admin();
  const customer = must(
    await db
      .from("customers")
      .insert({ full_name: opts.fullName, phone: opts.phone ?? randomPhone(), email: opts.email ?? null })
      .select()
      .single(),
    "insert customer",
  );
  const vehicle = must(
    await db
      .from("vehicles")
      .insert({ customer_id: customer.id, plate: randomPlate(), make: "Toyota", model: "Vios", year: 2019 })
      .select()
      .single(),
    "insert vehicle",
  );
  return { customer, vehicle };
}

/** A `new` job with lines, created as the owner through RLS (triggers set status, vat_bps and the labour rate). */
export async function createJob(input: {
  vehicleId: string;
  mechanicId: string;
  description: string;
  lines?: { kind: "labour" | "part"; description: string; quantity: string; unitPriceCents?: number }[];
}): Promise<{ id: string; ref: string }> {
  const db = ownerDb();
  const job = must(
    await db
      .from("jobs")
      .insert({ vehicle_id: input.vehicleId, assigned_mechanic_id: input.mechanicId, description: input.description })
      .select("id, ref")
      .single(),
    "insert job",
  );
  for (const l of input.lines ?? []) {
    const { error } = await db.from("job_line_items").insert({
      job_id: job.id,
      kind: l.kind,
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unitPriceCents ?? 0, // labour: replaced by the settings rate (D-031)
    });
    if (error) throw new Error(`insert ${l.kind} line failed: ${error.message}`);
  }
  return job;
}

/** Staff transition as the owner (transition_job is the only status writer). */
export async function ownerTransition(jobId: string, to: string, note?: string): Promise<void> {
  const { error } = await ownerDb().rpc("transition_job", { p_job_id: jobId, p_to_status: to, ...(note ? { p_note: note } : {}) });
  if (error) throw new Error(`transition to ${to} failed: ${error.message}`);
}

/** create_job_link as the owner with a fresh token, like the "Create customer link" action. Returns the raw token. */
export async function ownerCreateLink(jobId: string): Promise<string> {
  const token = randomToken();
  const { error } = await ownerDb().rpc("create_job_link", { p_job_id: jobId, p_token_hash: sha256Hex(token) });
  if (error) throw new Error(`create_job_link failed: ${error.message}`);
  return token;
}

export async function jobRow(jobId: string) {
  return must(await admin().from("jobs").select("*").eq("id", jobId).single(), "select job");
}
