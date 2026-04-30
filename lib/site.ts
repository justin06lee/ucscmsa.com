const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
export const SITE_URL = fromEnv && fromEnv.length > 0 ? fromEnv : "https://ucscmsa.com";
export const SITE_NAME = "MSA at UCSC";
export const SITE_TAGLINE =
  "Muslim Student Association at the University of California, Santa Cruz";
export const SITE_DESCRIPTION =
  "Events, prayer times, and community for Muslim students at UC Santa Cruz. Jummah, Iftar, halaqas, and more.";
