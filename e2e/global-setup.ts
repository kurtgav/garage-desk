// Creates this run's e2e staff and logs each in ONCE through the real /login form; specs reuse the saved
// storageState. Every run has its own accounts and auth files (RUN_ID, D-096), so overlapping runs (two terminals,
// another agent's targeted spec) never re-key, overwrite or deactivate each other's staff. The teardown removes
// only this run's accounts. Emails are on @e2e.garagedesk.test: the seed script removes leftovers there.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type FullConfig } from "@playwright/test";
import {
  admin,
  createThrowawayStaff,
  deleteStaffAndJobs,
  isLocal,
  listAuthUsers,
  MECHANIC_STATE,
  must,
  OWNER_STATE,
  randomIp,
  randomToken,
  RUN_DIR,
  RUN_ID,
  USERS_PATH,
  type E2EUsers,
  type Throwaway,
} from "./support";

const ACCOUNTS = {
  owner: { local: "owner", fullName: "E2E Owner Oscar", role: "owner" },
  mechanic: { local: "mechanic-a", fullName: "E2E Mechanic Alpha", role: "mechanic" },
  mechanicB: { local: "mechanic-b", fullName: "E2E Mechanic Bravo", role: "mechanic" },
} as const;

/** owner+<runId>@…, mechanic-a+<runId>@…, mechanic-b+<runId>@… */
const RUN_ACCOUNT = /^(owner|mechanic-[ab])\+[a-z0-9-]+@e2e\.garagedesk\.test$/;
/** No run takes this long: older run accounts were left by a run that never reached its teardown. */
const STALE_RUN_MS = 3 * 60 * 60 * 1000;

/** Routes compiled on first request by `next dev`; warming them keeps cold compiles out of the specs' timeouts. */
const WARM_AS_OWNER = ["/", "/jobs", "/jobs/new", "/dashboard", "/customers", "/customers/new", "/settings", "/profile", "/staff"];
const WARM_SIGNED_OUT = ["/login", "/forgot-password", "/reset-password", `/${randomToken()}`];

const createRunAccount = (a: (typeof ACCOUNTS)[keyof typeof ACCOUNTS]): Promise<Throwaway> =>
  createThrowawayStaff(a.role, `${a.fullName} ${RUN_ID}`, `${a.local}+${RUN_ID}@e2e.garagedesk.test`);

/** Logs in with its own client IP (the login limit is per IP, D-012); warms routes as that user when local. */
async function login(browser: Browser, baseURL: string, user: Throwaway, statePath: string, warm: string[] = []) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  try {
    const page = await context.newPage();
    await page.goto("/login", { timeout: 120_000 });
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    try {
      await page.waitForURL((url) => url.pathname !== "/login", { timeout: 120_000 });
    } catch {
      // The form text holds the app's error sentence (e.g. "Too many sign-in attempts…"), never the password.
      throw new Error(`login as ${user.email} failed: ${await page.locator("form").innerText()}`);
    }
    for (const route of warm) await page.goto(route, { timeout: 120_000 });
    await context.storageState({ path: statePath });
  } finally {
    await context.close();
  }
}

async function warmSignedOut(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  const page = await context.newPage();
  for (const route of WARM_SIGNED_OUT) await page.goto(route, { timeout: 120_000 });
  await context.close();
}

/** Removes run accounts whose run crashed before its teardown, so they do not pile up in pickers and lists. */
async function sweepStaleRuns() {
  const stale = (await listAuthUsers())
    .filter((u) => RUN_ACCOUNT.test(u.email ?? "") && Date.now() - Date.parse(u.created_at) > STALE_RUN_MS)
    .map((u) => u.id);
  await deleteStaffAndJobs(stale);
}

/** Deletes the run's accounts with their jobs; if that fails, at least keep them out of the app. */
async function removeRunAccounts(ids: string[]) {
  try {
    await deleteStaffAndJobs(ids);
  } catch (error) {
    console.warn(`[e2e teardown] could not delete run ${RUN_ID} accounts, deactivating instead: ${(error as Error).message}`);
    must(await admin().from("profiles").update({ active: false }).in("id", ids).select("id"), "deactivate run accounts");
    for (const id of ids) await admin().auth.admin.updateUserById(id, { ban_duration: "876000h" });
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("baseURL is not configured");
  if (!/^[a-z0-9-]{1,32}$/.test(RUN_ID)) throw new Error("E2E_RUN_ID must be 1-32 chars of a-z, 0-9 or '-'");

  // The settings singleton (labour rate, VAT) is inserted by the first migration; jobs and labour lines need it.
  must(await admin().from("settings").select("hourly_rate_cents, vat_bps").eq("id", 1).single(), "settings singleton");
  await sweepStaleRuns();

  const run = {
    owner: await createRunAccount(ACCOUNTS.owner),
    mechanic: await createRunAccount(ACCOUNTS.mechanic),
    mechanicB: await createRunAccount(ACCOUNTS.mechanicB),
  };
  const ids = Object.values(run).map((u) => u.id);
  const teardown = async () => {
    await removeRunAccounts(ids);
    rmSync(RUN_DIR, { recursive: true, force: true });
  };

  try {
    const users: E2EUsers = {
      owner: { id: run.owner.id, email: run.owner.email, fullName: run.owner.fullName },
      mechanic: { id: run.mechanic.id, email: run.mechanic.email, fullName: run.mechanic.fullName },
      mechanicB: { id: run.mechanicB.id, email: run.mechanicB.email, fullName: run.mechanicB.fullName },
    };
    mkdirSync(RUN_DIR, { recursive: true });
    writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));

    const browser = await chromium.launch();
    try {
      if (isLocal) await warmSignedOut(browser, baseURL);
      await login(browser, baseURL, run.owner, OWNER_STATE, isLocal ? WARM_AS_OWNER : []);
      await login(browser, baseURL, run.mechanic, MECHANIC_STATE);
    } finally {
      await browser.close();
    }
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
