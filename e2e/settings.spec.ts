// FR9 + FR4 rate rule through the UI: the owner changes the hourly rate; a labour line already on a job keeps
// its price, a labour line added afterwards uses the new rate. The settings row is global, so the original
// values are restored at the end.
import { expect, test, type Page } from "@playwright/test";
import { admin, createCustomerWithVehicle, createJob, must, OWNER_STATE, readUsers, tag, withLock } from "./support";

test.use({ storageState: OWNER_STATE });

const SETTINGS_COLUMNS = "hourly_rate_cents, vat_bps, garage_name, garage_address, garage_phone";

/** 4500 → "45.00", as the settings form shows it. */
const centsToInput = (cents: number) => {
  const s = String(cents).padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
};

test("FR9: a new hourly rate applies to new labour lines only", async ({ page }, testInfo) => {
  // shortcut: one global settings row; the two projects running this in parallel would race, so desktop only.
  test.skip(testInfo.project.name !== "desktop", "settings is a global singleton");
  // Overlapping runs on this machine take turns, or one would restore the other's changed rate (D-096).
  await withLock("settings", () => rateRule(page));
});

async function rateRule(page: Page) {
  const db = admin();
  const original = must(await db.from("settings").select(SETTINGS_COLUMNS).eq("id", 1).single(), "settings");
  const t = tag();
  const newRate = original.hourly_rate_cents + 125;

  try {
    const { vehicle } = await createCustomerWithVehicle({ fullName: `Rate Rule${t}` });
    const job = await createJob({
      vehicleId: vehicle.id,
      mechanicId: readUsers().mechanic.id,
      description: `Rate rule ${t}`,
      lines: [{ kind: "labour", description: `Old rate ${t}`, quantity: "1" }],
    });

    await page.goto("/settings");
    const rate = page.getByLabel(/^Hourly rate/);
    await expect(rate).toHaveValue(centsToInput(original.hourly_rate_cents));
    await rate.fill(centsToInput(newRate));
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    const saved = must(await db.from("settings").select(SETTINGS_COLUMNS).eq("id", 1).single(), "settings");
    expect(saved).toEqual({ ...original, hourly_rate_cents: newRate });

    // A labour line added now, through the job page.
    await page.goto(`/jobs/${job.id}`);
    await page.getByLabel("Kind").selectOption("labour");
    await page.getByLabel("Description", { exact: true }).fill(`New rate ${t}`);
    await page.getByLabel("Hours").fill("1");
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByRole("cell", { name: `New rate ${t}`, exact: true })).toBeVisible();

    const lines = must(await db.from("job_line_items").select("description, unit_price_cents").eq("job_id", job.id), "lines");
    const price = (d: string) => lines.find((l) => l.description === d)?.unit_price_cents;
    expect(price(`Old rate ${t}`)).toBe(original.hourly_rate_cents);
    expect(price(`New rate ${t}`)).toBe(newRate);
  } finally {
    must(await db.from("settings").update(original).eq("id", 1).select("id"), "restore settings");
  }
}
