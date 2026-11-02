import { describe, expect, it } from "vitest";
import { jobsHref, parseJobFilters } from "@/app/(staff)/jobs/filters";

const ID = "3f2c8a9e-1b4d-4c6e-9a7b-0d1e2f3a4b5c";

describe("parseJobFilters (/jobs URL → filters; invalid input is dropped)", () => {
  it("no params: the Open tab", () => {
    expect(parseJobFilters({}, true)).toEqual({ status: undefined, mechanicId: undefined, thisMonth: undefined });
  });

  it("reads a valid status, mechanic and period for the owner", () => {
    expect(parseJobFilters({ status: "collected", mechanic: ID.toUpperCase(), period: "month" }, true)).toEqual({
      status: "collected",
      mechanicId: ID,
      thisMonth: true,
    });
  });

  it("drops an unknown status, a malformed mechanic id and repeated params", () => {
    expect(parseJobFilters({ status: "done", mechanic: "1; drop table" }, true)).toEqual({
      status: undefined,
      mechanicId: undefined,
      thisMonth: undefined,
    });
    expect(parseJobFilters({ status: ["ready", "new"], mechanic: [ID, ID] }, true).status).toBeUndefined();
  });

  it("ignores the mechanic filter for mechanics (RLS already limits them to their own jobs)", () => {
    expect(parseJobFilters({ mechanic: ID }, false).mechanicId).toBeUndefined();
  });

  it("period=month only goes with status=collected", () => {
    expect(parseJobFilters({ status: "ready", period: "month" }, true).thisMonth).toBeUndefined();
    expect(parseJobFilters({ period: "month" }, true).thisMonth).toBeUndefined();
    expect(parseJobFilters({ status: "collected", period: "year" }, true).thisMonth).toBeUndefined();
  });
});

describe("jobsHref (filters → /jobs URL)", () => {
  it("builds each dashboard link", () => {
    expect(jobsHref({})).toBe("/jobs");
    expect(jobsHref({ status: "quoted" })).toBe("/jobs?status=quoted");
    expect(jobsHref({ status: "collected", thisMonth: true })).toBe("/jobs?status=collected&period=month");
    expect(jobsHref({ mechanicId: ID })).toBe(`/jobs?mechanic=${ID}`);
    expect(jobsHref({ status: "in_progress", mechanicId: ID })).toBe(`/jobs?status=in_progress&mechanic=${ID}`);
  });

  it("never carries a period the page would drop", () => {
    expect(jobsHref({ status: "ready", thisMonth: true })).toBe("/jobs?status=ready");
  });

  it("round-trips through parseJobFilters", () => {
    const f = { status: "collected", mechanicId: ID, thisMonth: true } as const;
    const params = Object.fromEntries(new URL(jobsHref(f), "http://x").searchParams);
    expect(parseJobFilters(params, true)).toEqual(f);
  });
});
