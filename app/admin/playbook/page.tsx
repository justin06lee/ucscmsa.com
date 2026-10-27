import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { listCategories } from "@/lib/playbook-db";
import { CategoryEditor } from "./category-editor";

export default async function PlaybookPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const editing = (await searchParams).edit === "1";
  const [categories, removed] = await Promise.all([
    listCategories(db),
    editing ? listCategories(db, { archived: true }) : Promise.resolve([]),
  ]);
  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl">Playbook</h1>
        <Link
          href={editing ? "/admin/playbook" : "/admin/playbook?edit=1"}
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 text-sm text-burgundy underline decoration-burgundy/30 underline-offset-4"
        >
          {editing ? "Done" : "Edit"}
        </Link>
      </div>
      <p className="mb-6 mt-1 text-dim">
        {editing ? "Rename, reorder, add or remove categories." : "How to do each part of planning an event."}
      </p>
      {editing ? (
        <CategoryEditor categories={categories} removed={removed} />
      ) : (
        <>
          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/playbook/${c.slug}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/25"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{c.name}</span>
                    {c.summary ? <span className="block text-sm text-dim">{c.summary}</span> : null}
                  </span>
                  <span className="shrink-0 text-sm text-dim tabular-nums">
                    {c.stepCount ? `${c.stepCount} ${c.stepCount === 1 ? "step" : "steps"}` : "No steps yet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {categories.length === 0 ? <p className="text-dim">No categories yet. Tap Edit to add one.</p> : null}
          <p className="mt-8 border-t border-ink/10 pt-4 text-sm text-dim">
            Planning a specific event?{" "}
            <Link href="/admin/plan" className="text-burgundy underline decoration-burgundy/30 underline-offset-4">
              Make a timeline
            </Link>{" "}
            with dates for every step.
          </p>
        </>
      )}
    </div>
  );
}
