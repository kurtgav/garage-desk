"use client";

import { useActionState } from "react";
import { AuthNotice } from "@/components/landing/auth-notice";
import { lpControl, lpSubmit } from "@/components/landing/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { verifyCode, type VerifyState } from "../actions";

export function VerifyForm() {
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(verifyCode, null);

  return (
    <form action={formAction}>
      <AuthNotice result={state}>{state && <Alert tone="danger">{state.error}</Alert>}</AuthNotice>
      <div className="grid gap-5">
        <Field id="code" label="6-digit code">
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            title="The 6 digits from your authenticator app"
            required
            className={`${lpControl} tracking-[0.3em] tabular-nums`}
          />
        </Field>
        <Button type="submit" loading={pending} className={lpSubmit}>
          Verify
        </Button>
      </div>
    </form>
  );
}
