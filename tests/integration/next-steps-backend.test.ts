import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalisePlate } from "@/lib/format";
import { type Db, admin, cleanup, createCustomerWithVehicle, createStaff, signInAs } from "./helpers";

// NEXT-STEPS #8 (D-099): Cyrillic look-alike letters in plates, in the trigger and in search, identical to
// normalisePlate(). #18 (D-101): settings text lengths in the database.

let ownerDb: Db;
const digits = () => String(randomInt(10_000)).padStart(4, "0");

beforeAll(async () => {
  ownerDb = await signInAs(await createStaff("owner", "Plates Owner"));
});

afterAll(cleanup);

describe("plates: Cyrillic look-alikes map to Latin (D-099)", () => {
  it.each(["АВЕКМН", "ОРСТУХ", "авекмн", "орстух"])(
    "the trigger stores %s… exactly as normalisePlate() does (all 24 letters across the cases)",
    async (letters) => {
      const typed = `${letters} ${digits()}`;
      const { vehicle } = await createCustomerWithVehicle(ownerDb, { plate: typed });
      expect(vehicle.plate).toBe(normalisePlate(typed));
      expect(vehicle.plate).toMatch(/^[A-Z0-9]+$/);
    },
  );

  it("a Cyrillic-typed plate is a duplicate of the same Latin plate (unique index)", async () => {
    const d = digits();
    const { customer } = await createCustomerWithVehicle(ownerDb, { plate: `CA ${d} KM` });
    const { error } = await ownerDb.from("vehicles").insert({ customer_id: customer.id, plate: `СА ${d} КМ`, make: "Lada", model: "Niva" });
    expect(error?.code).toBe("23505");
  });

  it("search finds a Latin plate from a Cyrillic query, and the other way round", async () => {
    const d = digits();
    const latin = await createCustomerWithVehicle(ownerDb, { plate: `PB ${d} TX` });
    const cyrillic = await createCustomerWithVehicle(ownerDb, { plate: `ВН ${d} ОС` });
    const ids = async (q: string) =>
      ((await ownerDb.rpc("search_customers", { p_query: q })).data ?? []).map((c: { id: string }) => c.id);

    expect(await ids(`рв ${d}`)).toContain(latin.customer.id);
    expect(await ids(`BH${d}OC`)).toContain(cyrillic.customer.id);
    expect(await ids(`вн ${d} ос`)).toContain(cyrillic.customer.id);
  });
});

describe("settings text lengths in the database (D-101)", () => {
  it.each([
    ["garage_name", 100],
    ["garage_address", 200],
    ["garage_phone", 30],
  ])("%s longer than %i characters is refused (23514), even past the server action", async (column, max) => {
    const before = (await admin.from("settings").select(column).single()).data;
    const { error } = await ownerDb.from("settings").update({ [column]: "x".repeat(max + 1) }).not("id", "is", null);
    expect(error?.code).toBe("23514");
    expect((await admin.from("settings").select(column).single()).data).toEqual(before);
  });
});
