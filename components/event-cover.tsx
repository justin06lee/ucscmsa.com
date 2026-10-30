import Image from "next/image";
import type { FlyerImage } from "@/lib/event-media";
import { formatLocal } from "@/lib/time";

/**
 * An event's cover: its first flyer, whole (contained in a 4:5 frame, never
 * cropped; the frame holds the space before it loads), or, for an event with
 * no flyer, a plain one: the site's white paper with the title
 * and the date set in type. No shapes, symbols or patterns, ever: midna and
 * Justin's rule after a star lattice here read as a Star of David. `compact`
 * (list thumbnails) shows only the month and day. Decorative: whatever it
 * sits in names the event in text.
 */
export function EventCover({
  image,
  title,
  date,
  compact = false,
  className = "",
}: {
  image: FlyerImage | null;
  title: string;
  /** The occurrence's start, for the date on a cover without a flyer. */
  date: Date;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`@container relative block aspect-[4/5] shrink-0 overflow-hidden ${className}`}
    >
      {image ? (
        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt=""
          unoptimized
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          data-fallback-cover=""
          className="flex h-full w-full flex-col items-center justify-center bg-[var(--color-scrap)] bg-[url(/textures/paper.webp)] bg-[length:360px] p-[9%] text-center text-ink"
        >
          {compact ? (
            <>
              <span className="text-[15cqw] font-medium tracking-[0.12em] text-ink/70 uppercase">{formatLocal(date, "MMM")}</span>
              <span className="font-display text-[46cqw] leading-none tabular-nums">{formatLocal(date, "d")}</span>
            </>
          ) : (
            <>
              <span className="font-display line-clamp-5 text-[clamp(1rem,10.5cqw,2.75rem)] leading-[1.12] text-balance break-words">
                {title}
              </span>
              <span className="mt-[6cqw] text-[clamp(0.625rem,4.2cqw,0.9375rem)] tabular-nums text-ink/70">
                {formatLocal(date, "EEE, MMM d, yyyy")}
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
