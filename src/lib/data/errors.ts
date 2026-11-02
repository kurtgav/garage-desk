// Maps stable DB error messages (supabase/migrations, D-025) to user-facing sentences.
// Raw DB text never reaches the UI: anything unknown becomes the caller's fallback.

export const GENERIC_ERROR = "Something went wrong. Please try again.";

const STAFF_MESSAGES: Record<string, string> = {
  invalid_transition: "That status change isn't allowed right now. Refresh the page to see the job's current status.",
  forbidden: "You don't have permission to do that.",
  not_found: "This job doesn't exist or isn't assigned to you.",
  no_line_items: "A quote needs at least one line item.",
  job_locked: "Line items can't be changed once the job is Ready, Collected or Cancelled.",
  invalid_mechanic: "Choose an active mechanic.",
  not_linkable: "A customer link can only be created once a quote has been sent, and not after the car is collected.",
  kind_immutable: "A line's type can't be changed. Delete the line and add a new one.",
  quote_changed: "This quote was updated since you opened the page. Refresh to see the current version.",
  note_required: "Add a note. It is required for this action.",
};

/** Postgres "insufficient_privilege" (RLS / column grants). */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

export function staffErrorMessage(error: { message?: string; code?: string } | null, fallback = GENERIC_ERROR): string {
  if (!error) return fallback;
  if (error.message && Object.hasOwn(STAFF_MESSAGES, error.message)) return STAFF_MESSAGES[error.message];
  if (error.code === PG_INSUFFICIENT_PRIVILEGE) return STAFF_MESSAGES.forbidden;
  return fallback;
}

/** profiles_full_name_unique (D-091): nobody can pose as a colleague on the timeline. */
export const NAME_TAKEN = "Another staff member already uses that name.";
export const PG_UNIQUE_VIOLATION = "23505";

export const INVALID_LINK = "This link is no longer valid.";
export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a minute and try again.";
// The customer page refreshes itself after a failed decision (quote-actions.tsx), so these never ask for a refresh.
const QUOTE_NOT_OPEN = "This quote is no longer waiting for a decision. Its current status is shown above.";
/** Approve/decline named a quote version that is no longer current (D-049). */
export const QUOTE_CHANGED = "This quote was updated since you opened the page. Please check the new version before you decide.";
/** A signed-in staff member opened a customer link: their click must not count as the customer's (D-067). */
export const STAFF_ON_CUSTOMER_LINK = "You're signed in as garage staff — record a phone approval from the job page instead.";

/** Customer link actions: never reveal why a link failed beyond "no longer valid". */
export function customerErrorMessage(error: { message?: string } | null): string {
  if (error?.message === "invalid_transition") return QUOTE_NOT_OPEN;
  if (error?.message === "not_found") return INVALID_LINK;
  if (error?.message === "quote_changed") return QUOTE_CHANGED;
  return GENERIC_ERROR;
}
