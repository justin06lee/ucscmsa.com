import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { Markdown } from "@/components/board/markdown";
import { getGuide } from "../_guides";

type Props = { params: Promise<{ slug: string }> };

export default async function GuidePage({ params }: Props) {
  await requireAdmin();
  const { slug } = await params;
  const guide = await getGuide(db, slug);
  if (!guide) notFound();

  return (
    <article className="max-w-2xl">
      <Link
        href="/admin/playbook"
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-dim hover:text-ink"
      >
        Back to the playbook
      </Link>
      <h1 className="mb-6 text-3xl">{guide.title}</h1>
      <Markdown source={guide.body} />
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
        <span className="text-sm text-dim">
          {guide.editedBy
            ? `Last edited by ${guide.editedBy}, ${formatLocal(guide.updatedAt, "MMM d, yyyy")}`
            : `From the board's notes, ${formatLocal(guide.updatedAt, "MMM d, yyyy")}`}
        </span>
        <Link
          href={`/admin/playbook/${guide.slug}/edit`}
          className="inline-flex min-h-11 items-center rounded-full border border-ink/30 px-5 text-sm font-medium transition-colors hover:bg-ink/5"
        >
          Edit
        </Link>
      </footer>
    </article>
  );
}
