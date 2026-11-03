// Two-step sign-in (D-110): a throwaway mechanic turns it on from /profile, signs in with a code, turns it off.
// The code comes from the setup key on the page, like an authenticator app would compute it.
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createThrowawayStaff, deleteStaff, openMainNav, randomIp, signIn, tag } from "./support";

// Signed out, with this worker's own client IP so the per-IP login limit (D-012) is not shared.
test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

const created: string[] = [];
test.afterAll(async () => deleteStaff(created.splice(0)));

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 6238 TOTP (HMAC-SHA1, 30 s steps, 6 digits) for a base32 secret at `at` ms. */
function totp(secret: string, at = Date.now()): string {
  const bits = [...secret.replace(/=+$/, "").toUpperCase()].map((c) => BASE32.indexOf(c).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  return String((h.readUInt32BE(h[h.length - 1] & 0xf) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** A code no 30 s window around now accepts. */
function wrongCode(secret: string): string {
  const near = [-30_000, 0, 30_000].map((d) => totp(secret, Date.now() + d));
  for (let n = 0; ; n++) {
    const code = String(n).padStart(6, "0");
    if (!near.includes(code)) return code;
  }
}

async function signOutViaMenu(page: Page) {
  await openMainNav(page);
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("RFC 6238 helper matches the RFC test vector", () => {
  // Secret "12345678901234567890" (ASCII) in base32; T = 59 s → 94287082, last 6 digits.
  expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
});

test("turn on, sign in with a code (a wrong one is refused), turn off", async ({ page }) => {
  const me = await createThrowawayStaff("mechanic", `Mia Twostep ${tag()}`);
  created.push(me.id);
  await signIn(page, me.email, me.password);
  await expect(page).toHaveURL(/\/jobs$/);

  // Turn on: QR (data URI, CSP img-src) + setup key, then the first code.
  await page.goto("/profile");
  await page.getByRole("button", { name: "Turn on" }).click();
  const qr = page.getByRole("img", { name: /QR code/ });
  await expect(qr).toBeVisible();
  await expect.poll(() => qr.evaluate((img: HTMLImageElement) => img.naturalWidth), { message: "QR data URI loads" }).toBeGreaterThan(0);
  const secret = await page.getByLabel(/Enter this setup key/).inputValue();
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel("Enter the 6-digit code the app shows").fill(totp(secret));
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Two-step sign-in is on." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();

  // The password alone no longer opens the app.
  await signOutViaMenu(page);
  await signIn(page, me.email, me.password);
  await expect(page).toHaveURL(/\/login\/verify$/);
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login\/verify$/);

  const code = page.getByLabel("6-digit code");
  await code.fill(wrongCode(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "That code didn't work. Check the code in your authenticator app and try again." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login\/verify$/);

  await code.fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/jobs$/);

  // Turn off (confirmed), then the password alone is enough again.
  await page.goto("/profile");
  await page.getByRole("button", { name: "Turn off" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Two-step sign-in is off." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
  await signOutViaMenu(page);
  await signIn(page, me.email, me.password);
  await expect(page).toHaveURL(/\/jobs$/);
});
