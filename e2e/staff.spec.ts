// /staff (PLAN Phase 5, D-077, D-084): the owner adds mechanics, resets passwords and (de)activates accounts.
// The owner is the shared e2e owner (storageState); every account it changes is a throwaway, deleted afterwards.
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import {
  admin,
  authUserId,
  createCustomerWithVehicle,
  createJob,
  createThrowawayStaff,
  deleteStaff,
  deleteStaffAndJobs,
  expectSignInRefused,
  freshContext,
  must,
  OWNER_STATE,
  readUsers,
  signIn,
  strongPassword,
  tag,
} from "./support";

test.use({ storageState: OWNER_STATE });

const created: string[] = [];
test.afterAll(async () => deleteStaff(created.splice(0)));
const withJobs: string[] = [];
test.afterAll(async () => deleteStaffAndJobs(withJobs.splice(0)));

/** Reads the one-time password from the dialog that produced it, then closes the dialog (D-084). */
async function takeTempPassword(page: Page): Promise<string> {
  const dialog = page.getByRole("dialog");
  const field = dialog.getByLabel("Temporary password");
  await expect(field).toHaveValue(/^\S{16}$/);
  const password = await field.inputValue();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
  return password;
}

/**
 * /set-password after a temporary password (D-106): the temporary one is refused as the new one, an own password
 * opens the app. Returns the own password.
 */
async function chooseOwnPassword(page: Page, temp: string): Promise<string> {
  const submit = async (password: string) => {
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page.getByLabel("Confirm new password").fill(password);
    await page.getByRole("button", { name: "Save new password" }).click();
  };
  await expect(page.getByRole("heading", { name: "Set your own password" })).toBeVisible();
  await submit(temp);
  await expect(page.getByText("Choose a password that is different from your current one.")).toBeVisible();
  const own = strongPassword();
  await submit(own);
  await expect(page).toHaveURL(/\/jobs$/);
  return own;
}

/** A separate signed-out browser (own cookies, own client IP) for the staff member. */
async function asStaff(browser: Browser, testInfo: TestInfo, baseURL: string | undefined) {
  const context = await freshContext(browser, testInfo, baseURL);
  return { context, page: await context.newPage() };
}

