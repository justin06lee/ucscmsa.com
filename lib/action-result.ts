// What a Server Function called from a button returns on an expected failure:
// `code` is the action's own short string (callers may map it to their own
// wording), `error` a sentence any caller can show as it is. Expected failures
// return this rather than throw, so optimistic UI can roll back and say why.

export type ActionFailure = { ok: false; code: string; error: string };

const SENTENCES: Record<string, string> = {
  login_required: "Please sign in first.",
  invalid: "That request wasn't valid.",
  invalid_input: "That request wasn't valid.",
  not_found: "That no longer exists. Reload the page.",
  event_ended: "This event has ended, so it no longer takes RSVPs.",
  image_removed: "That image was already removed. Reload the page.",
  not_a_board_member: "Only admins can be given a task.",
  not_pending: "That nomination was already decided.",
  nominator_cannot_approve: "You made this nomination, so you can't approve it.",
  already_approved: "You've already approved this.",
  nomination_void: "This nomination can no longer go through, so it was closed.",
  nominee_must_sign_in_first: "The nominee has to sign in once before they can be made an admin.",
  would_remove_last_admin: "That would leave no admins.",
};

export const GENERIC_FAILURE = "That didn't save. Try again.";

/** A failure with `code`, and `error` as given or the code's sentence. */
export function fail(code: string, error?: string): ActionFailure {
  return { ok: false, code, error: error ?? SENTENCES[code] ?? GENERIC_FAILURE };
}

/** Passes success through; turns a `{ ok: false, error: code }` result into `fail(code)`. */
export function withSentence<T extends { ok: true }>(r: T | { ok: false; error: string }): T | ActionFailure {
  return r.ok ? r : fail(r.error);
}
