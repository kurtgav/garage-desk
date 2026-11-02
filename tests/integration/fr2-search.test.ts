import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Db,
  type StaffUser,
  admin,
  cleanup,
  createCustomerWithVehicle,
  createJob,
  createStaff,
  rand,
  randomPhone,
  randomPlate,
  signInAs,
} from "./helpers";

let ownerDb: Db, mechDb: Db;
let mechanic: StaffUser;
let customerId: string;
const plateTyped = randomPlate(); // e.g. "CA 4521 KM", as typed by staff
const plateNormalised = plateTyped.replaceAll(" ", "");
const nameToken = `Searchable${rand()}`;
const phoneNational = randomPhone(); // "0887123456"
const phoneTyped = `${phoneNational.slice(0, 4)} ${phoneNational.slice(4, 7)}-${phoneNational.slice(7)}`; // "0887 123-456"
const phoneStored = `359${phoneNational.slice(1)}`; // D-055: national 0… → 359…

async function search(db: Db, query: string): Promise<string[]> {
  const { data, error } = await db.rpc("search_customers", { p_query: query });
  expect(error).toBeNull();
  return ((data ?? []) as { id: string }[]).map((c) => c.id);
}

/** create_customer as the owner with valid defaults, overridden per test. */
function createCustomerRaw(overrides: Record<string, string>) {
  return ownerDb.rpc("create_customer", {
    p_full_name: "Limit Tester",
    p_phone: randomPhone(),
    p_plate: randomPlate(),
    p_make: "Lada",
    p_model: "Niva",
    ...overrides,
  });
}

/** create_customer RPC as the given user; returns the new id or the error. */
function createCustomer(db: Db, plate = randomPlate(), phone = randomPhone()) {
  return db.rpc("create_customer", {
    p_full_name: `Ivan QA${rand()} Georgiev`,
    p_phone: phone,
    p_plate: plate,
    p_make: "Opel",
    p_model: "Astra",
  });
}

beforeAll(async () => {
  let owner: StaffUser;
  [owner, mechanic] = await Promise.all([createStaff("owner"), createStaff("mechanic")]);
  [ownerDb, mechDb] = await Promise.all([signInAs(owner), signInAs(mechanic)]);
  const { customer } = await createCustomerWithVehicle(admin, {
    fullName: `Maria ${nameToken} Dimitrova`,
    phone: phoneTyped,
    plate: plateTyped,
  });
  customerId = customer.id;
});

afterAll(cleanup);

describe("FR2: phone and plate are normalised on write (D-017, D-055)", () => {
  it(`plate "${plateTyped}" is stored as "${plateNormalised}"; national phone stored as 359…`, async () => {
    const { data } = await admin.from("vehicles").select("plate").eq("customer_id", customerId).single();
    expect(data?.plate).toBe(plateNormalised);
    const { data: c } = await admin.from("customers").select("phone").eq("id", customerId).single();
    expect(c?.phone).toBe(phoneStored);
  });

  it("an international +359 number is stored as the same digits", async () => {
    const { data: id, error } = await createCustomer(ownerDb, randomPlate(), `+359 ${phoneNational.slice(1)}`);
    expect(error).toBeNull();
    try {
      const { data } = await admin.from("customers").select("phone").eq("id", id).single();
      expect(data?.phone).toBe(phoneStored);
    } finally {
      await admin.from("customers").delete().eq("id", id);
    }
  });

  it("plate is unique after normalisation", async () => {
    const { error } = await admin
      .from("vehicles")
      .insert({ customer_id: customerId, plate: plateNormalised.toLowerCase(), make: "VW", model: "Golf", year: 2020 });
    expect(error?.code).toBe("23505");
  });
});

