import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { PLAN_TAGS, tagLabel } from "@/lib/planning";
import { loadTemplates } from "../_plan";
import { LeadTimesForm } from "./lead-times-form";

export default async function LeadTimesPage() {
  await requireAdmin();
  const templates = await loadTemplates(db);
  // Every event's tasks first, then each tag in the form's order.
  const order: (string | null)[] = [null, ...PLAN_TAGS.map((t) => t.id)];
  const groups = order
    .map((tag) => ({ tag, label: tagLabel(tag), templates: templates.filter((t) => t.tag === tag) }))
    .filter((g) => g.templates.length > 0);

  return (
    <div className="max-w-xl">
      <Link
        href="/admin/plan"
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-dim hover:text-ink"
      >
        <ChevronLeft size={16} aria-hidden />
        Planning
      </Link>
      <h1 className="text-3xl">Lead times</h1>
      <p className="mt-2 text-dim">
        How many days before the event each task is due. A change moves the open tasks of every planned event;
        done tasks stay as they are.
      </p>
      <LeadTimesForm groups={groups} />
    </div>
  );
}
