// RBAC matrix, cosmetic layer (PLAN Phase 5, D-085, docs/DESIGN.md): mechanics get the generic 404 on owner-only
// pages and never see their nav items; the owner does. The DB boundary is covered by the integration tests.
import { expect, test } from "@playwright/test";
import { MECHANIC_STATE, openMainNav, OWNER_STATE } from "./support";

const OWNER_ONLY = [
  { path: "/dashboard", nav: "Dashboard", heading: /^Welcome back/ },
  { path: "/staff", nav: "Staff", heading: "Staff" },
  { path: "/settings", nav: "Settings", heading: "Settings" },
];

test.describe("mechanic", () => {
  test.use({ storageState: MECHANIC_STATE });

  test("owner-only pages answer with the generic 404 and are not in the nav", async ({ page }) => {
    for (const { path } of OWNER_ONLY) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await expect(page, `${path} title`).toHaveTitle(/Page not found/);
      // No owner controls in the HTML a mechanic receives.
      const body = await res!.text();
      for (const control of ["Add mechanic", "Save settings", "Revenue this month"]) expect(body, `${path}: ${control}`).not.toContain(control);
    }

    await page.goto("/jobs");
    const nav = await openMainNav(page);
    await expect(nav.getByRole("link", { name: /^Customers/ })).toBeVisible();
    for (const { nav: item } of OWNER_ONLY) await expect(nav.getByRole("link", { name: item, exact: true }), item).toHaveCount(0);
  });
});

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("sees Dashboard, Staff and Settings in the nav and can open them", async ({ page }) => {
    await page.goto("/jobs");
    const nav = await openMainNav(page);
    for (const { nav: item } of OWNER_ONLY) await expect(nav.getByRole("link", { name: item, exact: true }), item).toBeVisible();

    for (const { path, heading } of OWNER_ONLY) {
      expect((await page.goto(path))?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });
});
