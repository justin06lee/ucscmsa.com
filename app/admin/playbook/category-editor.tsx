"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoryRow } from "@/lib/playbook-db";
import {
  addCategoryAction,
  archiveCategoryAction,
  moveCategoryAction,
  updateCategoryAction,
} from "./_actions";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a server action, refreshes the page, and keeps the error to show. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<Result | { ok: true; [k: string]: unknown }>, after?: () => void) {
    setError(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          setError("error" in res ? String(res.error) : "That didn't work. Try again.");
          return;
        }
        after?.();
        router.refresh();
      } catch {
        setError("That didn't work. Try again.");
      }
    });
  }
  return { pending, error, run };
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-burgundy">
      {error}
    </p>
  );
}

function CategoryRowEditor({ c, first, last }: { c: CategoryRow; first: boolean; last: boolean }) {
  const [name, setName] = useState(c.name);
  const [summary, setSummary] = useState(c.summary);
  const { pending, error, run } = useAction();
  const changed = name.trim() !== c.name || summary.trim() !== c.summary;
  return (
    <li className="rounded-xl border border-ink/10 px-4 py-3" data-testid="category-edit-row">
      <label className="block text-sm text-dim" htmlFor={`name-${c.id}`}>
        Name
      </label>
      <Input id={`name-${c.id}`} className="mt-1 text-base" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="mt-3 block text-sm text-dim" htmlFor={`summary-${c.id}`}>
        One line about it
      </label>
      <Input
        id={`summary-${c.id}`}
        className="mt-1 text-base"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {changed ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={pending || !name.trim()}
            onClick={() => run(() => updateCategoryAction({ id: c.id, name, summary }))}
          >
            {pending ? "Saving" : "Save"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={pending || first}
          onClick={() => run(() => moveCategoryAction({ id: c.id, dir: -1 }))}
        >
          Move up
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={pending || last}
          onClick={() => run(() => moveCategoryAction({ id: c.id, dir: 1 }))}
        >
          Move down
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto min-h-11 text-burgundy"
          disabled={pending}
          onClick={() => run(() => archiveCategoryAction({ id: c.id, archived: true }))}
        >
          Remove
        </Button>
      </div>
      <ErrorLine error={error} />
    </li>
  );
}

function AddCategory() {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const { pending, error, run } = useAction();
  return (
    <form
      className="mt-8 border-t border-ink/10 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addCategoryAction({ name, summary }),
          () => {
            setName("");
            setSummary("");
          },
        );
      }}
    >
      <h2 className="text-lg font-medium">Add a category</h2>
      <label className="mt-2 block text-sm text-dim" htmlFor="new-category-name">
        Name
      </label>
      <Input
        id="new-category-name"
        className="mt-1 text-base"
        placeholder="Book a speaker"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="mt-3 block text-sm text-dim" htmlFor="new-category-summary">
        One line about it
      </label>
      <Input
        id="new-category-summary"
        className="mt-1 text-base"
        placeholder="Inviting and hosting a guest speaker"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <Button type="submit" className="mt-3 min-h-11" disabled={pending || !name.trim()}>
        {pending ? "Adding" : "Add category"}
      </Button>
      <ErrorLine error={error} />
    </form>
  );
}

export function CategoryEditor({ categories, removed }: { categories: CategoryRow[]; removed: CategoryRow[] }) {
  const { pending, error, run } = useAction();
  return (
    <div>
      <ul className="space-y-3">
        {categories.map((c, i) => (
          <CategoryRowEditor
            key={`${c.id}-${c.name}-${c.summary}`}
            c={c}
            first={i === 0}
            last={i === categories.length - 1}
          />
        ))}
      </ul>
      <AddCategory />
      {removed.length ? (
        <section className="mt-8 border-t border-ink/10 pt-4">
          <h2 className="text-lg font-medium">Removed categories</h2>
          <ul className="mt-2">
            {removed.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-dim">{c.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => run(() => archiveCategoryAction({ id: c.id, archived: false }))}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
          <ErrorLine error={error} />
        </section>
      ) : null}
    </div>
  );
}
