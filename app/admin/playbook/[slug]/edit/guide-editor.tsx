"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/board/markdown";
import { GUIDE_BODY_MAX, GUIDE_TITLE_MAX } from "@/lib/markdown";
import { saveGuide } from "../../_actions";

export function GuideEditor({ slug, title, body }: { slug: string; title: string; body: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [text, setText] = useState(body);
  const [err, setErr] = useState<string | null>(null);

  const tabClass = (on: boolean) =>
    `inline-flex min-h-11 items-center px-4 text-sm transition-colors ${
      on ? "font-medium text-ink underline decoration-burgundy decoration-2 underline-offset-[6px]" : "text-dim hover:text-ink"
    }`;

  return (
    <form
      action={(fd) => {
        setErr(null);
        start(async () => {
          const r = await saveGuide(slug, fd);
          if (r.ok) router.push(`/admin/playbook/${slug}`);
          else setErr(r.error);
        });
      }}
      className="grid gap-4"
    >
      <label className="grid gap-1">
        <span className="text-sm text-dim">Title</span>
        <Input name="title" defaultValue={title} required maxLength={GUIDE_TITLE_MAX} />
      </label>
      <div>
        <div role="tablist" aria-label="Guide text" className="-ml-4 flex">
          <button type="button" role="tab" aria-selected={tab === "write"} className={tabClass(tab === "write")} onClick={() => setTab("write")}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} className={tabClass(tab === "preview")} onClick={() => setTab("preview")}>
            Preview
          </button>
        </div>
        {/* The textarea stays mounted (hidden in preview) so it is always submitted. */}
        <div hidden={tab !== "write"}>
          <Textarea
            name="body"
            aria-label="Guide text, in markdown"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            maxLength={GUIDE_BODY_MAX}
            className="mt-2 font-mono text-[16px] leading-relaxed"
          />
          <p className="mt-2 text-sm text-dim">
            ## heading · 1. step · - point · **bold** · [text](https://link) · TODO stays highlighted
          </p>
        </div>
        {tab === "preview" ? (
          <div className="mt-2 min-h-40 rounded-md border border-ink/15 px-4 py-4">
            {text.trim() ? <Markdown source={text} /> : <p className="text-dim">Nothing to preview.</p>}
          </div>
        ) : null}
      </div>
      {err ? (
        <p role="alert" className="text-sm text-burgundy">
          {err}
        </p>
      ) : null}
      <div className="flex items-center gap-5">
        <Button type="submit" size="lg" disabled={pending}>
          Save
        </Button>
        <Link href={`/admin/playbook/${slug}`} className="inline-flex min-h-11 items-center text-sm text-dim hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
