// Forgot / reset password (PLAN Phase 5, D-079) through the local mail catcher (Mailpit, e2e/mailbox.ts).
// Local / CI only: against production (E2E_BASE_URL) the built-in mailer reaches only the project team.
import { expect, test } from "@playwright/test";
import { clearMailbox, clearPasswordResetLimit, latestRecoveryLink } from "./mailbox";
import {
  createThrowawayStaff,
  deleteStaff,
  expectSignInRefused,
  freshContext,
  isLocal,
  randomIp,
  signIn,
  strongPassword,
  tag,
} from "./support";

test.skip(!isLocal, "needs the local mail catcher");
test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

const created: string[] = [];
test.afterAll(async () => deleteStaff(created.splice(0)));

test("neutral answer, mailed link sets a new password once, and the reset page needs a recovery session", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(90_000);
  await clearPasswordResetLimit();
  const me = await createThrowawayStaff("mechanic", `Rita Reset ${tag()}`);
  created.push(me.id);
  await clearMailbox(me.email);

  // The same answer for an account and for nobody (no account enumeration).
  const answer = async (email: string) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const status = page.getByRole("status").filter({ hasText: "Check your email" });
    await expect(status).toBeVisible();
    return status.innerText();
  };
  const known = await answer(me.email);
  const unknown = await answer(`nobody-${tag()}@e2e.garagedesk.test`);
  expect(unknown).toBe(known);

  // The mailed link → recovery session → /reset-password → new password → role home.
  const link = await latestRecoveryLink(me.email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);
  const next = strongPassword();
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/jobs$/);

  const other = await freshContext(browser, testInfo, baseURL);
  const login = await other.newPage();
  await expectSignInRefused(login, me.email, me.password);
  await signIn(login, me.email, next);
  // A normal password session cannot use /reset-password (it would skip the current password).
  await login.goto("/reset-password");
  await expect(login).toHaveURL(/\/forgot-password$/);
  await other.close();

  // The link works once.
  const reuse = await freshContext(browser, testInfo, baseURL);
  const again = await reuse.newPage();
  await again.goto(link);
  await expect(again).toHaveURL(/\/forgot-password\?expired=1$/);
  await expect(again.getByText("That link has expired or was already used. Request a new one.")).toBeVisible();

  // No session at all.
  await reuse.clearCookies();
  await again.goto("/reset-password");
  await expect(again).toHaveURL(/\/forgot-password$/);
  await reuse.close();
});
