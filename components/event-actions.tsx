import { CalendarPlus } from "lucide-react";
import { LINK_KIND_LABELS, type EventLink } from "@/lib/event-rules";
import { buttonClasses } from "@/components/ui/button";
import { ShareButton } from "./share-button";

// Links come from the import and the admin form, so they're treated like
// links in descriptions: new tab, no referrer, no endorsement.
const REL = "noopener noreferrer nofollow ugc";
const PILL = "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors";
const QUIET = "inline-flex min-h-11 items-center gap-1.5 px-1 text-sm text-ink/75 transition-colors hover:text-ink";

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
      className={`${buttonClasses("primary", "lg")} min-h-11 ${className}`}
    >
      {primaryLabel(link)}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * The event page's other actions: quiet pills for its other links (donate,
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
    <div className="flex flex-col gap-3">
      {secondary.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {secondary.map((l) => (
            <a
              key={`${l.kind}-${l.url}`}
              href={l.url}
              target="_blank"
              rel={REL}
              data-link-kind={l.kind}
              className={`${PILL} border-ink/20 text-ink/85 hover:border-ink/50`}
            >
              {l.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-4">
        {icsHref && googleHref ? (
          <details className="group">
            <summary className={`${QUIET} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <CalendarPlus size={15} aria-hidden="true" />
              Add to calendar
            </summary>
            <div className="flex flex-wrap gap-2 pb-1">
              <a href={icsHref} download className={`${PILL} border-ink/20 text-ink/85 hover:border-ink/50`}>
                Apple / Outlook (.ics)
              </a>
              <a href={googleHref} target="_blank" rel="noopener noreferrer" className={`${PILL} border-ink/20 text-ink/85 hover:border-ink/50`}>
                Google Calendar
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </details>
        ) : null}
        <ShareButton title={title} url={pageUrl} className={QUIET} />
      </div>
    </div>
  );
}
