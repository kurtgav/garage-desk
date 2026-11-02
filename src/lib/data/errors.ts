// Maps stable DB error messages (supabase/migrations, D-025) to user-facing sentences.
// Raw DB text never reaches the UI: anything unknown becomes the caller's fallback.

export const GENERIC_ERROR = "Something went wrong. Please try again.";

const STAFF_MESSAGES: Record<string, string> = {
  invalid_transition: "That status change isn't allowed right now. Refresh the page to see the job's current status.",
  forbidden: "You don't have permission to do that.",
  not_found: "This job doesn't exist or isn't assigned to you.",
  no_line_items: "Add at least one line item before sending the quote.",
  job_locked: "Line items can only be changed while the job is New.",
  invalid_mechanic: "Choose an active mechanic.",
  not_linkable: "A customer link can only be created after the quote is sent and before the car is collected.",
  kind_immutable: "A line's type can't be changed. Delete the line and add a new one.",
};

/** Postgres "insufficient_privilege" (RLS / column grants). */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

export function staffErrorMessage(error: { message?: string; code?: string } | null, fallback = GENERIC_ERROR): string {
  if (!error) return fallback;
  if (error.message && Object.hasOwn(STAFF_MESSAGES, error.message)) return STAFF_MESSAGES[error.message];
  if (error.code === PG_INSUFFICIENT_PRIVILEGE) return STAFF_MESSAGES.forbidden;
  return fallback;
}

export const INVALID_LINK = "This link is no longer valid.";
export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a minute and try again.";
const QUOTE_NOT_OPEN = "This quote is no longer waiting for a decision. Refresh the page to see its current status.";
/** Approve sent a total that is not the current quote (D-037). */
export const QUOTE_CHANGED = "The quote changed since you opened this page. Please review the updated quote.";

/** Customer link actions: never reveal why a link failed beyond "no longer valid". */
export function customerErrorMessage(error: { message?: string } | null): string {
  if (error?.message === "invalid_transition") return QUOTE_NOT_OPEN;
  if (error?.message === "not_found") return INVALID_LINK;
  if (error?.message === "quote_changed") return QUOTE_CHANGED;
  return GENERIC_ERROR;
}
