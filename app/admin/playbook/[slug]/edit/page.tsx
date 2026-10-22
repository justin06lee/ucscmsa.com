import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { getGuide, getVersions } from "../../_guides";
import { GuideEditor } from "./guide-editor";
import { VersionList } from "./version-list";

type Props = { params: Promise<{ slug: string }> };

export default async function EditGuidePage({ params }: Props) {
  await requireAdmin();
  const { slug } = await params;
  const guide = await getGuide(db, slug);
  if (!guide) notFound();
  const versions = await getVersions(db, slug);

  return (
    <div className="max-w-2xl">
      <Link
        href={`/admin/playbook/${slug}`}
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-dim hover:text-ink"
      >
        <ChevronLeft size={16} aria-hidden />
        {guide.title}
      </Link>
      <h1 className="mb-6 text-3xl">Edit guide</h1>
      <GuideEditor slug={slug} title={guide.title} body={guide.body} />
      {versions.length ? (
        <VersionList
          slug={slug}
          versions={versions.map((v) => ({
            id: v.id,
            title: v.title,
            body: v.body,
            when: formatLocal(v.createdAt, "MMM d, yyyy, h:mm a"),
            by: v.editedBy ?? "the board's notes",
          }))}
        />
      ) : null}
    </div>
  );
}
