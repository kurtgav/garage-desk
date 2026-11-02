import { expect, test } from "@playwright/test";

// D-019 / FR6 hardening: every HTML response, including any unknown URL, carries these headers.
test("unknown URL returns 404 with the security headers", async ({ page }) => {
  const res = await page.goto("/this-does-not-exist");
  expect(res, "navigation response").not.toBeNull();
  expect(res!.status()).toBe(404);

  const headers = await res!.allHeaders();
  expect(headers["x-robots-tag"]).toContain("noindex");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toContain("no-store");
});
