"use client";
import Link from "next/link";
import { GripVertical, Plus } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { CardText } from "./card-text";
import { tagLabel } from "@/lib/planning";
import { leadLabel, type PlaybookCard } from "@/lib/playbook";
import { parseMarkdown, plainText } from "@/lib/markdown";
import { attempt } from "@/lib/attempt";
import {
  loadCardHistory,
  movePlaybookCards,
  restorePlaybookCard,
} from "./_card-actions";
import { CardEditor } from "./card-editor";
import styles from "./playbook-board.module.css";

function cardSummary(body: string): string {
  for (const block of parseMarkdown(body)) {
    if (block.t === "para") return plainText(block.c);
    if (block.t === "list" && block.items[0])
      return plainText(block.items[0].c);
  }
  return "Add the details for this step.";
}

type Archived = PlaybookCard & { archivedAt: Date | null };
export function PlaybookBoard({
  initialCards,
  archived,
}: {
  initialCards: PlaybookCard[];
  archived: Archived[];
}) {
  const [cards, setCards] = useState(initialCards);
  // Accept action refreshes without remounting the keyboard-focused handle.
  const [previousCards, setPreviousCards] = useState(initialCards);
  if (initialCards !== previousCards) {
    setPreviousCards(initialCards);
    setCards(initialCards);
  }
  const cardsRef = useRef(cards);
  useLayoutEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    original: PlaybookCard[];
    ghost: HTMLElement | null;
    pointer: number;
    source: HTMLElement;
    slots: { left: number; right: number; top: number; bottom: number }[];
  } | null>(null);
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    for (const el of grid.current?.querySelectorAll<HTMLElement>(
      "[data-card]",
    ) ?? []) {
      const id = el.dataset.card!;
      const r = el.getBoundingClientRect();
      const old = rects.current.get(id);
      if (
        old &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches &&
        (old.x !== r.x || old.y !== r.y)
      ) {
        el.animate(
          [
            { transform: `translate(${old.x - r.x}px, ${old.y - r.y}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }
      next.set(id, r);
    }
    rects.current = next;
  }, [cards]);
  useLayoutEffect(
    () => () => {
      drag.current?.ghost?.remove();
    },
    [],
  );
  function persist(next: PlaybookCard[], previous: PlaybookCard[]) {
    if (next.every((c, i) => c.id === previous[i].id)) return;
    setError("");
    setStatus("Saving order…");
    start(async () => {
      const r = await attempt(() =>
        movePlaybookCards(
          next.map((c) => c.id),
          previous.map((c) => c.id),
        ),
      );
      if (!r.ok) {
        setCards(previous);
        setError(r.error);
        setStatus("");
      } else setStatus("Order saved.");
    });
  }
  function move(id: string, target: string) {
    const next = [...cardsRef.current];
    const from = next.findIndex((c) => c.id === id);
    const to = next.findIndex((c) => c.id === target);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    setCards(next);
    cardsRef.current = next;
  }
  function endDrag(cancel = false) {
    const d = drag.current;
    if (!d) return;
    d.ghost?.remove();
    drag.current = null;
    setDragged(null);
    if (cancel) {
      setCards(d.original);
      cardsRef.current = d.original;
      setStatus("Move cancelled.");
    } else persist(cardsRef.current, d.original);
  }
  function pointerMove(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (!d.ghost && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    if (!d.ghost) {
      const source = d.source;
      const r = source.getBoundingClientRect();
      const ghost = source.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("id");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      Object.assign(ghost.style, {
        position: "fixed",
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        margin: "0",
        zIndex: "50",
        pointerEvents: "none",
        boxShadow: "0 10px 30px #15131220",
        opacity: ".96",
      });
      document.body.append(ghost);
      d.ghost = ghost;
      setDragged(d.id);
    }
    d.ghost.style.transform = `translate(${e.clientX - d.x}px, ${e.clientY - d.y}px)`;
    if (e.clientY < 90) window.scrollBy(0, -18);
    else if (e.clientY > innerHeight - 90) window.scrollBy(0, 18);
    // Stable slots prevent an animating neighbor from swapping the card back.
    const x = e.clientX + window.scrollX;
    const y = e.clientY + window.scrollY;
    for (let i = 0; i < d.slots.length; i++) {
      const r = d.slots[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        move(d.id, cardsRef.current[i].id);
        break;
      }
    }
  }
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Playbook</h1>
          <p className="mt-2 max-w-lg text-dim">
            The steps behind a good event. Shape them for your board.
          </p>
        </div>
        <Button
          className="min-h-11"
          onClick={() => {
            setEditing("new");
            setError("");
          }}
          disabled={pending || editing !== null}
        >
          <Plus size={16} aria-hidden />
          Add step
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 text-sm text-dim">
        <p>Click text to edit. Drag the handle to move a step.</p>
        <Link
          href="/admin/plan"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Plan an event
        </Link>
      </div>
      <p role="status" aria-live="polite" className="min-h-6 text-sm text-dim">
        {pending ? "Saving…" : status}
      </p>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-burgundy">
          {error}
        </p>
      ) : null}
      {editing === "new" ? (
        <div className="mb-5 max-w-xl rounded-2xl border border-ink/20 bg-white/35 p-5">
          <CardEditor cards={cards} onClose={() => setEditing(null)} />
        </div>
      ) : null}
      <p id="move-help" className="sr-only">
        Drag to move. With the handle focused, use arrow keys to move one
        position. Escape cancels a drag.
      </p>
      <div
        ref={grid}
        className="grid items-start gap-4 md:grid-cols-2"
        aria-label="Playbook steps"
        onPointerMove={pointerMove}
        onPointerUp={() => endDrag()}
        onPointerCancel={() => endDrag(true)}
        onLostPointerCapture={(e) => {
          if (e.target === e.currentTarget && drag.current) endDrag(true);
        }}
      >
        {cards.map((c) => (
          <article
            id={`step-${c.id}`}
            data-card={c.id}
            key={c.id}
            className={`${styles.card} min-w-0 rounded-2xl border border-ink/15 bg-white/30 p-5 ${editing === c.id ? "md:col-span-2 md:max-w-2xl" : ""}`}
            style={{ opacity: dragged === c.id ? 0.25 : 1 }}
          >
            {editing === c.id ? (
              <CardEditor
                card={c}
                cards={cards}
                onClose={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="-mr-2 -mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-burgundy">
                    {leadLabel(c.daysBefore)}
                  </span>
                  <button
                    type="button"
                    className="flex size-11 shrink-0 touch-none items-center justify-center rounded-lg text-dim/70 hover:bg-ink/5 active:cursor-grabbing"
                    aria-label={`Move ${c.title}`}
                    aria-describedby="move-help"
                    disabled={pending || editing !== null}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        endDrag(true);
                        return;
                      }
                      if (
                        ![
                          "ArrowUp",
                          "ArrowDown",
                          "ArrowLeft",
                          "ArrowRight",
                        ].includes(e.key)
                      )
                        return;
                      e.preventDefault();
                      const previous = cardsRef.current;
                      const i = previous.findIndex((x) => x.id === c.id);
                      const target =
                        previous[
                          i +
                            (["ArrowUp", "ArrowLeft"].includes(e.key) ? -1 : 1)
                        ];
                      if (target) {
                        const handle = e.currentTarget;
                        move(c.id, target.id);
                        requestAnimationFrame(() => handle.focus());
                        persist(cardsRef.current, previous);
                      }
                    }}
                    // Moving a captured handle releases capture; the board stays put.
                    onPointerDown={(e) => {
                      if (e.button !== 0 || drag.current) return;
                      grid.current!.setPointerCapture(e.pointerId);
                      drag.current = {
                        id: c.id,
                        x: e.clientX,
                        y: e.clientY,
                        original: cardsRef.current,
                        ghost: null,
                        pointer: e.pointerId,
                        source:
                          e.currentTarget.closest<HTMLElement>("[data-card]")!,
                        slots: Array.from(
                          grid.current!.querySelectorAll<HTMLElement>(
                            "[data-card]",
                          ),
                          (el) => {
                            const r = el.getBoundingClientRect();
                            return {
                              left: r.left + scrollX,
                              right: r.right + scrollX,
                              top: r.top + scrollY,
                              bottom: r.bottom + scrollY,
                            };
                          },
                        ),
                      };
                    }}
                  >
                    <GripVertical size={18} aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={pending || editing !== null}
                  onClick={() => setEditing(c.id)}
                  className="block min-h-11 w-full text-left text-base font-medium leading-snug break-words hover:text-burgundy"
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  disabled={pending || editing !== null}
                  onClick={() => setEditing(c.id)}
                  aria-label={`Edit text for ${c.title}`}
                  className="mt-2 block min-h-11 w-full text-left text-sm leading-relaxed text-dim"
                >
                  <span className="line-clamp-3 break-words [overflow-wrap:anywhere]">
                    {cardSummary(c.body)}
                  </span>
                </button>
                <div className="mt-4 border-t border-ink/10 pt-3 text-xs text-dim">
                  <span>{tagLabel(c.tag)}</span>
                  {c.dependencies.length ? (
                    <p className="mt-2 leading-relaxed">
                      After:{" "}
                      {c.dependencies
                        .map(
                          (id) =>
                            cards.find((p) => p.id === id)?.title ??
                            "Deleted step",
                        )
                        .join("; ")}
                    </p>
                  ) : null}
                </div>
                {c.body ? (
                  <details className="mt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">
                      Read step
                    </summary>
                    <CardText source={c.body} />
                  </details>
                ) : null}
              </>
            )}
          </article>
        ))}
      </div>
      {cards.length === 0 ? (
        <p className="py-12 text-center text-dim">
          Add your first step to start the playbook.
        </p>
      ) : null}
      {archived.length ? (
        <details className="mt-8 border-t border-ink/10 pt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">
            Deleted steps · {archived.length}
          </summary>
          {archived.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 py-2"
            >
              <p className="text-sm">{c.title}</p>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={() => {
                  setError("");
                  start(async () => {
                    const history = await attempt(() => loadCardHistory(c.id));
                    if (!history.ok) {
                      setError(history.error);
                      return;
                    }
                    if (!history.value.ok || !history.value.versions[0]) {
                      setError("No saved version was found.");
                      return;
                    }
                    const versionId = history.value.versions[0].id;
                    const r = await attempt(() =>
                      restorePlaybookCard(c.id, versionId, c.revision),
                    );
                    if (!r.ok) setError(r.error);
                  });
                }}
              >
                Restore step
              </Button>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}
