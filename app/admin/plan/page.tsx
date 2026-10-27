import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { listOwnTimelines } from "@/lib/playbook-db";
import { formatDay } from "@/components/playbook/timeline-items";
import { PlanChat } from "./plan-chat";

export default async function TimelinePlannerPage() {
  const session = await requireAdmin();
  const timelines = session.user.id ? await listOwnTimelines(db, session.user.id) : [];
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl">Timeline</h1>
      <p className="mb-6 mt-1 text-dim">
        Say what you&rsquo;re planning in a sentence or two. You&rsquo;ll get every step with a date and its form.
      </p>
      <PlanChat />
      {timelines.length ? (
        <section className="mt-10 border-t border-ink/10 pt-4">
          <h2 className="text-lg font-medium">Your timelines</h2>
          <ul className="mt-2 space-y-2">
            {timelines.map((t) => {
              const done = t.items.filter((i) => i.done).length;
              return (
                <li key={t.id}>
                  <Link
                    href={`/admin/plan/${t.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/25"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{t.title}</span>
                      <span className="block text-sm text-dim">
                        {formatDay(t.eventDate)} · {done} of {t.items.length} done
                      </span>
                    </span>
                    {t.isPublic ? (
                      <span className="shrink-0 rounded-full border border-ink/20 px-2 py-0.5 text-xs text-dim">Public</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <p className="mt-8 text-sm text-dim">
        The steps come from the{" "}
        <Link href="/admin/playbook" className="text-burgundy underline decoration-burgundy/30 underline-offset-4">
          Playbook
        </Link>
        .
      </p>
    </div>
  );
}
