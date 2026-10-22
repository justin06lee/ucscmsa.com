"use client";

import { startTransition, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FlyerThumb } from "@/components/flyer-thumb";
import { removeEventImage, setEventImages, uploadEventImages } from "@/app/admin/_actions";
import { EVENT_IMAGES_MAX, type EventImage } from "@/lib/event-image";
import { toFlyers } from "@/lib/event-media";
import { attempt } from "@/lib/attempt";

// The server-action body limit in next.config.ts; a bigger upload never
// reaches the action, so it's refused here with a readable message.
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024 - 64 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

type Result = { ok: true; images: EventImage[] } | { ok: false; error: string };

/**
 * The event's flyers on its edit page: add, replace, reorder and remove.
 * Each change saves at once, apart from the event form's Save. A move or a
 * removal shows before the server answers and comes back if it fails.
 */
export function FlyerEditor({ eventId, initial }: { eventId: string; initial: EventImage[] }) {
  const [images, setImages] = useState(initial);
  const [shown, show] = useOptimistic(images);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);

  function run(action: () => Promise<Result>, done: string, expected?: EventImage[]) {
    setError(null);
    setStatus("");
    start(async () => {
      if (expected) show(expected);
      const result = await attempt(action);
      startTransition(() => {
        if (result.ok) {
          setImages(result.value.images);
          setStatus(done);
        } else setError(result.error);
      });
    });
  }

  function upload(files: FileList | null, replaceId: string | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const total = list.reduce((n, f) => n + f.size, 0);
    if (total > UPLOAD_MAX_BYTES) {
      setStatus("");
      setError(
        list.length > 1
          ? "Those images come to more than 4 MB. Add them one at a time, or use smaller copies."
          : `${list[0].name} is more than 4 MB. Use a smaller copy, such as a screenshot of it.`,
      );
      return;
    }
    const fd = new FormData();
    for (const f of list) fd.append("image", f);
    if (replaceId) fd.set("replaceId", replaceId);
    run(
      () => uploadEventImages(eventId, fd),
      replaceId ? "Flyer replaced." : list.length > 1 ? "Flyers added." : "Flyer added.",
    );
  }

  function move(from: number, to: number) {
    const next = [...shown];
    const [img] = next.splice(from, 1);
    next.splice(to, 0, img);
    run(
      () => setEventImages(eventId, next.map((i) => ({ id: i.id }))),
      `Flyer moved to position ${to + 1}.`,
      next,
    );
  }

  function remove(img: EventImage, n: number) {
    if (!window.confirm(`Remove flyer ${n}? It is deleted, not hidden.`)) return;
    run(() => removeEventImage(eventId, img.id), "Flyer removed.", shown.filter((i) => i.id !== img.id));
  }

  return (
    <section aria-labelledby="flyers-heading" className="mt-8 grid max-w-xl gap-3 rounded-md border border-ink/20 p-4">
      <h2 id="flyers-heading" className="text-xl">Flyers</h2>
      <p className="text-xs text-dim/80">
        Changes here are saved straight away. The first flyer is the one on
        cards. JPEG, PNG, WebP or GIF, under 4 MB each.
      </p>
      {shown.length === 0 ? (
        <p className="text-sm text-dim">No flyers yet.</p>
      ) : (
        <ol className="grid gap-3">
          {shown.map((img, i) => (
            <li key={img.id} className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-3">
              <FlyerThumb image={toFlyers([img], "")[0].card} width={64} />
              <div className="grid gap-1.5">
                <span className="text-sm">
                  Flyer {i + 1}
                  {i === 0 && shown.length > 1 ? <span className="text-dim"> · on cards</span> : null}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    aria-label={`Move flyer ${i + 1} up`}
                    disabled={pending || i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    Up
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    aria-label={`Move flyer ${i + 1} down`}
                    disabled={pending || i === shown.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    Down
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    aria-label={`Replace flyer ${i + 1}`}
                    disabled={pending}
                    onClick={() => {
                      replacing.current = img.id;
                      replaceInput.current?.click();
                    }}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="danger-outline"
                    className="min-h-11"
                    aria-label={`Remove flyer ${i + 1}`}
                    disabled={pending}
                    onClick={() => remove(img, i + 1)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {shown.length < EVENT_IMAGES_MAX && (
        <Button
          variant="outline"
          className="min-h-11 justify-self-start"
          disabled={pending}
          onClick={() => addInput.current?.click()}
        >
          {shown.length ? "Add flyers" : "Add a flyer"}
        </Button>
      )}
      <input
        ref={addInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        aria-label="Add flyers"
        onChange={(e) => {
          upload(e.currentTarget.files, null);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label="Replacement flyer"
        onChange={(e) => {
          upload(e.currentTarget.files, replacing.current);
          e.currentTarget.value = "";
        }}
      />
      {error ? (
        <p role="status" className="text-sm text-burgundy">
          {error}
        </p>
      ) : null}
      <p role="status" className="text-sm text-dim empty:hidden">
        {pending ? "Saving…" : status}
      </p>
    </section>
  );
}
