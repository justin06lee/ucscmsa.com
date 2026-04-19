"use client";

import { nominateAdmin } from "@/app/admin/_actions";
import { useTransition, useState } from "react";

export function DemoteForm({
  targetAdminId,
  email,
}: {
  targetAdminId: number;
  email: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      action={(fd) => {
        if (!confirm(`Nominate ${email} for removal?`)) return;
        fd.set("action", "demote");
        fd.set("targetAdminId", String(targetAdminId));
        start(async () => {
          const r = await nominateAdmin(fd);
          if (!r.ok) setErr(r.error ?? "failed");
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-burgundy hover:underline disabled:opacity-50"
      >
        Nominate removal
      </button>
      {err && <span className="ml-2 text-xs text-burgundy">{err}</span>}
    </form>
  );
}
