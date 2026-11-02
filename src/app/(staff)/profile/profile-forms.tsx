"use client";

import { ImageUp, LogOut } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { submitRequired } from "@/components/form-submit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/data/types";
import { changePassword, removeAvatar, signOutEverywhere, updateProfile, uploadAvatar } from "./actions";
import { PASSWORD_HINT, PASSWORD_REQUIRED, PHOTO_TYPES, passwordErrors, photoError } from "./profile-checks";

const ABOUT_MAX = 500;

/** Choose → preview → Save, or Remove. The preview is local until the server accepts the upload. */
export function PhotoForm({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [uploadState, upload, uploading] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await uploadAvatar(prev, formData);
    // React resets the form (and so the file input) after the action either way: drop the preview with it.
    setPreview(null);
    return result;
  }, null);
  const [removeState, remove, removing] = useActionState<ActionResult | null, FormData>(() => removeAvatar(), null);
  // Which result to show: the latest action's, cleared by a new choice.
  const [last, setLast] = useState<"upload" | "remove" | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = photoError(file);
    setClientError(error);
    setLast(null);
    if (error) {
      e.target.value = "";
      setPreview(null);
    } else setPreview(URL.createObjectURL(file));
  }

  function cancel() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
  }

  const busy = uploading || removing;
  const result = last === "upload" ? !uploading && uploadState : last === "remove" ? !removing && removeState : null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
      <Avatar name={name} src={preview ?? avatarUrl} className="size-20 text-xl" />
      <div className="grid min-w-0 flex-1 basis-60 gap-3">
        <div className="flex flex-wrap gap-2">
          <form action={upload} onSubmit={() => setLast("upload")} className="contents">
            <input
              ref={inputRef}
              type="file"
              name="avatar"
              accept={PHOTO_TYPES.join(",")}
              hidden
              onChange={choose}
            />
            {preview ? (
              <>
                <Button type="submit" loading={uploading}>
                  Save photo
                </Button>
                <Button type="button" variant="ghost" onClick={cancel} disabled={uploading}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
                <ImageUp aria-hidden />
                {avatarUrl ? "Change photo" : "Upload photo"}
              </Button>
            )}
          </form>
          {avatarUrl && !preview && (
            <form action={remove} onSubmit={() => setLast("remove")}>
              <Button type="submit" variant="ghost" className="text-danger hover:bg-danger-soft" loading={removing} disabled={busy}>
                Remove photo
              </Button>
            </form>
          )}
        </div>
        <p className="text-sm text-muted">
          {preview ? "Preview. Save to show it to your colleagues." : "PNG, JPEG or WebP, up to 2 MB. Your colleagues see it."}
        </p>
        {clientError && <Alert tone="danger">{clientError}</Alert>}
        {result &&
          (result.ok ? (
            <Alert tone="success">{last === "upload" ? "Photo saved." : "Photo removed."}</Alert>
          ) : (
            <Alert tone="danger">{result.error}</Alert>
          ))}
      </div>
    </div>
  );
}

const DETAILS_REQUIRED = { full_name: "Enter your full name." };

type DetailsProps = { fullName: string; phone: string | null; about: string | null; email: string };

export function DetailsForm({ fullName, phone, about, email }: DetailsProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aboutLength, setAboutLength] = useState(about?.length ?? 0);
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(updateProfile, null);

  return (
    <form onSubmit={submitRequired(dispatch, DETAILS_REQUIRED, setErrors)} noValidate className="grid gap-4">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field id="full_name" label="Full name" error={errors.full_name}>
          <Input name="full_name" autoComplete="name" required maxLength={100} defaultValue={fullName} />
        </Field>
        <Field id="phone" label="Phone (optional)">
          <Input name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={phone ?? ""} />
        </Field>
      </div>
      <Field id="about" label="About (optional)" hint={`${aboutLength} of ${ABOUT_MAX} characters`}>
        <Textarea
          name="about"
          rows={4}
          maxLength={ABOUT_MAX}
          defaultValue={about ?? ""}
          placeholder="E.g. what you specialise in"
          onChange={(e) => setAboutLength(e.target.value.length)}
        />
      </Field>
      <Field id="email" label="Email" hint="You sign in with it. It can't be changed here.">
        <Input type="email" value={email} readOnly className="bg-raised text-muted hover:border-control" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Save details
        </Button>
      </div>
      {state && !pending && (state.ok ? <Alert tone="success">Details saved.</Alert> : <Alert tone="danger">{state.error}</Alert>)}
    </form>
  );
}

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await changePassword(prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const found = passwordErrors(formData);
    setErrors(found);
    const first = Object.keys(PASSWORD_REQUIRED).find((name) => found[name]);
    if (first) return (form.elements.namedItem(first) as HTMLElement | null)?.focus();
    startTransition(() => dispatch(formData));
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-4">
      <Field id="current_password" label="Current password" error={errors.current_password} className="sm:max-w-sm">
        <PasswordInput name="current_password" autoComplete="current-password" required />
      </Field>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field id="new_password" label="New password" hint={PASSWORD_HINT} error={errors.new_password}>
          <PasswordInput name="new_password" autoComplete="new-password" required />
        </Field>
        <Field id="confirm_password" label="Confirm new password" error={errors.confirm_password}>
          <PasswordInput name="confirm_password" autoComplete="new-password" required />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          Change password
        </Button>
      </div>
      {state && !pending && (state.ok ? <Alert tone="success">Password changed.</Alert> : <Alert tone="danger">{state.error}</Alert>)}
    </form>
  );
}

/** Confirm, then every session of this account ends and this device lands on /login (D-107). */
export function SignOutEverywhere() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(signOutEverywhere, null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <LogOut aria-hidden />
          Sign out everywhere
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Sign out everywhere?</DialogTitle>
            <DialogDescription>
              You are signed out on every phone and computer, this one included. Sign in again with your password.
            </DialogDescription>
          </DialogHeader>
          {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Sign out everywhere
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
