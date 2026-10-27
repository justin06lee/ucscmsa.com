import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { getCategory } from "@/lib/playbook-db";
import { FormLink, StepText, timingLabel } from "@/components/playbook/step-text";
import { StepEditor } from "./step-editor";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireAdmin();
  const [{ category: slug }, { edit }] = await Promise.all([params, searchParams]);
  const found = await getCategory(db, slug);
  if (!found) notFound();
  const { category, steps, archivedSteps } = found;
  const editing = edit === "1";
  const base = `/admin/playbook/${category.slug}`;
  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/playbook"
        className="inline-flex min-h-11 items-center text-sm text-burgundy underline decoration-burgundy/30 underline-offset-4"
      >
        All categories
      </Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl">{category.name}</h1>
        <Link
          href={editing ? base : `${base}?edit=1`}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 text-sm text-burgundy underline decoration-burgundy/30 underline-offset-4"
        >
          {editing ? "Done" : "Edit"}
        </Link>
      </div>
      {category.summary ? <p className="mt-1 text-dim">{category.summary}</p> : null}
      <div className="mt-6">
        {editing ? (
          <StepEditor categoryId={category.id} steps={steps} removed={archivedSteps} />
        ) : steps.length ? (
          <ol className="space-y-6">
            {steps.map((s, i) => {
              const timing = timingLabel(s.leadDays);
              return (
                <li key={s.id} className="flex gap-3" data-testid="playbook-step">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-ink/20 text-sm tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-medium leading-snug">{s.title}</h2>
                    {s.whenNote || timing ? (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-dim">
                        {s.whenNote ? <span className="italic">{s.whenNote}</span> : null}
                        {timing ? <span>{timing}</span> : null}
                      </p>
                    ) : null}
                    <StepText text={s.body} className="mt-2" />
                    {s.formUrl ? (
                      <div className="mt-3">
                        <FormLink label={s.formLabel} url={s.formUrl} />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-dim">No steps yet. Tap Edit to add the first one.</p>
        )}
      </div>
    </div>
  );
}
