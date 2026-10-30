import { CalendarPlus, ClipboardList, HandHeart, Link2, MapPin, type LucideIcon } from "lucide-react";
import { LINK_KIND_LABELS, type EventLink, type LinkKind } from "@/lib/event-rules";
import { buttonClasses } from "@/components/ui/button";
import { ShareButton } from "./share-button";

// Links come from the import and the admin form, so they're treated like
// links in descriptions: new tab, no referrer, no endorsement.
const REL = "noopener noreferrer nofollow ugc";
// Everything but the RSVP is a ghost button: no border, a soft wash on hover.
const GHOST = "btn btn-ghost px-3 text-sm";
// Without a border, an icon is what says a link is a button.
const KIND_ICONS: Record<LinkKind, LucideIcon> = {
  rsvp: ClipboardList,
  form: ClipboardList,
  signup: ClipboardList,
  donate: HandHeart,
  map: MapPin,
  other: Link2,
};

/** A form left with its default label is the event's RSVP, so it says so. */
function primaryLabel(l: EventLink): string {
  return l.kind === "form" && l.label === LINK_KIND_LABELS.form ? LINK_KIND_LABELS.rsvp : l.label;
}

/**
 * An event's own RSVP or form as the site's primary button, on its card and
 * its page. It opens the form in a new tab.
 */
export function RsvpLink({ link, className = "" }: { link: EventLink; className?: string }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel={REL}
      data-link-kind={link.kind}
      className={`${buttonClasses("primary", "lg")} ${className}`}
    >
      {primaryLabel(link)}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * The event page's other actions, all ghost buttons: its other links (donate,
 * sign up...), then add to calendar and share. Every outside link opens in a
 * new tab.
 */
export function EventActions({
  secondary,
  icsHref,
  googleHref,
  title,
  pageUrl,
}: {
  secondary: EventLink[];
  // Null for an event that's over or cancelled: nothing to add.
  icsHref: string | null;
  googleHref: string | null;
  title: string;
  pageUrl: string;
}) {
  return (
    <div className="-ml-3 flex flex-wrap items-start gap-x-1">
      {secondary.map((l) => {
        const Icon = KIND_ICONS[l.kind];
        return (
          <a
            key={`${l.kind}-${l.url}`}
            href={l.url}
            target="_blank"
            rel={REL}
            data-link-kind={l.kind}
            className={GHOST}
          >
            <Icon size={15} aria-hidden="true" />
            {l.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        );
      })}
      {icsHref && googleHref ? (
        <details className="group">
          <summary className={`${GHOST} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <CalendarPlus size={15} aria-hidden="true" />
            Add to calendar
          </summary>
          <div className="flex flex-wrap gap-1 pb-1">
            <a href={icsHref} download className={GHOST}>
              Apple / Outlook (.ics)
            </a>
            <a href={googleHref} target="_blank" rel="noopener noreferrer" className={GHOST}>
              Google Calendar
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </details>
      ) : null}
      <ShareButton title={title} url={pageUrl} className={GHOST} />
    </div>
  );
}
