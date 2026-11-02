"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthNotice } from "@/components/landing/auth-notice";
import { lpControl, lpSubmit } from "@/components/landing/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn, type LoginState } from "./actions";

/** `notice`: where the visitor came from, e.g. "Sign out everywhere" (D-107); a failed sign-in replaces it. */
export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, null);
  const alert = state ? <Alert tone="danger">{state.error}</Alert> : notice && <Alert tone="success">{notice}</Alert>;

  return (
    <form action={formAction}>
      <AuthNotice result={state}>{alert}</AuthNotice>
      <div className="grid gap-5">
        <Field id="email" label="Email">
          <Input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className={lpControl} />
        </Field>
        <div className="grid gap-2">
          {/* Label left, its one escape hatch right. */}
          <div className="flex items-baseline justify-between gap-4">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="-mx-1 -my-1 rounded-md px-1 py-1 text-sm font-medium text-lp-blue underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" required className={lpControl} />
        </div>
        <Button type="submit" loading={pending} className={lpSubmit}>
          Sign in
        </Button>
      </div>
    </form>
  );
}
