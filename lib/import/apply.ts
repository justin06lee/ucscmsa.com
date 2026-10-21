import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { eventCancellations, eventImportTombstones, events } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";
import { eventInstants, localInstant } from "@/lib/event-rules";
import { expandEvents } from "@/lib/rrule-lite";
import { endOfLocalDayUtc, startOfLocalDayUtc, toLocalYmd } from "@/lib/time";
import type { ImportEvent, ImportOperation, ImportRequest } from "./schema";

export type ImportStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "cancelled"
  | "restored"
  | "conflict"
  | "not_found";

export type ImportResult = {
  index: number;
  op: ImportOperation["op"];
  sourceId: string;
  status: ImportStatus;
  eventId?: string;
  occurrenceDate?: string;
  reason?: "edited_by_admin" | "deleted_by_admin" | "no_occurrence_on_date";
  dryRun?: true;
};

type ImportOutcome = { results: ImportResult[]; changedEventIds: string[] };

// Thrown at the end of a dry run so db.transaction rolls everything back.
class DryRunRollback extends Error {
  constructor(readonly outcome: ImportOutcome) {
    super("dry run");
  }
}

type EventRow = typeof events.$inferSelect;

// The event columns an import controls. Everything else (id, source, the
// timestamps, createdByAdminId) is bookkeeping.
function toEventValues(e: ImportEvent, sourceRef: string | undefined) {
  const freq = e.recurrence?.freq ?? null;
  return {
    title: e.title,
    description: e.description ?? "",
    location: e.location ?? "",
    ...eventInstants(e),
    recurrenceFreq: freq,
    recurrenceByWeekday:
      freq === "weekly" && e.recurrence?.byWeekday ? e.recurrence.byWeekday.join(",") : null,
    recurrenceInterval: e.recurrence?.interval ?? 1,
    // Same convention as the admin form: the until date is inclusive.
    recurrenceUntil: e.recurrence?.until ? localInstant(e.recurrence.until, "23:59") : null,
    sourceRef: sourceRef ?? null,
  };
}

type EventValues = ReturnType<typeof toEventValues>;

const time = (d: Date | null) => d?.getTime() ?? null;

function sameContent(row: EventRow, v: EventValues): boolean {
  return (
    row.title === v.title &&
    row.description === v.description &&
    row.location === v.location &&
    row.timing === v.timing &&
    time(row.startTime) === time(v.startTime) &&
    time(row.endTime) === time(v.endTime) &&
    row.recurrenceFreq === v.recurrenceFreq &&
    (row.recurrenceByWeekday ?? null) === v.recurrenceByWeekday &&
    row.recurrenceInterval === v.recurrenceInterval &&
    time(row.recurrenceUntil) === time(v.recurrenceUntil) &&
    (row.sourceRef ?? null) === v.sourceRef
  );
}

function hasOccurrenceOn(row: EventRow, ymd: string): boolean {
  const occurrences = expandEvents(
    [{ ...row, cancellations: [] }],
    startOfLocalDayUtc(ymd),
    new Date(endOfLocalDayUtc(ymd).getTime() + 1)
  );
  return occurrences.some((o) => toLocalYmd(o.occurrenceStart) === ymd);
}

/**
 * Applies a validated import request in one write transaction, so a batch
 * lands whole or not at all. Conflicts and unknown ids are per-item results,
 * not errors. Policy (docs/import.md):
 *  - upsert creates, updates or leaves alone; it never un-cancels.
 *  - an event an admin edited is not overwritten, and one an admin deleted is
 *    not re-created, unless the operation sets override.
 *  - cancel/restore without occurrenceDate act on the whole event; with it,
 *    on that one occurrence.
 * With dryRun the batch runs the same way and is then rolled back: every
 * result is marked dryRun and no event ids are reported as changed.
 */
export async function applyImport(
  db: DB,
  request: ImportRequest,
  now: Date = new Date()
): Promise<ImportOutcome> {
  try {
    return await runImport(db, request, now);
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
    return {
      results: err.outcome.results.map((r) => ({ ...r, dryRun: true })),
      changedEventIds: [],
    };
  }
}

