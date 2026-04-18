import Link from "next/link";
import { BoilTickerProvider } from "@/components/logo/boil-ticker";
import { WiggleIcon } from "@/components/logo/wiggle-icon";
import { WiggleLetters } from "@/components/logo/wiggle-letters";
import { UpcomingEvents } from "@/components/upcoming-events";

export default function Home() {
  return (
    <BoilTickerProvider>
      <main className="flex flex-1 flex-col items-center px-6 py-16 md:py-24 gap-12 max-w-5xl mx-auto w-full">
        <div className="flex flex-col items-center gap-4">
          <WiggleIcon size={120} alt="" />
          <WiggleLetters />
        </div>
        <p className="text-ink text-lg max-w-prose text-center">
          Welcome to the Muslim Student Association at UC Santa Cruz. Community,
          prayer, and every week, something to bring us together.
        </p>
        <section className="w-full">
          <h2 className="text-2xl font-medium mb-4">Upcoming</h2>
          <UpcomingEvents limit={3} />
        </section>
        <Link
          href="/calendar"
          className="inline-flex items-center rounded-full border border-ink px-6 py-3 text-ink hover:bg-ink hover:text-paper transition-colors"
        >
          See the full calendar
        </Link>
      </main>
    </BoilTickerProvider>
  );
}
