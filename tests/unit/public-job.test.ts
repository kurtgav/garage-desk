import { describe, expect, it } from "vitest";
import { toPublicJob } from "@/lib/public-job";
import { expectWhitelistedKeys } from "../support/public-job";

const SECRET_UUID = "3f2b8c1e-9a7d-4e6f-8b5a-1c2d3e4f5a6b";

// What a buggy or widened DB function could return: whitelisted keys plus internals at every level.
const rawWithExtras = {
  garage: { name: "Kurt's Garage", address: "1 Rizal St", phone: "0281234567", id: SECRET_UUID, owner_email: "owner@garage.test" },
  job: { ref: "GD-0042", status: "quoted", quote_version: 2, id: SECRET_UUID, notes: "internal note", assigned_mechanic_id: SECRET_UUID },
  vehicle: { make: "Toyota", model: "Vios", plate: "ABC1234", id: SECRET_UUID, customer_id: SECRET_UUID, year: 2019 },
  customer: { first_name: "Juan", full_name: "Juan Dela Cruz", phone: "09171234567", email: "juan@mail.test", id: SECRET_UUID },
  lines: [
    { description: "Labour", quantity: "1.25", unit_price_cents: 4550, line_total_cents: 5687.5, id: SECRET_UUID, job_id: SECRET_UUID, kind: "labour" },
    { description: "Brake pads", quantity: "2.00", unit_price_cents: 125050, line_total_cents: 250100, created_by: SECRET_UUID },
  ],
  totals: { subtotal_cents: 370100, vat_cents: 44412, total_cents: 414512, vat_bps: 1200, job_id: SECRET_UUID },
  timeline: [
    { status: "new", at: "2026-11-02T01:00:00Z", channel: null, note: "internal note", actor_id: SECRET_UUID, actor_name: "Mechanic Ben" },
    { status: "approved", at: "2026-11-02T02:00:00Z", channel: "phone", actor_type: "staff", quote_version: 1, total_cents: 1 },
  ],
  staff: [{ full_name: "Mechanic Ben" }],
  token_hash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
};

describe("FR6 AC3: toPublicJob keeps only whitelisted fields", () => {
  it("key sets equal PUBLIC_JOB_KEYS at every level", () => {
    expectWhitelistedKeys(toPublicJob(rawWithExtras));
  });

  it("injected phone, email, ids, notes and staff names never appear", () => {
    const json = JSON.stringify(toPublicJob(rawWithExtras));
    for (const leak of [SECRET_UUID, "09171234567", "juan@mail.test", "owner@garage.test", "internal note", "Mechanic Ben", "Dela Cruz", rawWithExtras.token_hash]) {
      expect(json).not.toContain(leak);
    }
  });

  it("keeps the whitelisted values unchanged", () => {
    expect(toPublicJob(rawWithExtras)).toStrictEqual({
      garage: { name: "Kurt's Garage", address: "1 Rizal St", phone: "0281234567" },
      job: { ref: "GD-0042", status: "quoted", quote_version: 2 },
      vehicle: { make: "Toyota", model: "Vios", plate: "ABC1234" },
      customer: { first_name: "Juan" },
      lines: [
        { description: "Labour", quantity: "1.25", unit_price_cents: 4550, line_total_cents: 5687.5 },
        { description: "Brake pads", quantity: "2.00", unit_price_cents: 125050, line_total_cents: 250100 },
      ],
      totals: { subtotal_cents: 370100, vat_cents: 44412, total_cents: 414512, vat_bps: 1200 },
      timeline: [
        { status: "new", at: "2026-11-02T01:00:00Z", channel: null },
        { status: "approved", at: "2026-11-02T02:00:00Z", channel: "phone" },
      ],
    });
  });

  it("before the first quote there are no lines and totals are null", () => {
    const dto = toPublicJob({ ...rawWithExtras, job: { ref: "GD-0042", status: "new", quote_version: null }, lines: [], totals: null });
    expectWhitelistedKeys(dto);
    expect(dto.lines).toEqual([]);
    expect(dto.totals).toBeNull();
  });

  it("non-array lines/timeline become empty arrays", () => {
    const dto = toPublicJob({ ...rawWithExtras, lines: { 0: "x" }, timeline: "nope" });
    expect(dto.lines).toEqual([]);
    expect(dto.timeline).toEqual([]);
  });
});
