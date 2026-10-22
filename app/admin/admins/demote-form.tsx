"use client";

import { nominateAdmin } from "@/app/admin/_actions";
import { startTransition as later, useTransition, useState } from "react";
import Link from "next/link";
import { attempt } from "@/lib/attempt";
import { NOMINATION_ERRORS } from "@/app/admin/nominations/actions-row";

export function DemoteForm({
  targetAdminId,
  email,
}: {
  targetAdminId: number;
  email: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <form
      action={(fd) => {
        if (!confirm(`Nominate ${email} for removal?`)) return;
        fd.set("action", "demote");
        fd.set("targetAdminId", String(targetAdminId));
        setErr(null);
        start(async () => {
          const r = await attempt(() => nominateAdmin(fd));
          later(() => (r.ok ? setDone(true) : setErr((r.code && NOMINATION_ERRORS[r.code]) || r.error)));
        });
      }}
    >
      <button
        type="submit"
        disabled={pending || done}
        aria-busy={pending}
        className="inline-flex min-h-11 items-center text-sm text-burgundy transition-opacity hover:underline disabled:opacity-50"
      >
        {pending ? "Nominating…" : done ? "Nominated" : "Nominate removal"}
      </button>
      {done ? (
        <Link href="/admin/nominations" role="status" className="ml-2 inline-flex min-h-11 items-center text-sm text-dim underline">
          See nominations
        </Link>
      ) : null}
      {err && (
        <span role="status" className="ml-2 text-sm text-burgundy">
          {err}
        </span>
      )}
    </form>
  );
}
