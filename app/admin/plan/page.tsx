import Link from "next/link";
import { IntentLink } from "@/components/intent-link";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { formatYmd, relativeDay } from "@/components/board/format";
import { DraftBadge } from "@/components/board/draft-badge";
import { getOverview } from "./_plan";
import { listCards } from "../playbook/_cards";
import { PlanComposer } from "./plan-composer";
import { toLocalYmd } from "@/lib/time";

export default async function PlanningPage() {
  await requireAdmin();
  const [rows, cards] = await Promise.all([getOverview(db), listCards(db)]);
  const today = toLocalYmd(new Date());

  return (
    <div>
      <h1 className="mb-6 text-3xl">Planning</h1>
      <PlanComposer cards={cards} today={today} />
      <h2 className="mb-4 text-2xl">Upcoming plans</h2>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-dim">
          No upcoming plans yet. Tell us about your next event above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Upcoming events in planning">
          {rows.map((r) => (
            <li key={r.id}>
              <IntentLink
                href={`/admin/plan/${r.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/25"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium break-words">{r.title}</span>
                    {r.draft ? <DraftBadge /> : null}
                  </span>
                  <span className="text-sm text-dim">
                    {formatYmd(r.eventYmd, "EEE, MMM d")} · {relativeDay(r.eventYmd, today)}
                  </span>
                  <span className="text-sm">
                    {r.next ? (
                      <>
                        <span className="text-dim">Next: </span>
                        {r.next.title}
                        <span className={r.next.state === "overdue" ? "text-burgundy" : "text-dim"}>
                          {" "}
                          · {r.next.state === "overdue" ? "was due" : "due"} {formatYmd(r.next.dueDate, "MMM d")}
                        </span>
                      </>
                    ) : (
                      <span className="text-dim">All done</span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.overdue > 0 ? (
                    <span className="rounded-full bg-burgundy/10 px-2 py-0.5 text-xs font-medium text-burgundy">
                      {r.overdue} overdue
                    </span>
                  ) : null}
                </span>
              </IntentLink>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-sm">
        <Link
          href="/admin/playbook"
          className="inline-flex min-h-11 items-center text-dim underline decoration-ink/20 underline-offset-4 hover:text-ink"
        >
          Edit the playbook and lead times
        </Link>
      </p>
    </div>
  );
}
