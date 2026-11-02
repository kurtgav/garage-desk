// Phase 2 thin slice (PLAN 2.3): owner creates job → lines → quote → link → customer approves on a 375px phone.
// Money is asserted against the DB's frozen quote, formatted by the app's own formatCents (no hardcoded amounts).
// Pending: in_progress → ready → collected → dashboard revenue (the flow is being changed; follow-up brief).
import { expect, test } from "@playwright/test";
import { formatCents } from "@/lib/money";
import { createCustomerWithVehicle, createJob, jobRow, MECHANIC_STATE, must, admin, OWNER_STATE, readUsers, tag } from "./support";

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("FR6 AC1 slice: job → lines → quote → link → customer approves on 375px without login", async ({ page, browser, baseURL }) => {
    const users = readUsers();
    const t = tag();
    // No Customers UI yet (PLAN 3.1): customer + vehicle via the admin API.
    const { vehicle } = await createCustomerWithVehicle({ fullName: `Ana Slice${t}` });

    await page.goto("/jobs/new");
    await page.getByLabel("Vehicle").selectOption(vehicle.id);
    await page.getByLabel("Mechanic").selectOption(users.mechanicB.id);
    await page.getByLabel("What needs doing").fill(`Brakes squeal ${t}`);
    await page.getByRole("button", { name: "Create job" }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;

    // Labour (rate copied from settings by the DB) and a part.
    await page.getByLabel("Description", { exact: true }).fill("Brake service");
    await page.getByLabel("Hours").fill("1.5");
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByRole("cell", { name: "Brake service", exact: true })).toBeVisible();
    await page.getByLabel("Kind").selectOption("part");
    await page.getByLabel("Description", { exact: true }).fill("Brake pads (set)");
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel(/^Unit price/).fill("1250.50");
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByRole("cell", { name: "Brake pads (set)", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Send quote" }).click();
    await expect(page.getByText("Waiting for customer approval via link")).toBeVisible();
    const quoted = await jobRow(jobId);
    expect(quoted.status).toBe("quoted");
    await expect(page.getByTestId("subtotal-amount")).toHaveText(formatCents(quoted.quoted_subtotal_cents));
    await expect(page.getByTestId("vat-amount")).toHaveText(formatCents(quoted.quoted_vat_cents));
    await expect(page.getByTestId("total-amount")).toHaveText(formatCents(quoted.quoted_total_cents));

    await page.getByRole("button", { name: "Create customer link" }).click();
    const linkInput = page.getByTestId("customer-link-url");
    await expect(linkInput).toHaveValue(/^https?:\/\/[^/]+\/[A-Za-z0-9_-]{43}$/);
    // The link's origin is NEXT_PUBLIC_SITE_URL; open its path on the server under test.
    const linkPath = new URL(await linkInput.inputValue()).pathname;

    const phone = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const customer = await phone.newPage();
    expect((await customer.goto(linkPath))?.status()).toBe(200);
    await expect(customer.getByRole("heading", { name: "Hi Ana" })).toBeVisible();
    await expect(customer.getByTestId("total-amount")).toHaveText(formatCents(quoted.quoted_total_cents));
    expect(await customer.evaluate(() => document.documentElement.scrollWidth), "no sideways scroll at 375px").toBeLessThanOrEqual(375);

    await customer.getByRole("button", { name: /^Approve/ }).click();
    await expect(customer.getByText("Quote approved — work will start soon")).toBeVisible();
    await phone.close();

    const approved = await jobRow(jobId);
    expect(approved.status).toBe("approved");
    expect(approved.approved_total_cents).toBe(quoted.quoted_total_cents);
    const event = must(
      await admin().from("job_events").select("actor_type, actor_id").eq("job_id", jobId).eq("to_status", "approved").single(),
      "approved event",
    );
    expect(event).toEqual({ actor_type: "customer", actor_id: null });

    await page.reload();
    await expect(page.getByRole("button", { name: "Start work" })).toBeVisible();
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
