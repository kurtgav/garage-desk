// D-090: /jobs?status=collected&period=month computes the Sofia month in TS (src/lib/period.ts). It must be
// exactly the month get_dashboard counts revenue in, or the KPI and the list it links to would disagree.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { garageMonthBounds } from "@/lib/period";
import { type Db, cleanup, createStaff, signInAs, unwrap } from "./helpers";

interface Revenue {
  jobs_count: number;
  month_start: string;
  month_end: string;
}

let ownerDb: Db;

beforeAll(async () => {
  ownerDb = await signInAs(await createStaff("owner"));
});

afterAll(cleanup);

async function revenue(pNow?: string): Promise<Revenue> {
  const res = await ownerDb.rpc("get_dashboard", pNow ? { p_now: pNow } : {});
  return (unwrap(res, "get_dashboard") as { revenue: Revenue }).revenue;
}

describe("Sofia month: TS helper vs get_dashboard", () => {
  it.each([
    "2031-11-15T10:00:00Z", // winter
    "2031-07-15T10:00:00Z", // summer
    "2031-03-30T10:00:00Z", // DST starts in March
    "2031-10-26T10:00:00Z", // DST ends in October
    "2031-10-31T21:59:59Z", // last second of October in Sofia
    "2031-10-31T22:00:00Z", // first second of November in Sofia
    "2031-12-31T22:30:00Z", // already January in Sofia
  ])("same bounds at %s", async (pNow) => {
    const r = await revenue(pNow);
    const { start, end } = garageMonthBounds(new Date(pNow));
    expect(new Date(r.month_start).toISOString()).toBe(start.toISOString());
    expect(new Date(r.month_end).toISOString()).toBe(end.toISOString());
  });

  it("the collected-this-month filter counts what the revenue KPI counts (current data)", async () => {
    const r = await revenue();
    const { start, end } = garageMonthBounds();
    // Same filter as listJobs({ status: "collected", collectedFrom, collectedTo }), through the owner's RLS.
    const { count, error } = await ownerDb
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "collected")
      .gte("collected_at", start.toISOString())
      .lt("collected_at", end.toISOString());
    expect(error).toBeNull();
    expect(count).toBe(r.jobs_count);
  });
});
