import Link from "next/link";
import { BoilTickerProvider } from "@/components/logo/boil-ticker";
import { WiggleIcon } from "@/components/logo/wiggle-icon";
import { WiggleLetters } from "@/components/logo/wiggle-letters";
import { UpcomingEvents } from "@/components/upcoming-events";

export default function Home() {
  return (
    <BoilTickerProvider intervalMs={750}>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-14 px-6 py-20 md:py-28">
        <div className="flex flex-col items-center gap-5">
          <WiggleIcon size={128} alt="" />
          <WiggleLetters />
        </div>
        <p className="max-w-prose text-center text-lg leading-relaxed text-ink/80">
          Welcome to the Muslim Student Association at UC Santa Cruz. Community,
          prayer, and every week, something to bring us together.
        </p>
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
    </BoilTickerProvider>
  );
}
