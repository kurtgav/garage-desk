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
