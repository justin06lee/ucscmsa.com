import type { Metadata } from "next";
import Link from "next/link";
import { PrayerSpace } from "@/components/prayer-space";
import { WiggleIcon } from "@/components/logo/wiggle-icon";
import { WiggleLetters } from "@/components/logo/wiggle-letters";
import { UpcomingEvents } from "@/components/upcoming-events";
import { PRAYER_SPACE, SITE_DESCRIPTION, SITE_NAME, SITE_SHORT_NAME, SITE_TAGLINE } from "@/lib/site";
import { jsonLdScript, organizationJsonLd, pageMetadata, websiteJsonLd } from "@/lib/seo";

// The page is otherwise prerendered once at build time, which froze "Upcoming"
// at the last deploy. Regenerate it in the background every 5 minutes.
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: `${SITE_SHORT_NAME} — Muslim Student Association at UC Santa Cruz`,
  absoluteTitle: true,
  description: SITE_DESCRIPTION,
  path: "/",
});

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-14 px-6 py-20 md:py-28"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
      />
      <h1 className="sr-only">{SITE_NAME} — {SITE_TAGLINE}</h1>
      <div className="flex flex-col items-center gap-6">
        <WiggleIcon size={200} alt="" priority />
        <WiggleLetters />
        <p className="max-w-md text-center text-base leading-relaxed text-dim">
          The Muslim Student Association at UC Santa Cruz: Friday Jummah
          (Jumu&rsquo;ah) prayer, halaqas, iftars and socials, with daily prayer
          times for Santa Cruz on the calendar.
        </p>
      </div>
      {PRAYER_SPACE ? <PrayerSpace info={PRAYER_SPACE} /> : null}
      <section className="w-full">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl">Upcoming</h2>
          <Link
            href="/calendar"
            className="-my-3 inline-flex min-h-11 items-center text-sm text-dim hover:text-ink transition-colors"
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
