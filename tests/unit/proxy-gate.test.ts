import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// D-109: only a real server action (POST + next-action) skips the customer-link gate; a GET carrying the
// header goes through the same rate limit and lookup as any other request for "/{token}".
const mocks = vi.hoisted(() => ({ isRateLimited: vi.fn(), getPublicJob: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("@/lib/public-job", () => ({ getPublicJob: mocks.getPublicJob }));

const { proxy } = await import("@/proxy");
const TOKEN = "A".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRateLimited.mockResolvedValue(false);
  mocks.getPublicJob.mockResolvedValue(null);
});

const request = (method: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://garage.example/${TOKEN}`, { method, headers });

describe("proxy customer-link gate", () => {
  it("a plain GET is rate limited and looked up", async () => {
    await proxy(request("GET"));
    expect(mocks.isRateLimited).toHaveBeenCalledWith("publicView");
    expect(mocks.getPublicJob).toHaveBeenCalledWith(TOKEN);
  });

  it("a GET with a next-action header is gated the same way", async () => {
    await proxy(request("GET", { "next-action": "x" }));
    expect(mocks.isRateLimited).toHaveBeenCalledWith("publicView");
    expect(mocks.getPublicJob).toHaveBeenCalledWith(TOKEN);
  });

  it("a POST server action is left to the action, which checks the token itself", async () => {
    await proxy(request("POST", { "next-action": "x" }));
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.getPublicJob).not.toHaveBeenCalled();
  });

  it("/login/verify is a public path: served, not rewritten to the 404", async () => {
    const res = await proxy(new NextRequest("https://garage.example/login/verify"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(mocks.getPublicJob).not.toHaveBeenCalled();
  });

  it("an unknown non-token path is rewritten to the 404", async () => {
    const res = await proxy(new NextRequest("https://garage.example/wp-login.php"));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/_/not-found");
  });
});
