"use client";

import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
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
import type { ActionResult, TempPassword } from "@/lib/data/types";
import { createStaff, resetStaffPassword, setStaffActive } from "./actions";

type TempResult = ActionResult<TempPassword> | null;

/** Shown once, right after the server generated it; it is not stored anywhere we can show it again. */
function TempPasswordNotice({ password }: { password: string }) {
  return (
    <div className="grid gap-3">
      <Field id="temp-password" label="Temporary password">
        <Input readOnly value={password} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={password} label="Copy password" noun="password" />
      </div>
      <Alert tone="warning">
        This is the only time it is shown. Share it privately, in person or by phone; they should change it on their
        profile after signing in.
      </Alert>
    </div>
  );
}

const ADD_REQUIRED = { full_name: "Enter their full name.", email: "Enter their email." };

/** "Add mechanic": name + email → a temporary password, shown once. The form lives only while the dialog is open. */
export function AddMechanic() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Add mechanic
        </Button>
      </DialogTrigger>
      <DialogContent>
        <AddMechanicForm />
      </DialogContent>
    </Dialog>
  );
}

function AddMechanicForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, dispatch, pending] = useActionState<TempResult, FormData>(createStaff, null);

  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Mechanic added</DialogTitle>
          <DialogDescription>They can sign in now with their email and this password.</DialogDescription>
        </DialogHeader>
        <TempPasswordNotice password={state.tempPassword} />
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <form onSubmit={submitRequired(dispatch, ADD_REQUIRED, setErrors)} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add a mechanic</DialogTitle>
        <DialogDescription>We create their account and a temporary password to give them.</DialogDescription>
      </DialogHeader>
      <Field id="new-staff-name" label="Full name" error={errors.full_name}>
        <Input name="full_name" autoComplete="off" required maxLength={100} />
      </Field>
      <Field id="new-staff-email" label="Email" error={errors.email}>
        <Input name="email" type="email" autoComplete="off" required maxLength={254} />
      </Field>
      {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" loading={pending}>
          Add mechanic
        </Button>
      </DialogFooter>
    </form>
  );
}

type Member = { id: string; fullName: string; active: boolean; openJobs: number };

/** Reset password and Deactivate/Reactivate for one row. The page decides which are allowed. */
export function StaffRowActions({ member, canToggle, canReset }: { member: Member; canToggle: boolean; canReset: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {canReset && member.active && <ResetPassword member={member} />}
      {canToggle && <ToggleActive member={member} />}
    </div>
  );
}

function ResetPassword({ member }: { member: Member }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Reset password for ${member.fullName}`}>
          <KeyRound aria-hidden strokeWidth={1.5} />
          Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ResetPasswordForm member={member} />
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordForm({ member }: { member: Member }) {
  const [state, action, pending] = useActionState<TempResult, FormData>(resetStaffPassword, null);

  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>New password for {member.fullName}</DialogTitle>
          <DialogDescription>Their old password no longer works.</DialogDescription>
        </DialogHeader>
        <TempPasswordNotice password={state.tempPassword} />
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={member.id} />
      <DialogHeader>
        <DialogTitle>Reset {member.fullName}&apos;s password?</DialogTitle>
        <DialogDescription>
          We replace their password with a temporary one and show it to you once. Their old password stops working.
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
          Reset password
        </Button>
      </DialogFooter>
    </form>
  );
}

function ToggleActive({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await setStaffActive(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const deactivate = member.active;
  const jobs = member.openJobs === 1 ? "1 open job stays" : `${member.openJobs} open jobs stay`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={deactivate ? "text-danger hover:bg-danger-soft" : undefined}
          aria-label={`${deactivate ? "Deactivate" : "Reactivate"} ${member.fullName}`}
        >
          {deactivate ? <UserX aria-hidden strokeWidth={1.5} /> : <UserCheck aria-hidden strokeWidth={1.5} />}
          {deactivate ? "Deactivate" : "Reactivate"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="active" value={deactivate ? "false" : "true"} />
          <DialogHeader>
            <DialogTitle>
              {deactivate ? "Deactivate" : "Reactivate"} {member.fullName}?
            </DialogTitle>
            <DialogDescription>
              {deactivate
                ? `They are signed out everywhere at once and can't sign in until you reactivate them. Their job history is kept${member.openJobs > 0 ? `; ${jobs} assigned to them, so reassign it from the job page` : ""}.`
                : "They can sign in again with their current password. Their job history is unchanged."}
            </DialogDescription>
          </DialogHeader>
          {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={deactivate ? "danger" : "primary"} loading={pending}>
              {deactivate ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
