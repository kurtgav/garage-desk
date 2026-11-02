import { describe, expect, it } from "vitest";
import { garageMonthBounds } from "@/lib/period";

const bounds = (iso: string) => {
  const { start, end } = garageMonthBounds(new Date(iso));
  return [start.toISOString(), end.toISOString()];
};

describe("garageMonthBounds (Europe/Sofia month, end exclusive, same as get_dashboard)", () => {
  it("winter month: UTC+2 at both ends", () => {
    expect(bounds("2026-11-03T10:00:00Z")).toEqual(["2026-10-31T22:00:00.000Z", "2026-11-30T22:00:00.000Z"]);
  });

  it("summer month: UTC+3 at both ends", () => {
    expect(bounds("2026-07-15T12:00:00Z")).toEqual(["2026-06-30T21:00:00.000Z", "2026-07-31T21:00:00.000Z"]);
  });

  it("March: starts in winter time, ends in summer time (DST begins 29 Mar 2026)", () => {
    expect(bounds("2026-03-29T12:00:00Z")).toEqual(["2026-02-28T22:00:00.000Z", "2026-03-31T21:00:00.000Z"]);
  });

  it("October: starts in summer time, ends in winter time (DST ends 25 Oct 2026)", () => {
    expect(bounds("2026-10-25T12:00:00Z")).toEqual(["2026-09-30T21:00:00.000Z", "2026-10-31T22:00:00.000Z"]);
  });

  it("uses the garage's clock at the month boundary, not UTC", () => {
    // 23:59:59 on 31 Oct in Sofia is still October; one second later is November.
    expect(bounds("2026-10-31T21:59:59Z")[0]).toBe("2026-09-30T21:00:00.000Z");
    expect(bounds("2026-10-31T22:00:00Z")[0]).toBe("2026-10-31T22:00:00.000Z");
  });

  it("crosses the year: 1 Jan 00:00 Sofia is still 31 Dec in UTC", () => {
    expect(bounds("2026-12-31T22:00:00Z")).toEqual(["2026-12-31T22:00:00.000Z", "2027-01-31T22:00:00.000Z"]);
    expect(bounds("2026-12-31T21:59:59Z")).toEqual(["2026-11-30T22:00:00.000Z", "2026-12-31T22:00:00.000Z"]);
  });

  it("leap February", () => {
    expect(bounds("2028-02-29T12:00:00Z")).toEqual(["2028-01-31T22:00:00.000Z", "2028-02-29T22:00:00.000Z"]);
  });
});
