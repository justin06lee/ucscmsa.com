"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { attempt } from "@/lib/attempt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VisualEditor } from "@/components/board/visual-editor";
import { GUIDE_TITLE_MAX } from "@/lib/markdown";
import { saveGuide } from "../../_actions";

export function GuideEditor({
  slug,
  title,
  body,
}: {
  slug: string;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [validBody, setValidBody] = useState(true);
  const [text, setText] = useState(body);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("body", text);
        setErr(null);
        start(async () => {
          const r = await attempt(() => saveGuide(slug, fd));
          // "Saving…" stays until the guide's page is up.
          if (r.ok) start(() => router.push(`/admin/playbook/${slug}`));
          else start(() => setErr(r.error));
        });
      }}
      className="grid gap-4"
    >
      <label className="grid gap-1">
        <span className="text-sm text-dim">Title</span>
        <Input
          name="title"
          defaultValue={title}
          required
          maxLength={GUIDE_TITLE_MAX}
        />
      </label>
      <div>
        <VisualEditor
          label="Guide text"
          value={text}
          onChange={setText}
          onValidityChange={setValidBody}
          disabled={pending}
        />
      </div>
      {err ? (
        <p role="status" className="text-sm text-burgundy">
          {err}
        </p>
      ) : null}
      <div className="flex items-center gap-5">
        <Button
          type="submit"
          size="lg"
          disabled={pending || !validBody}
          aria-busy={pending}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Link
          href={`/admin/playbook/${slug}`}
          className="inline-flex min-h-11 items-center text-sm text-dim hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
