import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { listCards } from "./_cards";
import { listGuides } from "./_guides";
import { PlaybookBoard } from "./playbook-board";

export default async function PlaybookPage() {
  await requireAdmin();
  const [cards, archived, guides] = await Promise.all([listCards(db), listCards(db, true), listGuides(db)]);
  return <div>
    <PlaybookBoard initialCards={cards} archived={archived} />
    <details className="mt-10 border-t border-ink/10 pt-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">Full reference guides</summary>
      <p className="my-2 text-sm text-dim">The board’s original guides, with their edit history.</p>
      <ul>{guides.map((g) => <li key={g.slug}><Link href={`/admin/playbook/${g.slug}`} className="inline-flex min-h-11 items-center text-sm text-burgundy underline underline-offset-4">{g.title}</Link></li>)}</ul>
    </details>
  </div>;
}
