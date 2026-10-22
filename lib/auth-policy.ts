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

/**
 * The sign-in rule auth.ts applies: any address ending in "@ucsc.edu", as since
 * launch, plus the exact addresses in `extraEmails` (AUTH_EXTRA_ALLOWED_EMAILS).
 * Nothing else vouches for an extra address, so it gets in only when Google
 * says it is verified. Signing in doesn't make anyone an admin.
 */
export function isAllowedSignIn(
  email: string | null | undefined,
  profile: GoogleProfile | null | undefined,
  extraEmails: ReadonlySet<string> = new Set()
): boolean {
  const normalized = (email ?? "").toLowerCase();
  if (!normalized) return false;
  if (normalized.endsWith(`@${ALLOWED_DOMAIN}`)) return true;
  return (
    extraEmails.has(normalized) &&
    profile?.email_verified === true &&
    profile.email?.toLowerCase() === normalized
  );
}
