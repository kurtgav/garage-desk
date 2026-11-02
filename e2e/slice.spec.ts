// The full job slice: owner creates job → lines → quote v1 → link → customer approves on a 375px phone →
// a line change re-quotes (v2) → a stale tab cannot approve v1 → v2 approved → work, rework, collected → revenue.
// Money is asserted against the DB, formatted by the app's own formatCents (no hardcoded amounts).
import { expect, test, type Page } from "@playwright/test";
import { QUOTE_CHANGED } from "@/lib/data/errors";
import { formatCents } from "@/lib/money";
import {
  admin,
  createCustomerWithVehicle,
  createJob,
  customerContext,
  jobRow,
  MECHANIC_STATE,
  must,
  OWNER_STATE,
  readUsers,
  tag,
} from "./support";

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("FR6 AC1 slice: quote, link approval, re-quote, stale tab, rework, collected, revenue", async ({ page, browser, baseURL }) => {
    test.setTimeout(120_000);
    const users = readUsers();
    const t = tag();
    const { vehicle } = await createCustomerWithVehicle({ fullName: `Ana Slice${t}` });

    await page.goto(`/jobs/new?vehicle=${vehicle.id}`);
    await expect(page.getByLabel("Vehicle")).toHaveValue(vehicle.id);
    await page.getByLabel("Mechanic").selectOption(users.mechanicB.id);
    await page.getByLabel("What needs doing").fill(`Brakes squeal ${t}`);
    await page.getByRole("button", { name: "Create job" }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;

    // Labour (rate copied from settings by the DB) and a part.
    await addLine(page, { description: "Brake service", quantity: "1.25" });
    await addLine(page, { description: "Brake pads (set)", quantity: "2", unitPrice: "12.25" });

    await page.getByRole("button", { name: "Send quote" }).click();
    await expect(page.getByTestId("quote-version")).toHaveText("Quote v1");
    await expect(page.getByText("Waiting for the customer's approval")).toBeVisible();
    const v1 = await jobRow(jobId);
    expect([v1.status, v1.quote_version]).toEqual(["quoted", 1]);
    await expect(page.getByTestId("subtotal-amount")).toHaveText(formatCents(v1.quoted_subtotal_cents));
    await expect(page.getByTestId("vat-amount")).toHaveText(formatCents(v1.quoted_vat_cents));
    await expect(page.getByTestId("total-amount")).toHaveText(formatCents(v1.quoted_total_cents));

    await page.getByRole("button", { name: "Create customer link" }).click();
    const linkInput = page.getByTestId("customer-link-url");
    await expect(linkInput).toHaveValue(/^https?:\/\/[^/]+\/[A-Za-z0-9_-]{43}$/);
    // The link's origin is NEXT_PUBLIC_SITE_URL; open its path on the server under test.
    const linkPath = new URL(await linkInput.inputValue()).pathname;

    // The customer opens the link in two tabs on their phone, both on quote v1.
    const phone = await customerContext(browser, baseURL);
    const tabA = await phone.newPage();
    const tabB = await phone.newPage();
    for (const tab of [tabA, tabB]) {
      expect((await tab.goto(linkPath))?.status()).toBe(200);
      await expect(tab.getByTestId("quote-version")).toHaveText("Quote v1");
    }
    await expect(tabA.getByRole("heading", { name: "Hi Ana" })).toBeVisible();
    await expect(tabA.getByTestId("total-amount")).toHaveText(formatCents(v1.quoted_total_cents));
    expect(await tabA.evaluate(() => document.documentElement.scrollWidth), "no sideways scroll at 375px").toBeLessThanOrEqual(375);

    await approveButton(tabA).click();
    await expect(tabA.getByText("Quote approved — work will start soon")).toBeVisible();
    expect(await approvedEvents(jobId)).toEqual([{ actor_type: "customer", channel: "link", quote_version: 1 }]);

    // A line change on the approved job re-quotes automatically: v2, back to Quoted, v1 approval kept on record.
    await page.reload();
    await addLine(page, { description: "Brake fluid", quantity: "1", unitPrice: "9.90" });
    await expect(page.getByTestId("quote-version")).toHaveText("Quote v2");
    await expect(page.getByText(/^Approved by customer via link — v1 · /)).toBeVisible();
    await expect(page.getByText(/^Quote revised after line change — v2 · /)).toBeVisible();
    const v2 = await jobRow(jobId);
    expect([v2.status, v2.quote_version]).toEqual(["quoted", 2]);

    // Tab B still shows v1: its approve is rejected and the page refreshes to v2.
    const stale = tabB.waitForResponse((r) => r.request().method() === "POST");
    await approveButton(tabB).click();
    await stale;
    await expect(tabB.getByText(QUOTE_CHANGED)).toBeVisible();
    await expect(tabB.getByTestId("quote-version")).toHaveText("Quote v2");
    const afterStale = await jobRow(jobId);
    expect([afterStale.status, afterStale.quote_version]).toEqual(["quoted", 2]);
    expect(await approvedEvents(jobId)).toHaveLength(1);

    await expect(tabB.getByTestId("total-amount")).toHaveText(formatCents(v2.quoted_total_cents));
    await approveButton(tabB).click();
    await expect(tabB.getByText("Quote approved — work will start soon")).toBeVisible();
    await phone.close();
    const approved = await jobRow(jobId);
    expect([approved.status, approved.approved_quote_version]).toEqual(["approved", 2]);
    expect([approved.approved_subtotal_cents, approved.approved_total_cents]).toEqual([
      v2.quoted_subtotal_cents,
      v2.quoted_total_cents,
    ]);
    expect(await approvedEvents(jobId)).toEqual([
      { actor_type: "customer", channel: "link", quote_version: 1 },
      { actor_type: "customer", channel: "link", quote_version: 2 },
    ]);

    // Work, ready, rework with a note, ready again, collected.
    await page.reload();
    await staffStep(page, jobId, "Start work", "in_progress");
    await staffStep(page, jobId, "Mark ready for collection", "ready");
    await page.getByRole("button", { name: "Back to work (rework)" }).click();
    const rework = page.getByRole("dialog");
    await rework.getByLabel("Note (optional)").fill(`Squeal is back ${t}`);
    await rework.getByRole("button", { name: "Back to work (rework)" }).click();
    await expect.poll(async () => (await jobRow(jobId)).status).toBe("in_progress");
    await expect(page.getByText(`Squeal is back ${t}`)).toBeVisible(); // staff timeline shows the rework note
    await staffStep(page, jobId, "Mark ready for collection", "ready");
    await staffStep(page, jobId, "Mark collected", "collected");

    // FR8 / D-056: net revenue = Σ approved_subtotal_cents of jobs collected in the garage's current month.
    await page.goto("/dashboard");
    await expect(async () => {
      const expected = await revenueThisMonth(jobId);
      await page.reload();
      await expect(page.getByTestId("revenue-net")).toHaveText(formatCents(expected), { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });
});

test.describe("mechanic", () => {
  test.use({ storageState: MECHANIC_STATE });

  test("FR1 AC: another mechanic's job, /dashboard and /settings give the generic 404", async ({ page }) => {
    const users = readUsers();
    const t = tag();
    const { vehicle } = await createCustomerWithVehicle({ fullName: `Iso Cruz${t}` });
    const mine = await createJob({ vehicleId: vehicle.id, mechanicId: users.mechanic.id, description: `Mine ${t}` });
    const theirs = await createJob({ vehicleId: vehicle.id, mechanicId: users.mechanicB.id, description: `Theirs ${t}` });

    // Control: the session works and the mechanic's own job opens.
    expect((await page.goto(`/jobs/${mine.id}`))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: mine.ref })).toBeVisible();

    for (const path of [`/jobs/${theirs.id}`, "/dashboard", "/settings"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      const body = await res!.text();
      for (const leak of [theirs.ref, `Theirs ${t}`]) expect(body, `${path} leaks ${leak}`).not.toContain(leak);
    }
  });
});

const approveButton = (p: Page) => p.getByRole("button", { name: /^Approve/ });

/** Labour when unitPrice is omitted (the DB copies the settings rate). */
async function addLine(page: Page, line: { description: string; quantity: string; unitPrice?: string }) {
  await page.getByLabel("Kind").selectOption(line.unitPrice ? "part" : "labour");
  await page.getByLabel("Description", { exact: true }).fill(line.description);
  await page.getByLabel(line.unitPrice ? "Quantity" : "Hours").fill(line.quantity);
  if (line.unitPrice) await page.getByLabel(/^Unit price/).fill(line.unitPrice);
  await page.getByRole("button", { name: "Add line" }).click();
  await expect(page.getByRole("cell", { name: line.description, exact: true })).toBeVisible();
  // The form clears itself after a successful add; wait for that so the next fill is not wiped.
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("");
}

async function staffStep(page: Page, jobId: string, button: string, to: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect.poll(async () => (await jobRow(jobId)).status).toBe(to);
}

async function approvedEvents(jobId: string) {
  return must(
    await admin()
      .from("job_events")
      .select("actor_type, channel, quote_version")
      .eq("job_id", jobId)
      .eq("to_status", "approved")
      .order("created_at"),
    "approved events",
  );
}

/** Independent of get_dashboard: the month boundary comes from Intl in the garage's timezone (settings). */
async function revenueThisMonth(mustInclude: string): Promise<number> {
  const db = admin();
  const { timezone } = must(await db.from("settings").select("timezone").eq("id", 1).single(), "settings");
  const month = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).format(d);
  const since = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const rows = must(
    await db.from("jobs").select("id, collected_at, approved_subtotal_cents").eq("status", "collected").gte("collected_at", since),
    "collected jobs",
  );
  const thisMonth = rows.filter((r) => month(new Date(r.collected_at)) === month(new Date()));
  expect(thisMonth.map((r) => r.id), "the collected slice job counts this month").toContain(mustInclude);
  return thisMonth.reduce((sum, r) => sum + Number(r.approved_subtotal_cents), 0);
}
