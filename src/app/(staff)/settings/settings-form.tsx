"use client";

import { useActionState, useState } from "react";
import { submitRequired } from "@/components/form-submit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult, GarageSettings } from "@/lib/data/types";
import { bpsToPercentString, centsToInput } from "@/lib/money";
import { saveSettings } from "./actions";

const REQUIRED = {
  hourly_rate: "Enter the hourly rate.",
  vat_percent: "Enter the VAT rate.",
  garage_name: "Enter the garage name.",
  garage_address: "Enter the address.",
  garage_phone: "Enter the phone number.",
};


export function SettingsForm({ settings }: { settings: GarageSettings }) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(saveSettings, null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form onSubmit={submitRequired(dispatch, REQUIRED, setErrors)} noValidate className="grid gap-6">
      <fieldset className="grid items-start gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold text-ink">Prices</legend>
        <Field
          id="settings-hourly-rate"
          label="Hourly rate (€, excl. VAT)"
          hint="Used for labour lines added from now on. Lines already on a job keep their price."
          error={errors.hourly_rate}
        >
          <Input
            name="hourly_rate"
            inputMode="decimal"
            autoComplete="off"
            maxLength={20}
            defaultValue={centsToInput(settings.hourlyRateCents)}
          />
        </Field>
        <Field
          id="settings-vat"
          label="VAT (%)"
          hint="Used for jobs created from now on. Existing jobs keep their VAT rate."
          error={errors.vat_percent}
        >
          <Input
            name="vat_percent"
            inputMode="decimal"
            autoComplete="off"
            maxLength={10}
            defaultValue={bpsToPercentString(settings.vatBps)}
          />
        </Field>
      </fieldset>
      <div className="border-t border-rule pt-6">
        <fieldset className="grid gap-4">
          <legend className="mb-3 text-base font-semibold text-ink">Garage details</legend>
          <p className="text-sm text-faint">Shown to customers on their quote page.</p>
          <Field id="settings-name" label="Garage name" error={errors.garage_name}>
            <Input name="garage_name" autoComplete="organization" maxLength={100} defaultValue={settings.garageName} />
          </Field>
          <Field id="settings-address" label="Address" error={errors.garage_address}>
            <Input name="garage_address" autoComplete="street-address" maxLength={200} defaultValue={settings.garageAddress} />
          </Field>
          <Field id="settings-phone" label="Phone" error={errors.garage_phone}>
            <Input name="garage_phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={settings.garagePhone} />
          </Field>
        </fieldset>
      </div>
      {state && !pending && (state.ok ? <Alert tone="success">Settings saved.</Alert> : <Alert tone="danger">{state.error}</Alert>)}
      <div>
        <Button type="submit" loading={pending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
