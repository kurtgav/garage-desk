// Creates (or re-keys) the e2e staff and logs each in ONCE through the real /login form. Login is rate-limited
// to 10 attempts / 5 min per IP (D-012) and both projects run every spec, so specs reuse the saved storageState.
// Emails are on @e2e.garagedesk.test: the seed script deletes unknown users on @garagedesk.test.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { admin, AUTH_DIR, MECHANIC_STATE, must, OWNER_STATE, USERS_PATH, type E2EUser, type E2EUsers } from "./support";

const ACCOUNTS = {
  owner: { email: "owner@e2e.garagedesk.test", fullName: "E2E Owner Oscar", role: "owner" },
  mechanic: { email: "mechanic-a@e2e.garagedesk.test", fullName: "E2E Mechanic Alpha", role: "mechanic" },
  mechanicB: { email: "mechanic-b@e2e.garagedesk.test", fullName: "E2E Mechanic Bravo", role: "mechanic" },
} as const;

// Strong, generated per run, kept in memory only (never written to disk or logged).
const newPassword = () => `${randomBytes(18).toString("base64url")}aA1!`;

async function findUserId(email: string): Promise<string | undefined> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return undefined;
  }
}

/** Fixed accounts, re-keyed each run: jobs keep FKs to these profiles, so they are never deleted. */
async function upsertStaff(account: (typeof ACCOUNTS)[keyof typeof ACCOUNTS], password: string): Promise<E2EUser> {
  const auth = admin().auth.admin;
  const existing = await findUserId(account.email);
  const { data, error } = existing
    ? await auth.updateUserById(existing, { password, email_confirm: true })
    : await auth.createUser({ email: account.email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`upsert auth user ${account.email} failed: ${error?.message ?? "no user"}`);
  const id = data.user.id;
  must(
    await admin().from("profiles").upsert({ id, full_name: account.fullName, role: account.role, active: true }).select().single(),
    `upsert profile ${account.email}`,
  );
  return { id, email: account.email, fullName: account.fullName };
}

async function login(baseURL: string, email: string, password: string, statePath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    try {
      await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
    } catch {
      // The form text holds the app's error sentence (e.g. "Too many sign-in attempts…"), never the password.
      throw new Error(`login as ${email} failed: ${await page.locator("form").innerText()}`);
    }
    await page.context().storageState({ path: statePath });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("baseURL is not configured");

  // The settings singleton (labour rate, VAT) is inserted by the first migration; jobs and labour lines need it.
  must(await admin().from("settings").select("hourly_rate_cents, vat_bps").eq("id", 1).single(), "settings singleton");

  const ownerPassword = newPassword();
  const mechanicPassword = newPassword();
  const users: E2EUsers = {
    owner: await upsertStaff(ACCOUNTS.owner, ownerPassword),
    mechanic: await upsertStaff(ACCOUNTS.mechanic, mechanicPassword),
    mechanicB: await upsertStaff(ACCOUNTS.mechanicB, newPassword()),
  };
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));

  await login(baseURL, users.owner.email, ownerPassword, OWNER_STATE);
  await login(baseURL, users.mechanic.email, mechanicPassword, MECHANIC_STATE);

  // Teardown: keep the e2e staff out of mechanic pickers and dashboard workload (e.g. in production) until the next run.
  return async () => {
    const ids = Object.values(users).map((u) => u.id);
    must(await admin().from("profiles").update({ active: false }).in("id", ids).select(), "deactivate e2e staff");
  };
}