describe("FR2 AC: search matches plate, phone and name (partial, any case/spacing)", () => {
  it(`plate typed lowercase without spaces ("${plateNormalised.toLowerCase()}") finds the customer`, async () => {
    expect(await search(ownerDb, plateNormalised.toLowerCase())).toContain(customerId);
  });

  it("plate typed with spaces or dashes finds the customer", async () => {
    expect(await search(ownerDb, plateTyped.toLowerCase())).toContain(customerId);
    expect(await search(ownerDb, plateTyped.replaceAll(" ", "-"))).toContain(customerId);
  });

  it("partial plate finds the customer", async () => {
    expect(await search(ownerDb, plateNormalised.slice(1, 5).toLowerCase())).toContain(customerId);
  });

  it("phone typed in national format (leading 0, spaces) finds the customer", async () => {
    expect(await search(ownerDb, phoneTyped)).toContain(customerId);
    expect(await search(ownerDb, phoneNational.slice(0, 7))).toContain(customerId);
  });

  it("phone typed in international format and partial digits find the customer", async () => {
    expect(await search(ownerDb, `+359 ${phoneNational.slice(1, 6)}`)).toContain(customerId);
    expect(await search(ownerDb, phoneNational.slice(3, 9))).toContain(customerId);
  });

  it("partial name in any case finds the customer", async () => {
    expect(await search(ownerDb, nameToken.slice(0, 14).toLowerCase())).toContain(customerId);
    expect(await search(ownerDb, nameToken.toUpperCase())).toContain(customerId);
  });

  it("an unrelated query does not return the customer", async () => {
    // Letters only: a query with ≥3 digits also does a phone substring match.
    expect(await search(ownerDb, "zz-no-such-customer-zz")).not.toContain(customerId);
  });

  it("D-054: a mechanic searches the whole customer directory", async () => {
    expect(await search(mechDb, nameToken)).toContain(customerId);
    expect(await search(mechDb, plateNormalised)).toContain(customerId);
  });
});

describe("FR2 / D-054: create_customer and owner-only delete", () => {
  it("creates customer + first vehicle atomically: a duplicate plate leaves no customer behind", async () => {
    const before = (await admin.from("customers").select("id", { count: "exact", head: true })).count;
    const { data, error } = await createCustomer(mechDb, plateTyped.toLowerCase());
    expect(data).toBeNull();
    expect(error?.code).toBe("23505");
    expect((await admin.from("customers").select("id", { count: "exact", head: true })).count).toBe(before);
  });

  it("owner deletes a customer without jobs; their vehicles go with them", async () => {
    const { data: id, error } = await createCustomer(mechDb);
    expect(error).toBeNull();
    expect((await admin.from("vehicles").select("id").eq("customer_id", id)).data).toHaveLength(1);

    const del = await ownerDb.from("customers").delete().eq("id", id).select("id");
    expect(del.error).toBeNull();
    expect(del.data).toEqual([{ id }]);
    expect((await admin.from("vehicles").select("id").eq("customer_id", id)).data).toHaveLength(0);
  });

  it("a customer with jobs cannot be deleted (23503), by anyone", async () => {
    const { customer, vehicle } = await createCustomerWithVehicle(admin);
    await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId: mechanic.id });

    const del = await ownerDb.from("customers").delete().eq("id", customer.id).select("id");
    expect(del.error?.code).toBe("23503");
    expect((await admin.from("customers").select("id").eq("id", customer.id)).data).toHaveLength(1);
    expect((await admin.from("vehicles").select("id").eq("id", vehicle.id)).data).toHaveLength(1);
  });

  it("a mechanic's delete affects no rows", async () => {
    const { data: id } = await createCustomer(ownerDb);
    try {
      const del = await mechDb.from("customers").delete().eq("id", id).select("id");
      expect(del.data ?? []).toHaveLength(0);
      expect((await admin.from("customers").select("id").eq("id", id)).data).toHaveLength(1);
    } finally {
      await admin.from("customers").delete().eq("id", id);
    }
  });
});

describe("D-070: length limits match the app's validation (23514 beyond them)", () => {
  const long = (n: number) => "x".repeat(n);
  it.each([
    ["customer name > 200", () => createCustomerRaw({ p_full_name: long(201) })],
    ["phone > 15 digits", () => createCustomerRaw({ p_phone: "1".repeat(16) })],
    ["phone < 6 digits", () => createCustomerRaw({ p_phone: "12345" })],
    ["email > 200", () => createCustomerRaw({ p_email: `${long(195)}@x.test` })],
    ["plate > 10", () => createCustomerRaw({ p_plate: "CA 1234 ABCDE" })],
    ["make > 60", () => createCustomerRaw({ p_make: long(61) })],
    ["model > 60", () => createCustomerRaw({ p_model: long(61) })],
  ])("%s", async (_what, run) => {
    const { data, error } = await run();
    expect(data).toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("job description > 2000 and line description > 500 are refused", async () => {
    const { vehicle } = await createCustomerWithVehicle(admin);
    const job = await ownerDb
      .from("jobs")
      .insert({ vehicle_id: vehicle.id, assigned_mechanic_id: mechanic.id, description: long(2001) })
      .select();
    expect(job.error?.code).toBe("23514");
    const ok = await createJob(ownerDb, { vehicleId: vehicle.id, mechanicId: mechanic.id, description: long(2000) });
    const line = await ownerDb
      .from("job_line_items")
      .insert({ job_id: ok.id, kind: "part", description: long(501), quantity: 1, unit_price_cents: 100 })
      .select();
    expect(line.error?.code).toBe("23514");
  });
});
