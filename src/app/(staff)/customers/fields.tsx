import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CustomerListItem } from "@/lib/data/types";
import { formatPhone, formatPlate } from "@/lib/format";

export type Errors = Record<string, string>;
type Vehicle = CustomerListItem["vehicles"][number];

export const CUSTOMER_REQUIRED = { full_name: "Enter the customer's name.", phone: "Enter a phone number." };
export const VEHICLE_REQUIRED = { plate: "Enter the plate.", make: "Enter the make.", model: "Enter the model." };

/** Name, phone, email. `prefix` keeps ids unique when several forms share a page. */
export function CustomerFields({
  prefix,
  errors,
  customer,
}: {
  prefix: string;
  errors: Errors;
  customer?: Pick<CustomerListItem, "fullName" | "phone" | "email">;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${prefix}-full-name`} label="Full name" error={errors.full_name} className="sm:col-span-2">
        <Input name="full_name" autoComplete="off" maxLength={200} defaultValue={customer?.fullName} />
      </Field>
      <Field id={`${prefix}-phone`} label="Phone" hint="Mobile or landline, e.g. 088 123 4567" error={errors.phone}>
        <Input
          name="phone"
          type="tel"
          autoComplete="off"
          maxLength={30}
          defaultValue={customer ? formatPhone(customer.phone) : undefined}
        />
      </Field>
      <Field id={`${prefix}-email`} label="Email (optional)" error={errors.email}>
        <Input name="email" type="email" autoComplete="off" maxLength={200} defaultValue={customer?.email ?? undefined} />
      </Field>
    </div>
  );
}

/** Plate, make, model, year. */
export function VehicleFields({ prefix, errors, vehicle }: { prefix: string; errors: Errors; vehicle?: Vehicle }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem]">
      <Field id={`${prefix}-plate`} label="Plate" hint="e.g. CA 1234 AB" error={errors.plate}>
        <Input
          name="plate"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={20}
          defaultValue={vehicle ? formatPlate(vehicle.plate) : undefined}
        />
      </Field>
      <Field id={`${prefix}-make`} label="Make" error={errors.make}>
        <Input name="make" autoComplete="off" maxLength={100} defaultValue={vehicle?.make} />
      </Field>
      <Field id={`${prefix}-model`} label="Model" error={errors.model}>
        <Input name="model" autoComplete="off" maxLength={100} defaultValue={vehicle?.model} />
      </Field>
      <Field id={`${prefix}-year`} label="Year" hint="Optional" error={errors.year}>
        <Input name="year" inputMode="numeric" autoComplete="off" maxLength={4} defaultValue={vehicle?.year ?? undefined} />
      </Field>
    </div>
  );
}
