"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TimelineChatTurn } from "@/lib/db/schema";
import { sendPlanMessage } from "./_actions";

/** Describe the event, answer at most a couple of questions, land on the timeline. */
export function PlanChat() {
  const router = useRouter();
  const [chat, setChat] = useState<TimelineChatTurn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const busy = pending || making;
  const asked = chat.length > 0;

  function send() {
    const said = text.trim();
    if (!said || busy) return;
    const next: TimelineChatTurn[] = [...chat, { role: "user", text: said }];
    setChat(next);
    setText("");
    setError(null);
    start(async () => {
      try {
        const res = await sendPlanMessage({ chat: next });
        if (!res.ok) {
          setError(res.error);
          setChat(chat);
          setText(said);
          return;
        }
        if (res.type === "question") {
          setChat([...next, { role: "assistant", text: res.question }]);
          box.current?.focus();
          return;
        }
        setMaking(true);
        router.push(`/admin/plan/${res.id}`);
      } catch {
        setError("That didn't go through. Try again.");
        setChat(chat);
        setText(said);
      }
    });
  }

  return (
    <div data-testid="plan-chat">
      {asked ? (
        <ol className="mb-4 space-y-3" aria-live="polite">
          {chat.map((t, i) => (
            <li key={i} className={t.role === "user" ? "flex justify-end" : "flex"}>
              <p
                className={
                  t.role === "user"
                    ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink/5 px-4 py-2"
                    : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-ink/10 px-4 py-2"
                }
              >
                {t.text}
              </p>
            </li>
          ))}
          {busy ? (
            <li className="flex">
              <p role="status" className="rounded-2xl rounded-bl-md border border-ink/10 px-4 py-2 text-dim">
                {making ? "Opening your timeline" : "Making your timeline"}
              </p>
            </li>
          ) : null}
        </ol>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="plan-message" className={asked ? "sr-only" : "block font-medium"}>
          {asked ? "Your answer" : "What are you planning?"}
        </label>
        <Textarea
          id="plan-message"
          ref={box}
          rows={asked ? 2 : 4}
          className="mt-2 text-base"
          placeholder={asked ? "Your answer" : "A halaqa with pizza for about 40 people on Nov 20, in a classroom"}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        {error ? (
          <p role="alert" className="mt-2 text-sm text-burgundy">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="mt-3 min-h-11 w-full sm:w-auto" disabled={busy || !text.trim()}>
          {busy ? "Making your timeline" : asked ? "Send" : "Make my timeline"}
        </Button>
      </form>
    </div>
  );
}
