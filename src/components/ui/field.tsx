import { cloneElement } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

type FieldProps = {
  id: string;
  label: React.ReactNode;
  /** What the field accepts, shown under the control. */
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  /** One Input, Textarea or Select. Field gives it the id and the aria wiring. */
  children: React.ReactElement<ControlProps>;
};

/** Label + control + hint + error, with aria-describedby / aria-invalid wired to the control. */
export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
