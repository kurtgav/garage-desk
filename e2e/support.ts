// Shared e2e helpers. Specs create their own data (unique suffix) so they stay independent and can run
// against production via E2E_BASE_URL. Never log key, password or token values.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("..", import.meta.url));
export const AUTH_DIR = path.join(root, "e2e", ".auth"); // gitignored (/e2e/.auth/)
export const OWNER_STATE = path.join(AUTH_DIR, "owner.json");
export const MECHANIC_STATE = path.join(AUTH_DIR, "mechanic.json");
export const USERS_PATH = path.join(AUTH_DIR, "users.json"); // ids and names only, no passwords

/** The server under test is this machine (no E2E_BASE_URL, or localhost). */
export const isLocal = !process.env.E2E_BASE_URL || /\/\/(localhost|127\.0\.0\.1)[:/]/.test(process.env.E2E_BASE_URL);

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
/** National Bulgarian mobile ("0881234567"); the DB stores "359881234567" (D-055). */
export const randomPhone = (): string => `08${digits(8)}`;

/**
 * A customer's phone at 375px, without login. Each simulated customer gets its own client IP: the public
 * rate limits are per IP (D-012) and every local client (dev browser, other runs) would otherwise share one.
 * On Vercel the platform overwrites x-forwarded-for, so this header has no effect there.
 */
export function customerContext(browser: Browser, baseURL: string | undefined) {
  return browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
  });
}
/** A signed-out context sized like the running project (desktop or 375px), with its own client IP (see above). */
export function freshContext(browser: Browser, testInfo: TestInfo, baseURL: string | undefined) {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = testInfo.project.use;
  return browser.newContext({
    baseURL,
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    userAgent,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
  });
}
/** 198.18.0.0/15 is reserved for benchmarking, so it is never a real client. */
export const randomIp = (): string => `198.${18 + randomInt(2)}.${randomInt(256)}.${1 + randomInt(254)}`;
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

/** Staff transition as the owner (transition_job is the only status writer). `expectedVersion`: phone approval. */
export async function ownerTransition(jobId: string, to: string, note?: string, expectedVersion?: number): Promise<void> {
  const { error } = await ownerDb().rpc("transition_job", {
    p_job_id: jobId,
    p_to_status: to,
    ...(note ? { p_note: note } : {}),
    ...(expectedVersion ? { p_expected_version: expectedVersion } : {}),
  });
  if (error) throw new Error(`transition to ${to} failed: ${error.message}`);
}

/** Customer + vehicle + job (one part line) quoted as v1 by the owner, with a customer link. */
export async function quotedJobWithLink(opts: { customerName: string; description: string; mechanicId: string }) {
  const { customer, vehicle } = await createCustomerWithVehicle({ fullName: opts.customerName });
  const job = await createJob({
    vehicleId: vehicle.id,
    mechanicId: opts.mechanicId,
    description: opts.description,
    lines: [{ kind: "part", description: "Wiper blade", quantity: "2", unitPriceCents: 1225 }],
  });
  await ownerTransition(job.id, "quoted");
  const token = await ownerCreateLink(job.id);
  return { customer, vehicle, job, token };
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

/** Meets the Auth rules (12+ chars, upper, lower, digit). Generated per use, kept in memory, never logged. */
export const strongPassword = (): string => `${randomBytes(18).toString("base64url")}aA1`;

export interface Throwaway extends E2EUser {
  password: string;
}

/**
 * A staff account for flows that change passwords, ban or deactivate (never the shared e2e users, whose
 * storageState other specs reuse). Remove it with deleteStaff() in afterAll.
 */
export async function createThrowawayStaff(role: "owner" | "mechanic", fullName: string): Promise<Throwaway> {
  const email = `tmp-${tag()}@e2e.garagedesk.test`;
  const password = strongPassword();
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create throwaway ${role} failed: ${error?.message ?? "no user"}`);
  must(
    await admin().from("profiles").insert({ id: data.user.id, full_name: fullName, role, active: true }).select("id").single(),
    "insert throwaway profile",
  );
  return { id: data.user.id, email, fullName, password };
}

/** Auth user id for an email created through the UI (e.g. "Add mechanic"), or undefined. */
export async function authUserId(email: string): Promise<string | undefined> {
  for (let page = 1; ; page++) {
    const res = await admin().auth.admin.listUsers({ page, perPage: 1000 });
    if (res.error) throw new Error(`listUsers failed: ${res.error.message}`);
    const hit = res.data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (res.data.users.length < 1000) return undefined;
  }
}

/** Deletes throwaway accounts (the profile cascades) and their photos. Accounts with jobs cannot be deleted. */
export async function deleteStaff(ids: string[]): Promise<void> {
  const avatars = admin().storage.from("avatars");
  for (const id of ids) {
    const files = (await avatars.list(id)).data ?? [];
    if (files.length > 0) await avatars.remove(files.map((f) => `${id}/${f.name}`));
    const { error } = await admin().auth.admin.deleteUser(id);
    if (error) throw new Error(`delete throwaway ${id} failed: ${error.message}`);
  }
}

async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in through the real /login form and waits to leave it (role home). */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await submitLogin(page, email, password);
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

/** The login form refuses with its one generic message (wrong password, unknown or deactivated account). */
export async function expectSignInRefused(page: Page, email: string, password: string): Promise<void> {
  await submitLogin(page, email, password);
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
}

/** The "Main" sidebar nav; below lg it lives in a drawer behind "Open menu" (retried until hydrated). */
export async function openMainNav(page: Page) {
  const nav = page.getByRole("navigation", { name: "Main" });
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) {
    await expect(async () => {
      await menu.click();
      await expect(nav).toBeVisible({ timeout: 1_000 });
    }).toPass();
  }
  return nav;
}
