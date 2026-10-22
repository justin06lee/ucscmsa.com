// Calling a Server Function from a button, for optimistic UI: the caller has
// already shown the outcome, and rolls it back when this says it failed.
// Failures are `{ ok: false, error }` results and anything thrown (the
// network, a 500); `undefined` (an action that returns nothing) is success.

/** `code` is the action's own error string, for callers with their own wording. */
export type Attempt<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

export const OFFLINE_ERROR = "Couldn't reach the server. Nothing was changed; try again.";
export const GENERIC_ERROR = "That didn't save. Nothing was changed; try again.";

// Short codes some actions return, as sentences.
const CODES: Record<string, string> = {
  not_found: "That no longer exists. Reload the page.",
  not_pending: "That was already decided. Reload the page.",
  invalid: "That wasn't valid. Check it and try again.",
  invalid_input: "That wasn't valid. Check it and try again.",
  login_required: "Your sign-in ran out. Sign in again and retry.",
  forbidden: "You can't do that.",
};

/** The error as something to show: known codes as sentences, sentences as they are. */
export function errorText(error: unknown): string {
  if (typeof error !== "string" || !error.trim()) return GENERIC_ERROR;
  if (CODES[error]) return CODES[error];
  return /\s/.test(error) ? error : GENERIC_ERROR;
}

export async function attempt<T>(run: () => Promise<T>): Promise<Attempt<T>> {
  let value: T;
  try {
    value = await run();
  } catch {
    return { ok: false, error: OFFLINE_ERROR };
  }
  if (value && typeof value === "object" && "ok" in value && (value as { ok: unknown }).ok === false) {
    const code = (value as { error?: unknown }).error;
    return { ok: false, error: errorText(code), ...(typeof code === "string" ? { code } : {}) };
  }
  return { ok: true, value };
}
