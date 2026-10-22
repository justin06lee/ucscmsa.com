import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { tagLabel, todayMarkerIndex } from "@/lib/planning";
import { DraftBadge } from "@/components/board/draft-badge";
import { formatYmd, relativeDay } from "@/components/board/format";
import { boardMembers, getTimeline } from "../_plan";
import { TaskItem } from "./task-item";
import { PublishButton } from "./publish-button";

type Props = { params: Promise<{ id: string }> };

export default async function EventPlanPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const [timeline, members] = await Promise.all([getTimeline(db, id), boardMembers(db)]);
  if (!timeline) notFound();
  const { event, eventYmd, todayYmd, tags, tasks } = timeline;
  const marker = todayMarkerIndex(tasks, todayYmd);
  const done = tasks.filter((t) => t.state === "done").length;
  const overdue = tasks.filter((t) => t.state === "overdue").length;
  const eventPassed = eventYmd < todayYmd;

  const todayRow = (
    <li key="today" aria-label="Today" className="relative grid grid-cols-[1.5rem_1fr] items-center py-2">
      <span aria-hidden className="z-10 mx-auto size-3 rounded-full bg-burgundy ring-4 ring-paper" />
      <span className="flex items-center gap-3 pl-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-burgundy">
          Today · {formatYmd(todayYmd, "MMM d")}
        </span>
        <span aria-hidden className="h-0.5 flex-1 rounded-full bg-burgundy/60" />
      </span>
    </li>
  );

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/plan"
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-dim hover:text-ink"
      >
        Back to planning
      </Link>
      <h1 className="text-3xl break-words">{event.title}</h1>
      <p className="mt-1 text-dim">
        {formatYmd(eventYmd, "EEEE, MMMM d")} · {relativeDay(eventYmd, todayYmd)}
      </p>
      {event.draft || tags.length ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5">
          {event.draft ? <DraftBadge /> : null}
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/75">
              {tagLabel(t)}
            </span>
          ))}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {event.draft ? <PublishButton eventId={event.id} /> : null}
        <Link
          href={`/admin/events/${event.id}/edit`}
          className="inline-flex min-h-11 items-center text-sm text-dim underline decoration-ink/20 underline-offset-4 hover:text-ink"
        >
          Edit event
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-10 text-dim">
          No checklist for this event. Add what it needs (room, food, funding…) in Edit event to start one.
        </p>
      ) : (
        <>
          <p className="mt-8 text-sm text-dim">
            {done} of {tasks.length} done
            {overdue ? <span className="text-burgundy"> · {overdue} overdue</span> : null}
          </p>
          <ol className="relative mt-3" aria-label="Checklist">
            <span aria-hidden className="absolute bottom-6 left-3 top-6 w-px -translate-x-1/2 bg-ink/15" />
            {tasks.flatMap((t, i) => {
              const row = (
                <li key={t.id} className="relative grid grid-cols-[1.5rem_1fr]">
                  <span
                    aria-hidden
                    className={`z-10 mx-auto mt-5 size-2.5 rounded-full ring-4 ring-paper ${
                      t.state === "done"
                        ? "bg-ink/40"
                        : t.state === "overdue"
                          ? "bg-burgundy"
                          : "border border-ink/40 bg-paper"
                    }`}
                  />
                  <TaskItem task={t} members={members} today={todayYmd} />
                </li>
              );
              return i === marker && !eventPassed ? [todayRow, row] : [row];
            })}
            {marker === tasks.length && !eventPassed ? todayRow : null}
            <li className="relative grid grid-cols-[1.5rem_1fr] items-center py-3">
              <span aria-hidden className="z-10 mx-auto size-3.5 rotate-45 rounded-[3px] bg-ink ring-4 ring-paper" />
              <span className="pl-3 font-medium">
                {event.title} · {formatYmd(eventYmd, "EEE, MMM d")}
              </span>
            </li>
          </ol>
        </>
      )}
    </div>
  );
}
