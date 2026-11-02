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
  quotedJobWithLink,
  randomIp,
  randomPhone,
  randomPlate,
  randomToken,
  readUsers,
  sha256Hex,
  tag,
} from "./support";

// Own client IP per worker: public rate limits are per IP (D-012); see customerContext in support.ts.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

/** Request-level checks: the HTML does not depend on the viewport, so they run once. */
const requestLevelOnly = (projectName: string) =>
  test.skip(projectName !== "desktop", "request-level check; the HTML does not depend on the viewport");

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
    phoneNote: `Internal phone approval note ${t}`,
    reworkNote: `Internal rework note ${t}`,
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
  // Quote v1, phone approval recorded by the owner (note + staff actor), work, ready, rework with a note.
  await ownerTransition(job.id, "quoted");
  await ownerTransition(job.id, "approved", secret.phoneNote, 1);
  await ownerTransition(job.id, "in_progress");
  await ownerTransition(job.id, "ready");
  await ownerTransition(job.id, "in_progress", secret.reworkNote);
  const token = await ownerCreateLink(job.id);

  const res = await request.get(`/${token}`);
  expect(res.status()).toBe(200);
  // React separates adjacent text nodes with <!-- --> ("Quote v<!-- -->1"); drop them so values match as rendered.
  const body = (await res.text()).replaceAll("<!-- -->", "");

  // Whitelisted values are there (so the absence checks below are not vacuous).
  const shown = ["Maria", job.ref, `Oil filter ${t}`, "Toyota", "Vios", "Quote v1", "Approved by phone (recorded by the garage)"];
  for (const value of shown) expect(body, value).toContain(value);

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
  // The phone's significant digits in any grouping ("088 123 4567", "+359 88 123 4567", "359881234567").
  expect(body, "phone leaked").not.toMatch(new RegExp(secret.phone.slice(1).split("").join("[\\s-]?")));
});

test("FR6 AC2: unknown, tampered, revoked tokens, job ref, job UUID and unknown paths all get the identical 404", async ({
  request,
}, testInfo) => {
  requestLevelOnly(testInfo.project.name);
  const t = tag();
  const { job, token } = await quotedJobWithLink({
    customerName: `Nora Probe${t}`,
    description: `404 probe ${t}`,
    mechanicId: readUsers().mechanicB.id,
  });

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
  // Customer pages are phone-first; the slice covers approving on desktop-sized staff runs too.
  test.skip(testInfo.project.name !== "mobile-375", "customer flow runs once, on the phone viewport");
  const t = tag();
  const { job, token } = await quotedJobWithLink({
    customerName: `Rosa Twice${t}`,
    description: `Approve twice ${t}`,
    mechanicId: readUsers().mechanicB.id,
  });

  // Two tabs on quote v1; the second one stays stale and replays the approve POST (same expected_version).
  const stale = await page.context().newPage();
  await page.goto(`/${token}`);
  await stale.goto(`/${token}`);
  const approve = (p: typeof page) => p.getByRole("button", { name: /^Approve/ });

  await approve(page).click();
  await expect(page.getByText("Quote approved — work will start soon")).toBeVisible();
  await expect(approve(page)).toHaveCount(0);
  const approved = await jobRow(job.id);
  expect([approved.status, approved.approved_quote_version]).toEqual(["approved", 1]);
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
    await admin().from("job_events").select("actor_type, channel, quote_version").eq("job_id", job.id).eq("to_status", "approved"),
    "approved events",
  );
  expect(events).toEqual([{ actor_type: "customer", channel: "link", quote_version: 1 }]);

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
// Vercel: x-vercel-id is "<edge>::<function region>::<random id>" and age a cache clock. Keep the tiers (which layer
// answered) and whether age is present; only the per-request id and the clock value are noise.
const NOISE: Record<string, (v: string) => string> = {
  "x-vercel-id": (v) => v.replace(/::[^:]+$/, "::<id>"),
  age: () => "<age>",
};

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
    headers: Object.fromEntries(
      Object.entries(headers)
        .filter(([k]) => !VOLATILE_HEADERS.has(k))
        .map(([k, v]) => [k, NOISE[k] ? NOISE[k](v) : scrub(v)]),
    ),
  };
}

/** null when equal, else a short excerpt around the first differing character. */
function firstDifference(a: string, b: string): string | null {
  if (a === b) return null;
  let i = 0;
  while (a[i] === b[i]) i++;
  return `at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 80), i + 80))} vs ${JSON.stringify(b.slice(Math.max(0, i - 80), i + 80))}`;
}
