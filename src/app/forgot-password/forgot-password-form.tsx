"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitKeepingValues } from "@/components/form-submit";
import { AuthNotice } from "@/components/landing/auth-notice";
import { lpControl, lpSubmit } from "@/components/landing/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/data/types";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm({ expired }: { expired: boolean }) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(requestPasswordReset, null);

  // AuthNotice remounts the alert on every result, so each one is announced again.
  let notice: React.ReactNode = null;
  if (state?.ok) {
    notice = (
      // Same answer for every address: the page never tells whether an account exists.
      <Alert tone="success" title="Check your email">
        <p>
          If an account exists for that address, we&apos;ve sent a link to reset the password. It works once and expires
          after an hour.
        </p>
        {/* D-079: until custom SMTP is set up, production reset emails do not reach staff. */}
        <p className="mt-2 text-muted">
          No email after a few minutes? Ask the garage owner to reset your password from the Staff page.
        </p>
      </Alert>
    );
  } else if (state) {
    notice = <Alert tone="danger">{state.error}</Alert>;
  } else if (expired) {
    notice = <Alert tone="warning">That link has expired or was already used. Request a new one.</Alert>;
  }

  return (
    <form onSubmit={submitKeepingValues(dispatch)}>
      <AuthNotice result={state}>{notice}</AuthNotice>
      <div className="grid gap-5">
        <Field id="email" label="Email">
          <Input name="email" type="email" autoComplete="email" required className={lpControl} />
        </Field>
        <Button type="submit" loading={pending} className={lpSubmit}>
          {state?.ok ? "Send the link again" : "Send reset link"}
        </Button>
        <Link
          href="/login"
          className="-my-2 inline-flex min-h-11 items-center justify-self-center rounded-md px-2 text-[15px] font-medium text-lp-blue underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
