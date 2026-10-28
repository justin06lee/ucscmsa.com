const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
export const SITE_URL = fromEnv && fromEnv.length > 0 ? fromEnv : "https://ucscmsa.com";
export const SITE_NAME = "MSA at UCSC";
// What students type into search; also the Organization/WebSite alternateName.
export const SITE_SHORT_NAME = "UCSC MSA";
export const SITE_TAGLINE =
  "Muslim Student Association at the University of California, Santa Cruz";
// The home page's and the default meta description. Keep it short and plain.
export const SITE_DESCRIPTION =
  "Events and prayer times from the Muslim Student Association at UC Santa Cruz.";

// The MSA's ways in, shown under the landing's logo (SocialLinks). The
// WhatsApp group is joined through this sign-up form (the MSA's resource
// guide), not an open invite link.
export const SITE_INSTAGRAM_URL = "https://www.instagram.com/ucsc.msa/";
export const SITE_WHATSAPP_JOIN_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfgjvHZ_X6VxfVsDkZKec8cDNJpADyAdD9JvtTYaOwWt-oLWA/viewform";
export const SITE_EMAIL = "salam@ucscmsa.com";

// The MSA's own profiles (Instagram, Linktree, the UCSC student-org directory
// page...), used as Organization sameAs in search results. Only add links the
// MSA actually runs.
export const SITE_SAME_AS: string[] = [SITE_INSTAGRAM_URL];

// The campus prayer space, shown on the landing page when set (searches like
// "prayer room UCSC"). Left empty on purpose: only confirmed facts go here —
// never guess a room or hours. See PrayerSpace in components/prayer-space.tsx.
export type PrayerSpaceInfo = {
  /** e.g. the building and room name, as students would find it */
  name: string;
  /** how to get there or where in the building it is */
  where: string;
  /** opening hours or access rules, if fixed */
  hours?: string;
  /** anything else: wudu facilities, separate spaces, who to contact */
  notes?: string;
};
export const PRAYER_SPACE: PrayerSpaceInfo | null = null;

// Search-engine ownership checks, set per deployment with no code change:
// GOOGLE_SITE_VERIFICATION is the content of Search Console's HTML-tag method,
// BING_SITE_VERIFICATION the msvalidate.01 value from Bing Webmaster Tools.
export const SITE_VERIFICATION = {
  google: process.env.GOOGLE_SITE_VERIFICATION?.trim() || undefined,
  bing: process.env.BING_SITE_VERIFICATION?.trim() || undefined,
};

// Vercel preview deployments must never be indexed (Vercel also sends
// X-Robots-Tag: noindex there; this is the in-page backstop).
export const IS_PREVIEW_DEPLOYMENT = process.env.VERCEL_ENV === "preview";
