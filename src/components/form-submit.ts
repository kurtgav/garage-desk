import { startTransition, type FormEvent } from "react";

/**
 * onSubmit for forms driven by useActionState. React resets a `<form action>` after every
 * submit, even a failed one; dispatching ourselves keeps what the user typed when the server says no.
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}

/**
 * Same, after checking required fields: `required` maps a field name to its error sentence.
 * Reports the missing ones through `setErrors` (empty object when all are filled) and focuses the first.
 */
export function submitRequired(
  dispatch: (formData: FormData) => void,
  required: Record<string, string>,
  setErrors: (errors: Record<string, string>) => void,
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const missing = Object.keys(required).filter((name) => !String(formData.get(name) ?? "").trim());
    setErrors(Object.fromEntries(missing.map((name) => [name, required[name]])));
    if (missing.length > 0) {
      (form.elements.namedItem(missing[0]) as HTMLElement | null)?.focus();
      return;
    }
    startTransition(() => dispatch(formData));
  };
}
