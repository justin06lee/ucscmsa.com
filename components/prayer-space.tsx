import type { PrayerSpaceInfo } from "@/lib/site";

// Landing-page section for the campus prayer space. Renders only once
// PRAYER_SPACE in lib/site.ts holds confirmed facts.
export function PrayerSpace({ info }: { info: PrayerSpaceInfo }) {
  return (
    <section aria-labelledby="prayer-space" className="w-full max-w-xl text-center">
      <h2 id="prayer-space" className="text-2xl">
        Prayer space on campus
      </h2>
      <p className="mt-3 text-base text-ink">{info.name}</p>
      <p className="mt-1 text-sm leading-relaxed text-dim">{info.where}</p>
      {info.hours ? <p className="mt-1 text-sm text-dim">{info.hours}</p> : null}
      {info.notes ? (
        <p className="mt-2 text-sm leading-relaxed text-dim">{info.notes}</p>
      ) : null}
    </section>
  );
}
