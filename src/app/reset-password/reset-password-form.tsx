"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Circle, CircleCheck } from "lucide-react";
import { submitKeepingValues } from "@/components/form-submit";
import { AuthNotice } from "@/components/landing/auth-notice";
import { lpControl, lpSubmit } from "@/components/landing/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import type { ActionResult } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { setNewPassword } from "./actions";
import { meetsPasswordRule, PASSWORD_MAX, PASSWORD_RULES } from "./password-rules";

export function ResetPasswordForm() {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(setNewPassword, null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // After a blocked submit, the rules not met yet turn red.
  const [checked, setChecked] = useState(false);

  const tooLong = password.length > PASSWORD_MAX;
  const passwordBad = checked && !meetsPasswordRule(password);
  // Flag a mismatch as soon as the confirmation stops being a prefix of the password, not on every keystroke.
  const confirmError =
    checked && confirm === ""
      ? "Repeat the new password."
      : (confirm !== "" && !password.startsWith(confirm)) || (checked && confirm !== password)
        ? "The passwords don't match."
        : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const passwordOk = meetsPasswordRule(password);
    if (passwordOk && confirm === password) return submitKeepingValues(dispatch)(event);
    event.preventDefault();
    setChecked(true);
    (event.currentTarget.elements.namedItem(passwordOk ? "confirm" : "password") as HTMLElement | null)?.focus();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Success redirects, so only failures show here. */}
      <AuthNotice result={state}>{state && !state.ok && <Alert tone="danger">{state.error}</Alert>}</AuthNotice>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={tooLong ? "password-rules password-error" : "password-rules"}
            aria-invalid={passwordBad || tooLong || undefined}
            className={lpControl}
          />
          <ul id="password-rules" className="grid gap-x-5 gap-y-1.5 pt-1 text-[15px] sm:grid-cols-[auto_1fr]">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password);
              return (
                <li
                  key={rule.label}
                  className={cn("flex items-center gap-2", met ? "text-lp-ink" : checked ? "text-danger" : "text-lp-body")}
                >
                  {met ? (
                    <CircleCheck aria-hidden className="size-4 shrink-0 text-success" strokeWidth={2} />
                  ) : (
                    <Circle aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                  )}
                  {rule.label}
                  {met && <span className="sr-only">(done)</span>}
                </li>
              );
            })}
          </ul>
          {tooLong && (
            <p id="password-error" className="text-sm font-medium text-danger">
              Use at most {PASSWORD_MAX} characters.
            </p>
          )}
        </div>
        <Field id="confirm" label="Confirm new password" error={confirmError}>
          <PasswordInput
            name="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            toggleLabel="Show confirmation"
            className={lpControl}
          />
        </Field>
        <Button type="submit" loading={pending} className={lpSubmit}>
          Save new password
        </Button>
      </div>
    </form>
  );
}
