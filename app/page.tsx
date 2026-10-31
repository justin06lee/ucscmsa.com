import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { PrayerSpace } from "@/components/prayer-space";
import { JungleFooter, JungleFront, JungleMargins, JungleStage } from "@/components/jungle/jungle-scene";
import { LogoIntro } from "@/components/logo/logo-intro";
import { WiggleIcon } from "@/components/logo/wiggle-icon";
import { WiggleLetters } from "@/components/logo/wiggle-letters";
import { PastEvents } from "@/components/past-events";
import { SiteHeader } from "@/components/site-header";
import { SocialLinks } from "@/components/social-links";
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
    <div className="jungle">
      <JungleStage />
      <div className="relative z-40">
        <SiteHeader brand={false} />
      </div>
      <main id="main" tabIndex={-1} className="relative flex w-full flex-1 flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        <h1 className="sr-only">{SITE_NAME} — {SITE_TAGLINE}</h1>
        <div className="jungle-clearing" data-depth={0.16}>
          <LogoIntro />
          <WiggleIcon size={200} alt="" priority drop={0} />
          <WiggleLetters dropFrom={1} />
          <SocialLinks />
        </div>
        <div className="jungle-sheet">
          <JungleFront />
          <div className="jungle-paper" />
          <JungleMargins />
          <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-14 px-6 pt-12 md:pt-14">
            {PRAYER_SPACE ? <PrayerSpace info={PRAYER_SPACE} /> : null}
            <section className="w-full">
              <h2 className="scrap-title mb-8 text-4xl sm:text-5xl">Upcoming</h2>
              <UpcomingEvents limit={3} className="stagger" />
              <div className="mt-10 flex justify-center">
                <Link href="/calendar" className={buttonClasses("ghost", "lg")}>
                  See the full calendar
                </Link>
              </div>
            </section>
            <section aria-labelledby="past-events-heading" className="w-full">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2 id="past-events-heading" className="scrap-title text-3xl">
                  Past events
                </h2>
                <Link href="/calendar?view=year" className={`${buttonClasses("ghost", "sm")} -mr-3`}>
                  Browse the calendar
                </Link>
              </div>
              <PastEvents limit={4} />
            </section>
          </div>
          <JungleFooter />
        </div>
      </main>
    </div>
  );
}
