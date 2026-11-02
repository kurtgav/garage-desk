import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Db,
  admin,
  cleanup,
  createCustomerWithVehicle,
  createStaff,
  rand,
  randomPhone,
  randomPlate,
  signInAs,
} from "./helpers";

let ownerDb: Db, mechDb: Db;
let customerId: string;
const plateTyped = randomPlate(); // e.g. "QZK 4821", as typed by staff
const plateNormalised = plateTyped.replace(" ", "");
const nameToken = `Searchable${rand()}`;
const phoneDigits = randomPhone();
const phoneTyped = `${phoneDigits.slice(0, 4)} ${phoneDigits.slice(4, 7)}-${phoneDigits.slice(7)}`; // "0917 123-4567"

async function search(db: Db, query: string): Promise<string[]> {
  const { data, error } = await db.rpc("search_customers", { p_query: query });
  expect(error).toBeNull();
  return ((data ?? []) as { id: string }[]).map((c) => c.id);
}

beforeAll(async () => {
  const [owner, mechanic] = await Promise.all([createStaff("owner"), createStaff("mechanic")]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mechanic)]);
  const { customer } = await createCustomerWithVehicle(admin, {
    fullName: `Maria ${nameToken} Santos`,
    phone: phoneTyped,
    plate: plateTyped,
  });
  customerId = customer.id;
});

afterAll(cleanup);

describe("FR2: phone and plate are normalised on write (D-017)", () => {
  it(`plate "${plateTyped}" is stored as "${plateNormalised}"; phone stored as digits only`, async () => {
    const { data } = await admin.from("vehicles").select("plate").eq("customer_id", customerId).single();
    expect(data?.plate).toBe(plateNormalised);
    const { data: c } = await admin.from("customers").select("phone").eq("id", customerId).single();
    expect(c?.phone).toBe(phoneDigits);
  });

  it("plate is unique after normalisation", async () => {
    const { error } = await admin
      .from("vehicles")
      .insert({ customer_id: customerId, plate: plateNormalised.toLowerCase(), make: "Honda", model: "City", year: 2020 });
    expect(error).not.toBeNull();
  });
});

describe("FR2 AC: owner search matches plate, phone and name (partial, any case/spacing)", () => {
  it(`plate typed lowercase without space ("${plateNormalised.toLowerCase()}") finds the customer`, async () => {
    expect(await search(ownerDb, plateNormalised.toLowerCase())).toContain(customerId);
  });

  it("plate typed with a space or dash finds the customer", async () => {
    expect(await search(ownerDb, plateTyped.toLowerCase())).toContain(customerId);
    expect(await search(ownerDb, plateTyped.replace(" ", "-"))).toContain(customerId);
  });

  it("partial plate finds the customer", async () => {
    expect(await search(ownerDb, plateNormalised.slice(1, 5).toLowerCase())).toContain(customerId);
  });

  it("partial phone digits find the customer", async () => {
    expect(await search(ownerDb, phoneDigits.slice(3, 10))).toContain(customerId);
  });

  it("partial name in any case finds the customer", async () => {
    expect(await search(ownerDb, nameToken.slice(0, 14).toLowerCase())).toContain(customerId);
    expect(await search(ownerDb, nameToken.toUpperCase())).toContain(customerId);
  });

  it("an unrelated query does not return the customer", async () => {
    // Letters only: a query with ≥3 digits also does a phone substring match.
    expect(await search(ownerDb, "zz-no-such-customer-zz")).not.toContain(customerId);
  });

  it("FR1: a mechanic with no job for this customer gets no result", async () => {
    const { data } = await mechDb.rpc("search_customers", { p_query: nameToken });
    expect(((data ?? []) as { id: string }[]).map((c) => c.id)).not.toContain(customerId);
  });
});
