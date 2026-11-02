// Landing page `/` (PLAN Phase 5): public, never redirects; the CTA is "Sign in" for visitors and "Open app"
// (role home) for signed-in staff. Checked at both project sizes, axe included.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MECHANIC_STATE, OWNER_STATE } from "./support";

/** Opens `/` with motion reduced (reveal animations settle at once) and checks it stays there. */
async function openLanding(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname === "/");
}

const visibleLinks = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).filter({ visible: true });

test.describe("anonymous", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders with Sign in, no sideways scroll and no axe violations", async ({ page }) => {
    await openLanding(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const signIn = visibleLinks(page, "Sign in");
    await expect(signIn.first()).toBeVisible();
    for (const href of await signIn.evaluateAll((as) => as.map((a) => a.getAttribute("href")))) expect(href).toBe("/login");
    await expect(page.getByRole("link", { name: "Open app" })).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

    await signIn.first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

for (const [role, state, home] of [
  ["owner", OWNER_STATE, "/dashboard"],
  ["mechanic", MECHANIC_STATE, "/jobs"],
] as const) {
  test.describe(role, () => {
    test.use({ storageState: state });

    test(`stays on / and offers Open app → ${home}`, async ({ page }) => {
      await openLanding(page);
      const openApp = visibleLinks(page, "Open app");
      await expect(openApp.first()).toBeVisible();
      for (const href of await openApp.evaluateAll((as) => as.map((a) => a.getAttribute("href")))) expect(href).toBe(home);
      await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
      await openApp.first().click();
      await expect(page).toHaveURL(new RegExp(`${home}$`));
    });
  });
}
