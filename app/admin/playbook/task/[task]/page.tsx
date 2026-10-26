import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { listCards } from "../../_cards";
import { taskBySlug } from "../../_tasks";
import { TaskSteps } from "../../task-steps";

type Props = { params: Promise<{ task: string }> };

export default async function PlaybookTaskPage({ params }: Props) {
  await requireAdmin();
  const task = taskBySlug((await params).task);
  if (!task) notFound();
  const cards = await listCards(db);

  return (
    <article className="max-w-2xl">
      <Link
        href="/admin/playbook"
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-dim hover:text-ink"
      >
        Back to the playbook
      </Link>
      <h1 className="text-3xl">{task.name}</h1>
      <p className="mt-1 text-dim">{task.line}</p>
      {task.tag ? (
        <p className="mt-1 text-sm text-dim">
          Do the steps in{" "}
          <Link href="/admin/playbook/task/every" className="text-burgundy underline underline-offset-4">
            Hold an event
          </Link>{" "}
          too.
        </p>
      ) : null}
      <TaskSteps task={task} initialCards={cards} />
    </article>
  );
}
