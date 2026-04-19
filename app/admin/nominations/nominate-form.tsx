"use client";

import { nominateAdmin } from "@/app/admin/_actions";
import { useState, useTransition } from "react";

export function NominateForm() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <form
      action={(fd) => {
        setErr(null);
        setOk(false);
        fd.set("action", "promote");
        start(async () => {
          const r = await nominateAdmin(fd);
          if (r.ok) setOk(true);
          else setErr(r.error ?? "failed");
        });
      }}
      className="flex items-end gap-2 flex-wrap"
    >
      <label className="grid gap-1">
        <span className="text-sm text-dim">Nominee UCSC email</span>
        <input
          name="nomineeEmail"
          type="email"
          required
          placeholder="student@ucsc.edu"
          className="border border-ink/20 rounded px-3 py-2 bg-paper"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-full bg-ink text-paper hover:bg-burgundy disabled:opacity-50"
      >
        Create nomination
      </button>
      {err && <div className="text-burgundy text-sm">{err}</div>}
      {ok && <div className="text-sm text-dim">Nomination created.</div>}
    </form>
  );
}
