export const ALLOWED_DOMAIN = "ucsc.edu";

type GoogleProfile = {
  email?: string | null;
  email_verified?: boolean | null;
  hd?: unknown;
};

/**
 * Who may sign in with Google. A UCSC account must be a verified address in
 * UCSC's own Google Workspace (`hd` is set by Google only for Workspace
 * accounts), not just an address that ends in "@ucsc.edu". `extraEmails` are
 * exact, verified addresses let in on top of that.
 */
export function isAllowedGoogleSignIn(
  profile: GoogleProfile | null | undefined,
  extraEmails: ReadonlySet<string> = new Set()
): boolean {
  if (!profile?.email || profile.email_verified !== true) return false;
  const email = profile.email.toLowerCase();
  if (extraEmails.has(email)) return true;
  return profile.hd === ALLOWED_DOMAIN && email.endsWith(`@${ALLOWED_DOMAIN}`);
}

/** A comma-separated list of addresses from an env var, trimmed and lowercased. */
export function parseEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
