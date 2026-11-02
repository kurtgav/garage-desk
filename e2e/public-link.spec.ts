// FR6 customer link: whitelist DTO, identical 404s (D-013, D-019, D-032), idempotent approve.
// Setup runs through the API as the logged-in owner (RLS applies), so these checks do not depend on staff UI.
// The customer side is anonymous: no storageState in this file.
import { expect, test, type APIResponse } from "@playwright/test";
import {
  admin,
  createCustomerWithVehicle,
  createJob,
  jobRow,
  must,
  ownerCreateLink,
  ownerDb,
  ownerTransition,
  randomPhone,
  randomPlate,
  randomToken,
  readUsers,
  sha256Hex,
  tag,
} from "./support";

/** Request-level checks: the HTML does not depend on the viewport, and every view counts toward the 60/min/IP limit (D-012). */
const requestLevelOnly = (projectName: string) =>
  test.skip(projectName !== "desktop", "request-level check; runs once (desktop) to stay under the public rate limit");

test("FR6 AC3: the public page shows only whitelisted fields", async ({ request }, testInfo) => {
  requestLevelOnly(testInfo.project.name);
  const users = readUsers();
  const t = tag();
  // Planted values that must never reach the customer.
  const secret = {
    surname: `Leakname${t}`,
    phone: randomPhone(),
    email: `leak-${t}@example.test`,
    description: `Internal job description ${t}`,
    note: `Internal revise note ${t}`,
  };
  const { customer, vehicle } = await createCustomerWithVehicle({
    fullName: `Maria ${secret.surname}`,
    phone: secret.phone,
    email: secret.email,
  });
  const otherPlate = randomPlate();
  const otherVehicle = must(
    await admin()
      .from("vehicles")
      .insert({ customer_id: customer.id, plate: otherPlate, make: "Honda", model: "City" })
      .select("id")
      .single(),
    "insert second vehicle",
  );
  const job = await createJob({
    vehicleId: vehicle.id,
    mechanicId: users.mechanicB.id,
    description: secret.description,
    lines: [{ kind: "part", description: `Oil filter ${t}`, quantity: "1", unitPriceCents: 45000 }],
  });
  // Quote, revise with an internal note (staff timeline only), quote again.
  await ownerTransition(job.id, "quoted");
  await ownerTransition(job.id, "new", secret.note);
  await ownerTransition(job.id, "quoted");
  const token = await ownerCreateLink(job.id);

  const res = await request.get(`/${token}`);
  expect(res.status()).toBe(200);
  const body = await res.text();

  // Whitelisted values are there (so the absence checks below are not vacuous).
  for (const shown of ["Maria", job.ref, `Oil filter ${t}`, "Toyota", "Vios"]) expect(body, shown).toContain(shown);

  const hidden = {
    ...secret,
    ownerName: users.owner.fullName,
    mechanicName: users.mechanicB.fullName,
    otherPlate,
    otherPlateNormalised: otherPlate.replace(" ", ""),
    jobId: job.id,
    customerId: customer.id,
    vehicleId: vehicle.id,
    otherVehicleId: otherVehicle.id,
    mechanicId: users.mechanicB.id,
    ownerId: users.owner.id,
    tokenHash: sha256Hex(token),
  };
  for (const [what, value] of Object.entries(hidden)) expect(body, `${what} leaked`).not.toContain(value);
  // The phone in any grouping ("0917 555 0142", "0917-555-0142").
  expect(body, "phone leaked").not.toMatch(new RegExp(secret.phone.split("").join("[\\s-]?")));
});

test("FR6 AC2: unknown, tampered, revoked tokens, job ref, job UUID and unknown paths all get the identical 404", async ({
  request,
}, testInfo) => {
  requestLevelOnly(testInfo.project.name);
  const users = readUsers();
  const t = tag();
  const { vehicle } = await createCustomerWithVehicle({ fullName: `Nora Probe${t}` });
  const job = await createJob({
    vehicleId: vehicle.id,
    mechanicId: users.mechanicB.id,
    description: `404 probe ${t}`,
    lines: [{ kind: "part", description: "Wiper blade", quantity: "2", unitPriceCents: 35000 }],
  });
  await ownerTransition(job.id, "quoted");
  const token = await ownerCreateLink(job.id);

  const valid = await request.get(`/${token}`);
  expect(valid.status(), "valid link").toBe(200);
  expectSecurityHeaders(valid);

  // Single-segment paths all hit the token route (D-013); an attacker controls only the path.
  const probes: Record<string, string> = {
    unknownPath: `no-such-page-${t}`,
    unknownToken: randomToken(),
    tamperedToken: (token[0] === "A" ? "B" : "A") + token.slice(1),
    jobRef: job.ref,
    jobUuid: job.id,
  };
  const responses: Record<string, APIResponse> = {};
  for (const [name, segment] of Object.entries(probes)) responses[name] = await request.get(`/${segment}`);

  must(await ownerDb().rpc("revoke_job_link", { p_job_id: job.id }), "revoke_job_link");
  probes.revokedToken = token;
  responses.revokedToken = await request.get(`/${token}`);

  const baseline = await normalised(responses.unknownPath, probes.unknownPath);
  for (const [name, res] of Object.entries(responses)) {
    expect(res.status(), name).toBe(404);
    expectSecurityHeaders(res);
    const got = await normalised(res, probes[name]);
    expect(got.headers, `${name} headers`).toEqual(baseline.headers);
    expect(firstDifference(got.body, baseline.body), `${name} body differs from an unknown path's 404`).toBeNull();
  }
});

