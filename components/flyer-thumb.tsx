import Image from "next/image";
import type { FlyerImage } from "@/lib/event-media";

/**
 * A flyer thumbnail for event cards and lists: `width` px wide, its height
 * from the flyer's own shape (up to 4:3 tall), never cropped. The box is
 * sized before the image loads, so nothing shifts. Decorative next to the
 * event's linked title, so it has no alt text of its own.
 */
export function FlyerThumb({ image, width, className = "" }: { image: FlyerImage; width: number; className?: string }) {
  const height = Math.round(Math.min(width * (image.height / image.width), width * (4 / 3)));
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-md border border-ink/10 bg-ink/[0.04] ${className}`}
      style={{ width, height }}
    >
      <Image
        src={image.src}
        width={image.width}
        height={image.height}
        alt=""
        unoptimized
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
