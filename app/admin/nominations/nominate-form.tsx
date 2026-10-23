"use client";

import { attempt } from "@/lib/attempt";
import { NOMINATION_ERRORS } from "./actions-row";
import { nominateAdmin } from "@/app/admin/_actions";
import { startTransition as later, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
          const r = await attempt(() => nominateAdmin(fd));
          later(() => {
            if (r.ok) setOk(true);
            else setErr((r.code && NOMINATION_ERRORS[r.code]) || r.error);
          });
        });
      }}
      className="flex flex-wrap items-end gap-4"
    >
      <label className="grid w-full gap-1 sm:w-auto sm:min-w-72">
        <span className="text-sm text-dim">Nominee UCSC email</span>
        <Input
          name="nomineeEmail"
          type="email"
          required
          placeholder="student@ucsc.edu"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? "Creating…" : "Create nomination"}
        </Button>
        {err && (
          <span role="status" className="text-sm text-burgundy">
            {err}
          </span>
        )}
        {ok && <span role="status" className="text-sm text-dim">Nomination created.</span>}
      </div>
    </form>
  );
}
