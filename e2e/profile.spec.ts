// /profile (PLAN Phase 5, D-076, D-078, D-079, D-083): details, photo, password. Every test signs in as its
// own throwaway mechanic, because these flows change the account (the shared e2e users stay untouched).
import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  createThrowawayStaff,
  deleteStaff,
  expectSignInRefused,
  freshContext,
  must,
  openMainNav,
  randomIp,
  signIn,
  strongPassword,
  tag,
  type Throwaway,
} from "./support";

// Signed out, with this worker's own client IP so the per-IP login limit (D-012) is not shared.
test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

const created: string[] = [];
test.afterAll(async () => deleteStaff(created.splice(0)));

async function signedInThrowaway(page: Page, name: string): Promise<Throwaway> {
  const me = await createThrowawayStaff("mechanic", `${name} ${tag()}`);
  created.push(me.id);
  await signIn(page, me.email, me.password);
  await page.goto("/profile");
  return me;
}

/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const profileRow = async (id: string) =>
  must(await admin().from("profiles").select("full_name, phone, about, avatar_path").eq("id", id).single(), "profile");

test("name, phone and about are saved and shown again after a reload", async ({ page }) => {
  const me = await signedInThrowaway(page, "Tia Details");
  const t = tag();
  const details = { full_name: `Tia Renamed ${t}`, phone: "088 123 4567", about: `Diesel engines and brakes ${t}` };

  await expect(page.getByLabel("Email")).toHaveValue(me.email);
  await expect(page.getByLabel("Email")).not.toBeEditable();
  await page.getByLabel("Full name").fill(details.full_name);
  await page.getByLabel("Phone (optional)").fill(details.phone);
  await page.getByLabel("About (optional)").fill(details.about);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue(details.full_name);
  await expect(page.getByLabel("Phone (optional)")).toHaveValue(details.phone);
  await expect(page.getByLabel("About (optional)")).toHaveValue(details.about);
  expect(await profileRow(me.id)).toMatchObject(details);
  // The shell's account card shows the new name.
  await openMainNav(page);
  await expect(page.getByRole("button", { name: /Account menu/ })).toContainText(details.full_name);
});

test("a photo upload shows in the sidebar and can be removed", async ({ page }) => {
  const me = await signedInThrowaway(page, "Uma Photo");

  await page.locator('input[type="file"][name="avatar"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Preview. Save to show it to your colleagues.")).toBeVisible();
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Photo saved.")).toBeVisible();
  const saved = (await profileRow(me.id)).avatar_path;
  expect(saved).toMatch(new RegExp(`^${me.id}/[0-9a-f-]{36}\\.png$`));

  // Private bucket: the sidebar shows it through a short-lived signed URL (D-078, D-083).
  await openMainNav(page);
  const sidebarPhoto = page.getByRole("button", { name: /Account menu/ }).locator("img");
  await expect(sidebarPhoto).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/avatars\/.+token=/);
  await expect.poll(() => sidebarPhoto.evaluate((img: HTMLImageElement) => img.naturalWidth), { message: "signed URL loads (CSP img-src)" }).toBeGreaterThan(0);
  await page.keyboard.press("Escape"); // close the drawer on small screens

  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByText("Photo removed.")).toBeVisible();
  expect((await profileRow(me.id)).avatar_path).toBeNull();
  const files = must(await admin().storage.from("avatars").list(me.id), "list avatars");
  expect(files.map((f) => f.name), "the removed file is deleted").not.toContain(saved!.split("/")[1]);
  await openMainNav(page);
  await expect(page.getByRole("button", { name: /Account menu/ }).locator("img")).toHaveCount(0);
});

test("a non-image renamed to .png is rejected and nothing is stored", async ({ page }) => {
  const me = await signedInThrowaway(page, "Ivo Fake");

  // The browser reports image/png from the extension, so only the server's magic-byte check can catch it.
  const fake = { name: "invoice.png", mimeType: "image/png", buffer: Buffer.from("%PDF-1.7 not really a picture") };
  await page.locator('input[type="file"][name="avatar"]').setInputFiles(fake);
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Choose a PNG, JPEG or WebP image.")).toBeVisible();
  expect((await profileRow(me.id)).avatar_path).toBeNull();
  expect(must(await admin().storage.from("avatars").list(me.id), "list avatars")).toEqual([]);
});

test("change password: a wrong current password is refused; then the new password signs in", async ({ page, browser, baseURL }, testInfo) => {
  const me = await signedInThrowaway(page, "Pia Password");
  const next = strongPassword();
  const form = (current: string) => async () => {
    await page.getByLabel("Current password").fill(current);
    await page.getByLabel("New password", { exact: true }).fill(next);
    await page.getByLabel("Confirm new password").fill(next);
    await page.getByRole("button", { name: "Change password" }).click();
  };

  await form(`${me.password}x`)();
  await expect(page.getByText("Your current password is incorrect.")).toBeVisible();

  await form(me.password)();
  await expect(page.getByText("Password changed.")).toBeVisible();
  await expect(page.getByLabel("Current password")).toHaveValue("");

  const other = await freshContext(browser, testInfo, baseURL);
  const login = await other.newPage();
  await expectSignInRefused(login, me.email, me.password);
  await signIn(login, me.email, next);
  await expect(login).toHaveURL(/\/jobs$/);
  await other.close();
});

test("sign out everywhere: this device lands on /login with a notice, and another device is signed out too (D-107)", async ({ page, browser, baseURL }, testInfo) => {
  const me = await signedInThrowaway(page, "Sid Everywhere");
  const other = await freshContext(browser, testInfo, baseURL);
  const phone = await other.newPage();
  await signIn(phone, me.email, me.password);
  await expect(phone).toHaveURL(/\/jobs$/);

  // Cancel keeps everything as it was.
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleDescription(/every phone and computer, this one included/);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=everywhere$/);
  await expect(page.getByRole("status").filter({ hasText: "You are signed out on every device." })).toBeVisible();
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login$/);

  // The other device's next page: its session no longer exists in Auth.
  await phone.goto("/customers");
  await expect(phone).toHaveURL(/\/login$/);
  await other.close();

  // The password itself still works.
  await signIn(page, me.email, me.password);
  await expect(page).toHaveURL(/\/jobs$/);
});
