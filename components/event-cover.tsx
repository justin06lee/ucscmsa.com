import Image from "next/image";
import type { FlyerImage } from "@/lib/event-media";

// A faint lattice of eight-point stars, in paper on burgundy. Inline, so the
// fallback cover costs no request.
const STARS =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='%23f5efe2' stroke-opacity='.16'%3E%3Cpath d='M18 18h20v20H18z'/%3E%3Cpath d='M28 13.86 42.14 28 28 42.14 13.86 28z'/%3E%3Cpath d='M0 4 4 0M52 0l4 4M56 52l-4 4M4 56l-4-4'/%3E%3C/g%3E%3C/svg%3E\")";

/**
 * An event's cover: its first flyer, whole (contained in a 4:5 frame, never
 * cropped; the frame holds the space before it loads), or, for an event with
 * no flyer, a cover in the site's colours: burgundy with a faint star lattice
 * and the title in Amiri; `compact` (list thumbnails) shows a single star
 * instead. Decorative: whatever it sits in names the event in text.
 */
export function EventCover({
  image,
  title,
  compact = false,
  className = "",
}: {
  image: FlyerImage | null;
  title: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`@container relative block aspect-[4/5] shrink-0 overflow-hidden border border-ink/10 bg-ink/[0.05] ${className}`}
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
        <FallbackCover title={compact ? null : title} />
      )}
    </span>
  );
}

function FallbackCover({ title }: { title: string | null }) {
  return (
    <span
      aria-hidden="true"
      data-fallback-cover=""
      className="flex h-full w-full flex-col items-center justify-center bg-burgundy p-[9%] text-center text-paper"
      style={{ backgroundImage: STARS, backgroundPosition: "center" }}
    >
      {title ? (
        <>
          <span className="font-display line-clamp-5 text-[clamp(1rem,10.5cqw,2.75rem)] leading-[1.12] text-balance break-words">
            {title}
          </span>
          <span className="mt-[7cqw] h-px w-[18cqw] bg-paper/45" />
          <span className="mt-[5cqw] text-[clamp(0.5625rem,3.6cqw,0.8125rem)] tracking-[0.22em] text-paper/75 uppercase">
            MSA at UCSC
          </span>
        </>
      ) : (
        <svg viewBox="0 0 24 24" className="w-[38%]" fill="none" stroke="currentColor" strokeOpacity=".7">
          <path d="M6 6h12v12H6z" />
          <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />
        </svg>
      )}
    </span>
  );
}
