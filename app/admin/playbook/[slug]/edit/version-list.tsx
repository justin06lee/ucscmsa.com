"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/board/markdown";
import { restoreGuide } from "../../_actions";

type Version = { id: number; title: string; body: string; when: string; by: string };

export function VersionList({ slug, versions }: { slug: string; versions: Version[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="mt-12 border-t border-ink/10 pt-6" aria-labelledby="versions-heading">
      <h2 id="versions-heading" className="text-lg">
        Earlier versions
      </h2>
      <p className="mt-1 text-sm text-dim">Restoring one saves it as the newest version, so it can be undone too.</p>
      {err ? (
        <p role="alert" className="mt-2 text-sm text-burgundy">
          {err}
        </p>
      ) : null}
      <ul className="mt-4 flex flex-col gap-2">
        {versions.map((v) => (
          <li key={v.id} className="rounded-xl border border-ink/10 px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="text-sm">
                {v.when} <span className="text-dim">· {v.by}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  start(async () => {
                    const r = await restoreGuide(slug, v.id);
                    if (r.ok) router.push(`/admin/playbook/${slug}`);
                    else setErr("Couldn't restore that version. Try again.");
                  });
                }}
              >
                Restore
              </Button>
            </div>
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-dim hover:text-ink">
                Show this version
              </summary>
              <div className="mb-3 border-l-2 border-ink/10 pl-4">
                <p className="mb-2 font-medium">{v.title}</p>
                <Markdown source={v.body} className="text-sm" />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