test("add mechanic: the temporary password is shown once, signs in, and must be replaced; reset does it again", async ({ page, browser, baseURL }, testInfo) => {
  const name = `Max Added ${tag()}`;
  const email = `tmp-${tag()}@e2e.garagedesk.test`;

  await page.goto("/staff");
  await page.getByRole("button", { name: "Add mechanic" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Add mechanic" }).click();
  await expect(dialog.getByRole("heading", { name: "Mechanic added" })).toBeVisible();
  const first = await takeTempPassword(page);
  const id = await authUserId(email);
  expect(id, "auth user created").toBeTruthy();
  created.push(id!);
  expect(must(await admin().from("profiles").select("full_name, role, active").eq("id", id!).single(), "profile")).toEqual({
    full_name: name,
    role: "mechanic",
    active: true,
  });

  // Closing the dialog discards it: opening "Add mechanic" again starts an empty form.
  await page.getByRole("button", { name: "Add mechanic" }).click();
  await expect(page.getByRole("dialog").getByLabel("Full name")).toHaveValue("");
  await expect(page.getByRole("dialog").getByLabel("Temporary password")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The table (desktop) and the card list (small screens) both render; only one is visible.
  await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();

  const flag = async () =>
    must(await admin().from("profiles").select("must_change_password").eq("id", id!).single(), "flag").must_change_password;
  expect(await flag()).toBe(true);
  const mechanic = await asStaff(browser, testInfo, baseURL);
  await signIn(mechanic.page, email, first);
  await expect(mechanic.page).toHaveURL(/\/set-password$/);
  // Nothing else opens until they choose their own password.
  await mechanic.page.goto("/customers");
  await expect(mechanic.page).toHaveURL(/\/set-password$/);
  const own = await chooseOwnPassword(mechanic.page, first);
  expect(await flag()).toBe(false);
  await mechanic.page.goto("/customers");
  await expect(mechanic.page).toHaveURL(/\/customers$/);
  await mechanic.context.close();

  await page.getByRole("button", { name: `Reset password for ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: `New password for ${name}` })).toBeVisible();
  const second = await takeTempPassword(page);
  expect(second).not.toBe(first);

  const again = await asStaff(browser, testInfo, baseURL);
  await expectSignInRefused(again.page, email, own);
  await signIn(again.page, email, second);
  await expect(again.page).toHaveURL(/\/set-password$/);
  // Signing out does not skip it: the next sign-in asks again.
  await again.page.getByRole("button", { name: "Sign out" }).click();
  await expect(again.page).toHaveURL(/\/login$/);
  await signIn(again.page, email, second);
  await expect(again.page).toHaveURL(/\/set-password$/);
  await chooseOwnPassword(again.page, second);
  await again.context.close();
});

test("deactivate signs the mechanic out on their next page and blocks sign-in; reactivate lets them back", async ({ page, browser, baseURL }, testInfo) => {
  const mech = await createThrowawayStaff("mechanic", `Dan Deactivated ${tag()}`);
  created.push(mech.id);

  // The mechanic has a live session before the owner acts.
  const session = await asStaff(browser, testInfo, baseURL);
  await signIn(session.page, mech.email, mech.password);
  await expect(session.page).toHaveURL(/\/jobs$/);

  await page.goto("/staff");
  await page.getByRole("button", { name: `Deactivate ${mech.fullName}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("button", { name: `Reactivate ${mech.fullName}` })).toBeVisible();
  expect(must(await admin().from("profiles").select("active").eq("id", mech.id).single(), "profile").active).toBe(false);

  // Existing session: the next navigation lands on /login.
  await session.page.goto("/customers");
  await expect(session.page).toHaveURL(/\/login$/);
  await session.context.close();

  const blocked = await asStaff(browser, testInfo, baseURL);
  await expectSignInRefused(blocked.page, mech.email, mech.password);
  await blocked.context.close();

  await page.getByRole("button", { name: `Reactivate ${mech.fullName}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("button", { name: `Deactivate ${mech.fullName}` })).toBeVisible();

  const back = await asStaff(browser, testInfo, baseURL);
  await signIn(back.page, mech.email, mech.password);
  await expect(back.page).toHaveURL(/\/jobs$/);
  await back.context.close();
});

test("the owner's own row offers no deactivate or reset", async ({ page }) => {
  const { owner } = readUsers();
  await page.goto("/staff");
  await expect(page.getByText(owner.email, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Deactivate ${owner.fullName}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Reset password for ${owner.fullName}` })).toHaveCount(0);
  // Control: other rows do have actions.
  await expect(page.getByRole("button", { name: `Reset password for ${readUsers().mechanic.fullName}` })).toBeVisible();
});

test("a deactivated mechanic's open jobs stay on the dashboard and one click from reassigning (D-092, D-095)", async ({ page }) => {
  const mech = await createThrowawayStaff("mechanic", `Rhea Reassign ${tag()}`);
  withJobs.push(mech.id);
  const { vehicle } = await createCustomerWithVehicle({ fullName: `Reassign Probe ${tag()}` });
  await createJob({ vehicleId: vehicle.id, mechanicId: mech.id, description: "Left behind" });
  const theirJobs = new RegExp(`/jobs\\?mechanic=${mech.id}$`);

  await page.goto("/staff");
  await page.getByRole("button", { name: `Deactivate ${mech.fullName}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleDescription(/1 open job stays assigned to them\. Reassign it from the Jobs list\.$/);
  await expect(dialog.getByRole("link", { name: "Jobs list" })).toHaveAttribute("href", theirJobs);
  await dialog.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("button", { name: `Reactivate ${mech.fullName}` })).toBeVisible();

  // The name's ", <mechanic>" part is screen-reader only (sr-only), which accname joins with a space.
  await page.getByRole("link", { name: new RegExp(`^1 open job · Reassign ?, ${mech.fullName}$`) }).click();
  await expect(page).toHaveURL(theirJobs);
  await expect(page.getByTestId("jobs-count")).toHaveText("1 open job");
  await expect(page.getByRole("link", { name: `Remove filter Mechanic: ${mech.fullName}` })).toBeVisible();

  await page.goto("/dashboard");
  const card = page.getByTestId("workload-card").filter({ has: page.getByRole("link", { name: new RegExp(`^${mech.fullName}`) }) });
  await expect(card.getByText("Inactive · reassign")).toBeVisible();
  await expect(card.getByTestId("workload-open")).toHaveText("1");
  await card.click();
  await expect(page).toHaveURL(theirJobs);
});
