// Who may do what (D-051, D-052): mechanics create their own jobs; phone approval and cancel are owner-only;
// customers decline and the staff send a new quote. Customer pages open in their own 375px context (no login).
import { expect, test } from "@playwright/test";
import { admin, customerContext, jobRow, MECHANIC_STATE, must, OWNER_STATE, quotedJobWithLink, randomPhone, randomPlate, readUsers, tag } from "./support";

test.describe("mechanic", () => {
  test.use({ storageState: MECHANIC_STATE });

  test("creates a customer and a job assigned to themself, quotes it, and has no owner-only actions", async ({ page }) => {
    const users = readUsers();
    const t = tag();
    const plate = randomPlate();

    await page.goto("/customers/new");
    await page.getByLabel("Full name").fill(`Mia Mech${t}`);
    await page.getByLabel("Phone", { exact: true }).fill(randomPhone());
    await page.getByLabel("Plate").fill(plate);
    await page.getByLabel("Make").fill("Skoda");
    await page.getByLabel("Model").fill("Fabia");
    await page.getByLabel("Year").fill("2018");
    await page.getByRole("button", { name: "Create customer" }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/);

    await page.getByRole("link", { name: /^New job for / }).click();
    await page.waitForURL(/\/jobs\/new\?vehicle=/);
    const vehicleId = new URL(page.url()).searchParams.get("vehicle")!;
    await expect(page.getByLabel("Vehicle")).toHaveValue(vehicleId);
    await expect(page.getByText("Assigned to you")).toBeVisible();
    await expect(page.getByLabel("Mechanic")).toHaveCount(0);
    await page.getByLabel("What needs doing").fill(`Rattle at idle ${t}`);
    await page.getByRole("button", { name: "Create job" }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;
    expect((await jobRow(jobId)).assigned_mechanic_id).toBe(users.mechanic.id);

    await page.getByLabel("Kind").selectOption("part");
    await page.getByLabel("Description", { exact: true }).fill("Heat shield clip");
    await page.getByLabel("Quantity").fill("1");
    await page.getByLabel(/^Unit price/).fill("4.80");
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByRole("cell", { name: "Heat shield clip", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send quote" }).click();
    await expect(page.getByTestId("quote-version")).toHaveText("Quote v1");
    expect((await jobRow(jobId)).status).toBe("quoted");

    // UI hiding is cosmetic (the DB refuses too), but the buttons must not be offered.
    await expect(page.getByRole("button", { name: "Record phone approval" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel job" })).toHaveCount(0);
  });
});

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("records a phone approval with a note; the customer sees 'by phone' but not who or the note", async ({ page, browser, baseURL }) => {
    const users = readUsers();
    const t = tag();
    const note = `Spoke to Petra at 10:05 ${t}`;
    const { job, token } = await quotedJobWithLink({
      customerName: `Petra Phone${t}`,
      description: `Phone approval ${t}`,
      mechanicId: users.mechanicB.id,
    });

    await page.goto(`/jobs/${job.id}`);
    await page.getByRole("button", { name: "Record phone approval" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("How did they approve?").fill(note);
    await dialog.getByRole("button", { name: /^Approve v1 · / }).click();
    await expect(page.getByText(new RegExp(`^Phone approval recorded by ${users.owner.fullName} — v1 · `))).toBeVisible();
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start work" })).toBeVisible();

    const row = await jobRow(job.id);
    expect([row.status, row.approved_quote_version]).toEqual(["approved", 1]);
    const events = must(
      await admin().from("job_events").select("actor_type, actor_id, channel, note").eq("job_id", job.id).eq("to_status", "approved"),
      "approved events",
    );
    expect(events).toEqual([{ actor_type: "staff", actor_id: users.owner.id, channel: "phone", note }]);

    const phone = await customerContext(browser, baseURL);
    const customer = await phone.newPage();
    const res = await customer.goto(`/${token}`);
    await expect(customer.getByText("Quote approved — work will start soon")).toBeVisible();
    await expect(customer.getByText(/^You approved €[\d,.]+ by phone on /)).toBeVisible();
    await expect(customer.getByText("Approved by phone (recorded by the garage)")).toBeVisible();
    const body = await res!.text();
    for (const leak of [users.owner.fullName, note]) expect(body, `public page leaks ${leak}`).not.toContain(leak);
    await phone.close();
  });

  test("cancels with a required reason; the customer link says cancelled and offers no actions", async ({ page, browser, baseURL }) => {
    const t = tag();
    const reason = `Customer sold the car ${t}`;
    const { job, token } = await quotedJobWithLink({
      customerName: `Carl Cancel${t}`,
      description: `Cancel ${t}`,
      mechanicId: readUsers().mechanicB.id,
    });

    await page.goto(`/jobs/${job.id}`);
    await page.getByRole("button", { name: "Cancel job" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Reason")).toHaveAttribute("required", "");
    await dialog.getByLabel("Reason").fill(reason);
    await dialog.getByRole("button", { name: "Cancel job" }).click();
    await expect(page.getByText("Job cancelled", { exact: true })).toBeVisible();
    await expect(page.getByText(`Reason: ${reason}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel job" })).toHaveCount(0);
    expect((await jobRow(job.id)).status).toBe("cancelled");

    const phone = await customerContext(browser, baseURL);
    const customer = await phone.newPage();
    const res = await customer.goto(`/${token}`);
    expect(res?.status()).toBe(200);
    await expect(customer.getByText("This job was cancelled")).toBeVisible();
    await expect(customer.getByRole("button", { name: /^(Approve|Decline)/ })).toHaveCount(0);
    expect(await res!.text(), "public page leaks the cancel reason").not.toContain(reason);
    await phone.close();
  });

  test("customer declines with a reason; staff send a new quote (v2) on the same link", async ({ page, browser, baseURL }) => {
    const t = tag();
    const reason = `Too expensive ${t}`;
    const { job, token } = await quotedJobWithLink({
      customerName: `Dora Decline${t}`,
      description: `Decline ${t}`,
      mechanicId: readUsers().mechanicB.id,
    });

    const phone = await customerContext(browser, baseURL);
    const customer = await phone.newPage();
    await customer.goto(`/${token}`);
    await customer.getByRole("button", { name: "Decline", exact: true }).click();
    const dialog = customer.getByRole("dialog");
    await dialog.getByLabel("Reason (optional)").fill(reason);
    await dialog.getByRole("button", { name: "Decline quote" }).click();
    await expect(customer.getByText("You declined this quote — the garage may send you a new one")).toBeVisible();
    await expect(customer.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    const declined = must(
      await admin().from("job_events").select("actor_type, channel, quote_version, note").eq("job_id", job.id).eq("to_status", "declined"),
      "declined events",
    );
    expect(declined).toEqual([{ actor_type: "customer", channel: "link", quote_version: 1, note: reason }]);

    await page.goto(`/jobs/${job.id}`);
    await expect(page.getByText(/^Declined by customer — v1/)).toBeVisible();
    await expect(page.getByText(`Reason: ${reason}`)).toBeVisible();
    await page.getByRole("button", { name: "Send new quote" }).click();
    await expect(page.getByTestId("quote-version")).toHaveText("Quote v2");
    await expect(page.getByText(/^New quote sent — v2 · /)).toBeVisible();
    const row = await jobRow(job.id);
    expect([row.status, row.quote_version]).toEqual(["quoted", 2]);

    await customer.reload();
    await expect(customer.getByText("Your quote is ready for approval")).toBeVisible();
    await expect(customer.getByTestId("quote-version")).toHaveText("Quote v2");
    await expect(customer.getByRole("button", { name: /^Approve/ })).toBeVisible();
    await phone.close();
  });
});
