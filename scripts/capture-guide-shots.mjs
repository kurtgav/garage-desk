// Screenshots for the user guide (docs/user-guide/img/). Commit-safe: no password and no customer-link
// token is ever on screen when a shot is taken, and nothing secret is printed.
// Usage (repo root): node scripts/capture-guide-shots.mjs <baseUrl>
//   e.g. node scripts/capture-guide-shots.mjs https://garage-desk-tau.vercel.app
// Signs in twice (owner, then one mechanic) through the real login form, with the accounts in
// CREDENTIALS.local.md. Read-only on any non-local base: it opens dialogs and closes them, never submits.
// On a local base it also creates customer links through the job page (to show the customer screens and the
// "link created" panel, with the token masked); on production it uses the demo links in CREDENTIALS.local.md.
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("@playwright/test");

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/capture-guide-shots.mjs <baseUrl>");
  process.exit(1);
}
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
const OUT = "docs/user-guide/img";
mkdirSync(OUT, { recursive: true });

const md = readFileSync("CREDENTIALS.local.md", "utf8");
const accounts = [...md.matchAll(/^\|\s*([^|]+?)\s*\|\s*(owner|mechanic)\s*\|\s*([^|\s]+@[^|\s]+)\s*\|\s*`([^`]+)`\s*\|/gm)].map(
  (m) => ({ role: m[2], email: m[3], password: m[4] }),
);
const owner = accounts.find((a) => a.role === "owner");
const mechanic = accounts.find((a) => a.role === "mechanic");
if (!owner || !mechanic) throw new Error("CREDENTIALS.local.md needs an owner and a mechanic row");

// Demo customer links written by the production seed: "- <status>: https://host/<token>".
const demoLinks = Object.fromEntries(
  [...md.matchAll(/^\s*[-*]?\s*`?(quoted|declined|approved|in_progress|ready|collected)`?\s*[:|-]?\s*(https?:\/\/[^\s/]+)\/([A-Za-z0-9_-]{30,})/gm)]
    .filter((m) => m[2] === base)
    .map((m) => [m[1], `${base}/${m[3]}`]),
);

// Hide the Next dev-tools badge (local dev server) and caret blink; no animations in shots.
const SHOT_CSS = "nextjs-portal{display:none!important} *{caret-color:transparent!important}";
const browser = await chromium.launch();
const skipped = [];

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: SHOT_CSS });
  await page.waitForTimeout(300);
}
async function shot(target, name, opts = {}) {
  const page = "page" in target ? target.page() : target;
  await settle(page);
  await target.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log(`saved ${name}.png`);
}
/** The page area of `locator` (plus `pad` px), cut at the first screen unless `full`. Bigger text in print than a full frame. */
async function area(page, locator, name, { pad = 0, full = false } = {}) {
  await settle(page);
  const b = await locator.boundingBox();
  const vh = page.viewportSize().height;
  const y = Math.max(0, b.y - pad);
  const clip = { x: Math.max(0, b.x - pad), y, width: b.width + 2 * pad, height: full ? b.height + 2 * pad : Math.min(b.height + 2 * pad, vh - y) };
  await shot(page, name, { clip, fullPage: full });
}
/** The staff page without the left menu and top bar (chapter 3 shows those once). */
const mainArea = (page, name, opts) => area(page, page.locator("main#main"), name, opts);
async function newContext(kind) {
  const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
  return browser.newContext({ ...(kind === "phone" ? phone : desktop), reducedMotion: "reduce", locale: "en-GB" });
}
async function signIn(account) {
  const ctx = await newContext("desktop");
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/dashboard" || u.pathname === "/jobs", { timeout: 30_000 }).catch(() => {
    throw new Error(`sign-in failed for the ${account.role} account (still on ${new URL(page.url()).pathname})`);
  });
  return { ctx, page };
}
/** First job in the list filtered by status, or null. */
async function firstJob(page, status) {
  await page.goto(`${base}/jobs?status=${status}`);
  const href = await page.locator('main a[href^="/jobs/"]:not([href="/jobs/new"])').first().getAttribute("href", { timeout: 5_000 }).catch(() => null);
  if (!href) skipped.push(`no ${status} job`);
  return href ? `${base}${href}` : null;
}
/** The card whose title is `title` (innermost match). */
const card = (page, title) => page.locator("div.rounded-xl").filter({ has: page.locator("h2", { hasText: new RegExp(`^${title}$`) }) }).last();
async function dialogShot(page, open, name) {
  await open.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(400); // open animation
  await shot(dialog, name);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

// 1. Public pages (signed out).
{
  const ctx = await newContext("desktop");
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await area(page, page.locator("main").first(), "login", { pad: 20 });
  await page.goto(`${base}/forgot-password`);
  await area(page, page.locator("main").first(), "forgot-password", { pad: 20 });
  await ctx.close();
}

// 2. Owner (sign-in 1 of 2).
const links = { ...demoLinks };
{
  const { ctx, page } = await signIn(owner);
  await page.goto(`${base}/dashboard`);
  await shot(page, "dashboard");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).waitFor();
  await shot(page.locator("aside").first(), "sidebar-menu");
  await page.keyboard.press("Escape");

  await page.goto(`${base}/customers`);
  await mainArea(page, "customers");
  const customer = await page.locator('main a[href^="/customers/"]:not([href="/customers/new"])').first().getAttribute("href");
  await page.goto(`${base}${customer}`);
  await mainArea(page, "customer");
  await page.goto(`${base}/customers/new`);
  await mainArea(page, "new-customer");
  await page.goto(`${base}/jobs/new`);
  await mainArea(page, "new-job");
  await page.goto(`${base}/jobs`);
  await mainArea(page, "jobs");

  const newJob = await firstJob(page, "new");
  if (newJob) {
    await page.goto(newJob);
    await mainArea(page, "job-new");
    await shot(card(page, "Line items"), "line-items");
  }
  const quoted = await firstJob(page, "quoted");
  if (quoted) {
    await page.goto(quoted);
    await shot(card(page, "Customer link"), "link-panel");
    await dialogShot(page, page.getByRole("button", { name: "Record phone approval" }), "phone-approval");
  }
  const approved = await firstJob(page, "approved");
  if (approved) {
    await page.goto(approved);
    await mainArea(page, "job-approved");
    await dialogShot(page, page.getByRole("button", { name: "Cancel job" }), "cancel-job");
  }
  const collected = await firstJob(page, "collected");
  if (collected) {
    await page.goto(collected);
    await shot(card(page, "Timeline"), "timeline");
  }
  await page.goto(`${base}/settings`);
  await mainArea(page, "settings");
  await page.goto(`${base}/staff`);
  await mainArea(page, "staff");
  await dialogShot(page, page.getByRole("button", { name: "Add mechanic" }), "add-mechanic");
  await page.goto(`${base}/profile`);
  await mainArea(page, "profile", { full: true });

  // Local only: make fresh customer links (production uses the seeded demo links instead).
  if (isLocal) {
    for (const status of ["quoted", "in_progress", "ready"]) {
      const job = await firstJob(page, status);
      if (!job) continue;
      await page.goto(job);
      const panel = card(page, "Customer link");
      const regenerate = panel.getByRole("button", { name: "Regenerate link" });
      if (await regenerate.isVisible()) {
        await regenerate.click();
        await page.getByRole("dialog").getByRole("button", { name: "Regenerate link" }).click();
      } else {
        await panel.getByRole("button", { name: "Create customer link" }).click();
      }
      const input = page.getByTestId("customer-link-url");
      await input.waitFor();
      links[status] = await input.inputValue();
      if (status === "quoted") {
        // The URL is shown only now; mask it (live host, dotted token) before the shot so no token lands in a file.
        await input.evaluate((el) => {
          el.value = "https://garage-desk-tau.vercel.app/••••••••••••••••••••";
        });
        await page.locator("body").click({ position: { x: 5, y: 5 } }); // drop focus so the text is not selected
        await shot(panel, "link-created");
      }
    }
  } else {
    skipped.push("link-created (local only: it creates a link)");
  }
  await ctx.close();
}

// 3. Mechanic (sign-in 2 of 2).
{
  const { ctx, page } = await signIn(mechanic);
  await page.goto(`${base}/jobs`);
  await shot(page, "mechanic-jobs");
  await ctx.close();
}

// 4. The customer's phone (no login). Approve/Decline are never pressed.
for (const [status, name] of [
  ["quoted", "customer-quote"],
  ["in_progress", "customer-progress"],
  ["ready", "customer-ready"],
]) {
  if (!links[status]) {
    skipped.push(`${name} (no ${status} link)`);
    continue;
  }
  const ctx = await newContext("phone");
  const page = await ctx.newPage();
  await page.goto(links[status]);
  await shot(page, name); // one phone screen: the status message, and on a quote the sticky Approve/Decline bar
  if (status === "quoted") {
    await page.getByRole("button", { name: "Decline" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(400);
    await shot(page, "customer-decline");
  }
  await ctx.close();
}

await browser.close();
if (skipped.length) console.log(`skipped: ${skipped.join("; ")}`);
