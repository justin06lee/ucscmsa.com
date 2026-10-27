import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { getPublicTimeline } from "@/lib/playbook-db";
import { SITE_NAME } from "@/lib/site";
import { SiteHeader } from "@/components/site-header";
import { toLocalYmd } from "@/lib/time";
import {
  Progress,
  TimelineList,
  formatDay,
} from "@/components/playbook/timeline-items";

export const metadata: Metadata = {
  title: "Event timeline",
  robots: { index: false, follow: false },
};

export default async function PublicTimelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const timeline = await getPublicTimeline(db, slug);
  if (!timeline) notFound();
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-2xl flex-1 px-6 py-10"
      >
        <p className="text-sm text-dim">{SITE_NAME} event timeline</p>
        <h1 className="mt-1 text-3xl leading-tight">{timeline.title}</h1>
        <p className="mb-4 mt-1 text-dim">
          Event on {formatDay(timeline.eventDate)}
        </p>
        <Progress items={timeline.items} />
        <TimelineList items={timeline.items} today={toLocalYmd(new Date())} />
      </main>
    </>
  );
}
