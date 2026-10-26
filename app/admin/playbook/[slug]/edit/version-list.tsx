"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { attempt } from "@/lib/attempt";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/board/markdown";
import { restoreGuide } from "../../_actions";

type Version = { id: number; title: string; body: string; when: string; by: string };

export function VersionList({ slug, versions }: { slug: string; versions: Version[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [restoring, setRestoring] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="mt-12 border-t border-ink/10 pt-6" aria-labelledby="versions-heading">
      <h2 id="versions-heading" className="text-lg">
        Earlier versions
      </h2>
      <p className="mt-1 text-sm text-dim">Restoring one saves it as the newest version, so it can be undone too.</p>
      {err ? (
        <p role="status" className="mt-2 text-sm text-burgundy">
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
                aria-busy={pending && restoring === v.id}
                onClick={() => {
                  setErr(null);
                  setRestoring(v.id);
                  start(async () => {
                    const r = await attempt(() => restoreGuide(slug, v.id));
                    if (r.ok) start(() => router.push(`/admin/playbook/${slug}`));
                    else start(() => setErr(r.error));
                  });
                }}
              >
                {pending && restoring === v.id ? "Restoring…" : "Restore"}
              </Button>
            </div>
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-dim hover:text-ink">
                Show this version
              </summary>
              <div className="mb-3 border-l-2 border-ink/10 pl-4">
                <p className="mb-2 font-medium">{v.title}</p>
                <Markdown source={v.body} className="text-sm" compactLinks />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