test("FR6: after approval the Approve button is gone and a replayed approve changes nothing", async ({ page }, testInfo) => {
  // Customer pages are phone-first; once is enough: approve/decline are limited to 10/min/IP (D-012).
  test.skip(testInfo.project.name !== "mobile-375", "customer flow runs once, on the phone viewport");
  const users = readUsers();
  const t = tag();
  const { vehicle } = await createCustomerWithVehicle({ fullName: `Rosa Twice${t}` });
  const job = await createJob({
    vehicleId: vehicle.id,
    mechanicId: users.mechanicB.id,
    description: `Approve twice ${t}`,
    lines: [{ kind: "labour", description: "Brake inspection", quantity: "1" }],
  });
  await ownerTransition(job.id, "quoted");
  const token = await ownerCreateLink(job.id);

  // Two tabs on the quote; the second one stays stale and replays the approve POST.
  const stale = await page.context().newPage();
  await page.goto(`/${token}`);
  await stale.goto(`/${token}`);
  const approve = (p: typeof page) => p.getByRole("button", { name: /^Approve/ });

  await approve(page).click();
  await expect(page.getByText("Quote approved — work will start soon")).toBeVisible();
  await expect(approve(page)).toHaveCount(0);
  const approved = await jobRow(job.id);
  expect(approved.status).toBe("approved");
  expect(approved.approved_total_cents).toBe(approved.quoted_total_cents);

  const replay = stale.waitForResponse((r) => r.request().method() === "POST");
  await approve(stale).click();
  await replay;

  const after = await jobRow(job.id);
  expect([after.status, after.approved_at, after.approved_total_cents]).toEqual([
    "approved",
    approved.approved_at,
    approved.approved_total_cents,
  ]);
  const events = must(
    await admin().from("job_events").select("actor_type").eq("job_id", job.id).eq("to_status", "approved"),
    "approved events",
  );
  expect(events).toEqual([{ actor_type: "customer" }]);

  await page.reload();
  await expect(page.getByText("Quote approved — work will start soon")).toBeVisible();
  await expect(approve(page)).toHaveCount(0);
});

/** Same checks as smoke.spec.ts, plus the rest of D-019. */
function expectSecurityHeaders(res: APIResponse) {
  const h = res.headers();
  expect(h["x-robots-tag"]).toContain("noindex");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["cache-control"]).toContain("no-store");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
}

const VOLATILE_HEADERS = new Set(["date", "connection", "keep-alive", "transfer-encoding", "content-length"]);

/**
 * D-032: identical apart from Next's echo of the request: the per-request CSP nonce and the requested path.
 * Also the random per-request render id (self.__next_r). In `next dev` only, the RSC payload carries debug rows
 * whose numbering varies per request, so dev compares the HTML without scripts; a production build compares it all.
 */
async function normalised(res: APIResponse, segment: string) {
  const headers = res.headers();
  const nonce = /'nonce-([^']+)'/.exec(headers["content-security-policy"] ?? "")?.[1];
  const isDev = (headers["content-security-policy"] ?? "").includes("'unsafe-eval'");
  const scrub = (s: string) => (nonce ? s.split(nonce).join("<NONCE>") : s).split(segment).join("<PATH>");
  let body = scrub(await res.text()).replace(/self\.__next_r="[^"]*"/g, 'self.__next_r=""');
  if (isDev) body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  return {
    body,
    headers: Object.fromEntries(Object.entries(headers).filter(([k]) => !VOLATILE_HEADERS.has(k)).map(([k, v]) => [k, scrub(v)])),
  };
}

/** null when equal, else a short excerpt around the first differing character. */
function firstDifference(a: string, b: string): string | null {
  if (a === b) return null;
  let i = 0;
  while (a[i] === b[i]) i++;
  return `at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 80), i + 80))} vs ${JSON.stringify(b.slice(Math.max(0, i - 80), i + 80))}`;
}
