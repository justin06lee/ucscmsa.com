import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { listCards } from "./_cards";
import { listGuides } from "./_guides";
import { PLAYBOOK_TASKS, stepsFor } from "./_tasks";
import { DeletedSteps } from "./deleted-steps";

export default async function PlaybookPage() {
  await requireAdmin();
  const [cards, archived, guides] = await Promise.all([listCards(db), listCards(db, true), listGuides(db)]);
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl">Playbook</h1>
      <p className="mb-6 mt-1 text-dim">What are you trying to do?</p>
      <ul className="space-y-2">
        {PLAYBOOK_TASKS.map((t) => {
          const count = stepsFor(cards, t).length;
          return (
            <li key={t.slug}>
              <Link
                href={`/admin/playbook/task/${t.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/25"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{t.name}</span>
                  <span className="block text-sm text-dim">{t.line}</span>
                </span>
                <span className="shrink-0 text-sm text-dim tabular-nums">
                  {count ? `${count} ${count === 1 ? "step" : "steps"}` : "No steps yet"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <DeletedSteps archived={archived} />
      <details className="mt-8 border-t border-ink/10 pt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">Full reference guides</summary>
        <p className="my-2 text-sm text-dim">The original guides the steps come from, with their edit history.</p>
        <ul>
          {guides.map((g) => (
            <li key={g.slug}>
              <Link href={`/admin/playbook/${g.slug}`} className="inline-flex min-h-11 items-center text-sm text-burgundy underline underline-offset-4">
                {g.title}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
