"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { submitRequired } from "@/components/form-submit";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ActionResult } from "@/lib/data/types";
import { createCustomer } from "../actions";
import { CUSTOMER_REQUIRED, CustomerFields, VEHICLE_REQUIRED, VehicleFields, type Errors } from "../fields";

/** Customer and their first vehicle in one go; the action redirects to the new customer. */
export function NewCustomerForm() {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(createCustomer, null);
  const [errors, setErrors] = useState<Errors>({});

  return (
    <form
      onSubmit={submitRequired(dispatch, { ...CUSTOMER_REQUIRED, ...VEHICLE_REQUIRED }, setErrors)}
      noValidate
      className="grid gap-6"
    >
      {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}
      <fieldset className="grid gap-4">
        <legend className="mb-3 text-base font-semibold text-ink">Customer</legend>
        <CustomerFields prefix="new" errors={errors} />
      </fieldset>
      <div className="border-t border-line pt-6">
        <fieldset className="grid gap-4">
          <legend className="mb-3 text-base font-semibold text-ink">First vehicle</legend>
          <VehicleFields prefix="new" errors={errors} />
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          Create customer
        </Button>
        <Link href="/customers" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
