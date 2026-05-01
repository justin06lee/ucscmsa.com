import Link from "next/link";
import { WiggleIcon } from "@/components/logo/wiggle-icon";
import { WiggleLetters } from "@/components/logo/wiggle-letters";
import { UpcomingEvents } from "@/components/upcoming-events";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

const orgLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  alternateName: ["UCSC MSA", "Muslim Student Association at UCSC"],
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  image: `${SITE_URL}/icon.png`,
  description: SITE_TAGLINE,
  parentOrganization: {
    "@type": "CollegeOrUniversity",
    name: "University of California, Santa Cruz",
    url: "https://www.ucsc.edu",
  },
  location: {
    "@type": "Place",
    name: "University of California, Santa Cruz",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Santa Cruz",
      addressRegion: "CA",
      postalCode: "95064",
      addressCountry: "US",
    },
  },
};

const siteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
};

function ldJson(data: object) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-14 px-6 py-20 md:py-28"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(orgLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(siteLd) }}
      />
      <h1 className="sr-only">{SITE_NAME} — {SITE_TAGLINE}</h1>
      <div className="flex flex-col items-center gap-6">
        <WiggleIcon size={200} alt="" />
        <WiggleLetters />
      </div>
      <section className="w-full">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl">Upcoming</h2>
          <Link
            href="/calendar"
            className="text-sm text-dim hover:text-ink transition-colors"
          >
            See all →
          </Link>
        </div>
        <UpcomingEvents limit={3} className="stagger" />
      </section>
      <Link
        href="/calendar"
        className="inline-flex items-center rounded-full border border-ink px-7 py-3 font-medium transition-colors hover:bg-ink hover:text-paper"
      >
        See the full calendar
      </Link>
    </main>
  );
}
