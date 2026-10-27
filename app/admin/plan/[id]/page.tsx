import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { getOwnTimeline } from "@/lib/playbook-db";
import { SITE_URL } from "@/lib/site";
import { toLocalYmd } from "@/lib/time";
import { TimelineView } from "./timeline-view";

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const timeline = session.user.id ? await getOwnTimeline(db, id, session.user.id) : null;
  if (!timeline) notFound();
  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/plan"
        className="inline-flex min-h-11 items-center text-sm text-burgundy underline decoration-burgundy/30 underline-offset-4"
      >
        All timelines
      </Link>
      <TimelineView
        id={timeline.id}
        title={timeline.title}
        eventDate={timeline.eventDate}
        items={timeline.items}
        isPublic={timeline.isPublic}
        shareUrl={`${SITE_URL}/timeline/${timeline.shareSlug}`}
        today={toLocalYmd(new Date())}
      />
    </div>
  );
}
