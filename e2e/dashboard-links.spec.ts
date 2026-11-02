// Every dashboard figure opens exactly the jobs it counts (D-090). Other specs change jobs in parallel, so each
// "read the figure → click → count the list" step retries as a whole until both sides agree.
import { expect, test, type Page } from "@playwright/test";
import { createCustomerWithVehicle, createJob, OWNER_STATE, ownerTransition, readUsers, tag } from "./support";

test.use({ storageState: OWNER_STATE });

const num = (s: string | null) => Number(/\d+/.exec(s ?? "")?.[0] ?? NaN);
/** The leading number of "N quoted jobs" in the list header. */
const listCount = async (page: Page) => num(await page.getByTestId("jobs-count").textContent());
/** A KPI card, found by its link (the sidebar has links with the same words). */
const kpi = (page: Page, label: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("link", { name: `${label} — view jobs`, exact: true }) });

let readyRef: string;
let readyId: string;
const created: string[] = [];

test.beforeAll(async () => {
  // Make sure the ready table, the in-progress footer and a workload chip have something to open.
  // No collected job here: slice.spec checks the revenue figure exactly.
  const t = tag();
  const mechanicId = readUsers().mechanicB.id;
  const { vehicle } = await createCustomerWithVehicle({ fullName: `Dash Links${t}` });
  const inProgressJob = async (d: string) => {
    const job = await createJob({
      vehicleId: vehicle.id,
      mechanicId,
      description: `${d} ${t}`,
      lines: [{ kind: "part", description: "Fuse", quantity: "1", unitPriceCents: 500 }],
    });
    await ownerTransition(job.id, "quoted");
    await ownerTransition(job.id, "approved", "Phone OK", 1);
    await ownerTransition(job.id, "in_progress");
    created.push(job.id);
    return job;
  };
  await inProgressJob("Working");
  const ready = await inProgressJob("Ready");
  await ownerTransition(ready.id, "ready");
  readyRef = ready.ref;
  readyId = ready.id;
});

// Cancel them afterwards so repeated runs don't pile up open jobs on the dashboard (or skew its counts).
test.afterAll(async () => {
  for (const id of created) await ownerTransition(id, "cancelled", "e2e cleanup");
});

/** Read a figure on the dashboard, follow `click`, check the URL and that the list has that many jobs. */
async function opensItsJobs(page: Page, read: () => Promise<number>, click: () => Promise<void>, url: RegExp) {
  await expect(async () => {
    await page.goto("/dashboard");
    const figure = await read();
    await click();
    await expect(page).toHaveURL(url);
    expect(await listCount(page)).toBe(figure);
  }).toPass({ timeout: 30_000 });
}

test("each KPI card and footer link opens the jobs it counts", async ({ page }) => {
  test.setTimeout(120_000);
  await opensItsJobs(
    page,
    async () => num(await kpi(page, "Revenue this month").getByText(/jobs? collected/).textContent()),
    () => kpi(page, "Revenue this month").click(),
    /\/jobs\?status=collected&period=month$/,
  );
  await expect(page.getByRole("link", { name: "Remove filter Collected this month" })).toBeVisible();

  await opensItsJobs(page, async () => num(await page.getByTestId("count-open").textContent()), () => kpi(page, "Open jobs").click(), /\/jobs$/);
  await opensItsJobs(
    page,
    async () => num(await page.getByRole("link", { name: /^\d+ in progress$/ }).textContent()),
    () => page.getByRole("link", { name: /^\d+ in progress$/ }).click(),
    /\/jobs\?status=in_progress$/,
  );
  await opensItsJobs(page, async () => num(await page.getByTestId("count-quoted").textContent()), () => kpi(page, "Awaiting approval").click(), /\/jobs\?status=quoted$/);
  await opensItsJobs(page, async () => num(await page.getByTestId("count-ready").textContent()), () => kpi(page, "Ready for collection").click(), /\/jobs\?status=ready$/);

  await page.goto("/dashboard");
  const declined = page.getByRole("link", { name: /^\d+ declined quotes?$/ });
  if (await declined.count()) {
    await opensItsJobs(page, async () => num(await declined.textContent()), () => declined.click(), /\/jobs\?status=declined$/);
  } else {
    await expect(kpi(page, "Awaiting approval").getByText("None declined")).toBeVisible();
  }
});

test("a ready row opens its job from anywhere in the row", async ({ page }) => {
  await page.goto("/dashboard");
  const row = page.getByRole("row").filter({ hasText: readyRef });
  // One link per row (the ref); the rest of the row is its hit area.
  await expect(row.getByRole("link")).toHaveCount(1);
  // Click the row's far end (the "View" cue on wide screens, the total on phones), away from the ref link.
  const box = await row.boundingBox();
  if (!box) throw new Error("ready row not rendered");
  await row.click({ position: { x: box.width - 16, y: box.height / 2 } });
  await expect(page).toHaveURL(new RegExp(`/jobs/${readyId}$`));
});

test("a mechanic's workload card and status chip open that mechanic's jobs", async ({ page }) => {
  test.setTimeout(90_000);
  const { id, fullName } = readUsers().mechanicB;
  const card = page.getByTestId("workload-card").filter({ has: page.getByRole("link", { name: new RegExp(`^${fullName}`) }) });

  await opensItsJobs(page, async () => num(await card.getByTestId("workload-open").textContent()), () => card.click(), new RegExp(`/jobs\\?mechanic=${id}$`));
  await expect(page.getByRole("link", { name: `Remove filter Mechanic: ${fullName}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("aria-current", "page");

  const chip = card.getByRole("link", { name: /Ready jobs/ });
  await opensItsJobs(page, async () => num(await chip.textContent()), () => chip.click(), new RegExp(`/jobs\\?status=ready&mechanic=${id}$`));
  // Status tabs keep the mechanic filter.
  await expect(page.getByRole("link", { name: "Quoted", exact: true })).toHaveAttribute("href", `/jobs?status=quoted&mechanic=${id}`);
});

test("bad filter params are ignored, not an error", async ({ page }) => {
  for (const q of ["?mechanic=not-a-uuid", "?mechanic=00000000-0000-4000-8000-000000000000", "?status=nope&period=year", "?status=ready&period=month"]) {
    const res = await page.goto(`/jobs${q}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("list", { name: "Active filters" })).toHaveCount(0);
  }
});
