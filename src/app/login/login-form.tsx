"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, null);

  return (
    <form action={formAction} className="grid gap-4">
      {/* Unmounted while pending so a repeated failure is announced again. */}
      {state && !pending && <Alert tone="danger">{state.error}</Alert>}
      <Field id="email" label="Email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
      </Field>
      <Field id="password" label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Sign in
      </Button>
    </form>
  );
}
