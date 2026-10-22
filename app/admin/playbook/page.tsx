import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { parseMarkdown, plainText } from "@/lib/markdown";
import { listGuides } from "./_guides";

/** The guide's first line of prose or first step, for the list. */
function summary(body: string): string {
  for (const b of parseMarkdown(body)) {
    if (b.t === "para") return plainText(b.c);
    if (b.t === "list" && b.items[0]) return plainText(b.items[0].c);
  }
  return "";
}

export default async function PlaybookPage() {
  await requireAdmin();
  const guides = await listGuides(db);
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl">Playbook</h1>
      <p className="mt-2 text-dim">Everything it takes to run an event, one guide per task.</p>
      <ul className="mt-6 flex flex-col gap-3">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/admin/playbook/${g.slug}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/25"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{g.title}</span>
                <span className="line-clamp-1 text-sm text-dim">{summary(g.body)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