async function runImport(db: DB, request: ImportRequest, now: Date): Promise<ImportOutcome> {
  const { source } = request;
  return db.transaction(async (tx) => {
    const results: ImportResult[] = [];
    const changed = new Set<string>();

    const find = async (sourceId: string) =>
      (await tx.select().from(events)
        .where(and(eq(events.source, source), eq(events.sourceId, sourceId)))
        .limit(1))[0];
    const tombstone = async (sourceId: string) =>
      (await tx.select().from(eventImportTombstones)
        .where(and(eq(eventImportTombstones.source, source), eq(eventImportTombstones.sourceId, sourceId)))
        .limit(1))[0];

    for (const [index, op] of request.operations.entries()) {
      const base = { index, op: op.op, sourceId: op.sourceId };
      const row = await find(op.sourceId);

      if (!row && op.op !== "upsert") {
        results.push((await tombstone(op.sourceId))
          ? { ...base, status: "conflict", reason: "deleted_by_admin" }
          : { ...base, status: "not_found" });
        continue;
      }

      if (op.op === "upsert") {
        const values = toEventValues(op.event, op.sourceRef);
        if (!row) {
          if (await tombstone(op.sourceId)) {
            if (!op.override) {
              results.push({ ...base, status: "conflict", reason: "deleted_by_admin" });
              continue;
            }
            await tx.delete(eventImportTombstones).where(and(
              eq(eventImportTombstones.source, source),
              eq(eventImportTombstones.sourceId, op.sourceId),
            ));
          }
          const id = ulid();
          await tx.insert(events).values({
            id,
            ...values,
            source,
            sourceId: op.sourceId,
            createdByAdminId: null,
            importedAt: now,
            lastImportedAt: now,
            createdAt: now,
            updatedAt: now,
          });
          changed.add(id);
          results.push({ ...base, status: "created", eventId: id });
        } else if (sameContent(row, values)) {
          results.push({ ...base, status: "unchanged", eventId: row.id });
        } else if (row.adminEditedAt && !op.override) {
          results.push({ ...base, status: "conflict", reason: "edited_by_admin", eventId: row.id });
        } else {
          await tx.update(events)
            .set({ ...values, lastImportedAt: now, updatedAt: now, adminEditedAt: null })
            .where(eq(events.id, row.id));
          changed.add(row.id);
          results.push({ ...base, status: "updated", eventId: row.id });
        }
        continue;
      }

      // cancel / restore of an existing event
      const event = row!;
      const result = { ...base, eventId: event.id };

      if (!op.occurrenceDate) {
        const cancelling = op.op === "cancel";
        if (cancelling === (event.cancelledAt !== null)) {
          results.push({ ...result, status: "unchanged" });
          continue;
        }
        await tx.update(events)
          .set({ cancelledAt: cancelling ? now : null, lastImportedAt: now, updatedAt: now })
          .where(eq(events.id, event.id));
        changed.add(event.id);
        results.push({ ...result, status: cancelling ? "cancelled" : "restored" });
        continue;
      }

      const date = op.occurrenceDate;
      const withDate = { ...result, occurrenceDate: date };
      if (!hasOccurrenceOn(event, date)) {
        results.push({ ...withDate, status: "not_found", reason: "no_occurrence_on_date" });
        continue;
      }
      const match = and(
        eq(eventCancellations.eventId, event.id),
        eq(eventCancellations.occurrenceDate, date),
      );
      const [existing] = await tx.select().from(eventCancellations).where(match).limit(1);
      if (op.op === "cancel") {
        if (existing) {
          results.push({ ...withDate, status: "unchanged" });
          continue;
        }
        await tx.insert(eventCancellations).values({ eventId: event.id, occurrenceDate: date });
        changed.add(event.id);
        results.push({ ...withDate, status: "cancelled" });
      } else {
        if (!existing) {
          results.push({ ...withDate, status: "unchanged" });
          continue;
        }
        await tx.delete(eventCancellations).where(match);
        changed.add(event.id);
        results.push({ ...withDate, status: "restored" });
      }
    }

    const outcome = { results, changedEventIds: [...changed] };
    if (request.dryRun) throw new DryRunRollback(outcome);
    return outcome;
  });
}

/**
 * Deletes an event; for an imported one, leaves a tombstone so the importer
 * doesn't silently bring it back. Used by the admin delete action.
 */
export async function deleteEventRecordingImport(db: DB, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(events).where(eq(events.id, id)).limit(1);
    if (!row) return;
    if (row.source !== "manual" && row.sourceId) {
      await tx.insert(eventImportTombstones)
        .values({ source: row.source, sourceId: row.sourceId, eventId: row.id })
        .onConflictDoUpdate({
          target: [eventImportTombstones.source, eventImportTombstones.sourceId],
          set: { eventId: row.id, deletedAt: new Date() },
        });
    }
    await tx.delete(events).where(eq(events.id, id));
  });
}
