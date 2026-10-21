import { z } from "zod";
import {
  description,
  hm,
  interval,
  localTimeKind,
  location,
  realYmd,
  title,
  WEEKDAY_CODES,
} from "@/lib/event-rules";
import type { RateLimitRule } from "@/lib/rate-limit";

// The request body of POST /api/import/events. Documented field by field in
// docs/import.md; keep the two in step. Every object is strict: unknown
// fields are rejected, not ignored.

export const MAX_OPERATIONS = 50;
export const MAX_BODY_BYTES = 256 * 1024;

// Per token and client IP, and per token overall. Counted only for requests
// with a valid token.
export const IMPORT_RATE_LIMITS: Record<"tokenAndIp" | "token", RateLimitRule> = {
  tokenAndIp: { limit: 30, windowMs: 10 * 60_000 },
  token: { limit: 120, windowMs: 60 * 60_000 },
};

const source = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,31}$/, "Lowercase letters, digits, - and _; 1-32 characters")
  .refine((s) => s !== "manual", '"manual" is reserved for events made in the admin form');

const sourceId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7E]+$/, "Printable ASCII with no spaces");

const recurrence = z
  .strictObject({
    freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: interval.optional(),
    byWeekday: z.array(z.enum(WEEKDAY_CODES)).min(1).max(7).optional(),
    until: realYmd.optional(),
  })
  .superRefine((r, ctx) => {
    if (r.byWeekday && r.freq !== "weekly") {
      ctx.addIssue({ code: "custom", path: ["byWeekday"], message: "byWeekday is only for weekly events" });
    }
    if (r.byWeekday && new Set(r.byWeekday).size !== r.byWeekday.length) {
      ctx.addIssue({ code: "custom", path: ["byWeekday"], message: "Duplicate weekday" });
    }
  });

// Times are Santa Cruz wall-clock times (America/Los_Angeles), exactly as an
// announcement states them. Times that don't exist or happen twice at a DST
// change are rejected rather than guessed. Both times are optional (see
// EVENT_TIMINGS): no times is a date-only event, a start time alone a
// start-only one; an end time alone is an error.
const event = z
  .strictObject({
    title,
    description: description.optional(),
    location: location.optional(),
    date: realYmd,
    startTime: hm("Invalid start time").optional(),
    endTime: hm("Invalid end time").optional(),
    endDate: realYmd.optional(),
    recurrence: recurrence.optional(),
  })
  .superRefine((e, ctx) => {
    const endDate = e.endDate ?? e.date;
    if (e.endTime && !e.startTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "An end time needs a start time; leave both out for a date-only event" });
    }
    const checks = [
      { date: e.date, time: e.startTime, path: "startTime" },
      { date: endDate, time: e.endTime, path: "endTime" },
    ];
    for (const c of checks) {
      if (!c.time) continue;
      const kind = localTimeKind(c.date, c.time);
      if (kind === "nonexistent") {
        ctx.addIssue({ code: "custom", path: [c.path], message: `${c.date} ${c.time} doesn't exist in Santa Cruz (clocks spring forward)` });
      } else if (kind === "ambiguous") {
        ctx.addIssue({ code: "custom", path: [c.path], message: `${c.date} ${c.time} happens twice in Santa Cruz (clocks fall back); use another time` });
      }
    }
    if (e.startTime && e.endTime) {
      if (`${endDate}T${e.endTime}` <= `${e.date}T${e.startTime}`) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "End must be after start" });
      }
    } else if (endDate < e.date) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate is before date" });
    }
    if (e.recurrence?.until && e.recurrence.until < e.date) {
      ctx.addIssue({ code: "custom", path: ["recurrence", "until"], message: "until is before the event's date" });
    }
  });

const upsert = z.strictObject({
  op: z.literal("upsert"),
  sourceId,
  sourceRef: z.string().trim().max(500).optional(),
  event,
  override: z.boolean().optional(),
});

const cancel = z.strictObject({
  op: z.literal("cancel"),
  sourceId,
  occurrenceDate: realYmd.optional(),
});

const restore = z.strictObject({
  op: z.literal("restore"),
  sourceId,
  occurrenceDate: realYmd.optional(),
});

export const importRequestSchema = z.strictObject({
  source,
  operations: z
    .array(z.discriminatedUnion("op", [upsert, cancel, restore]))
    .min(1)
    .max(MAX_OPERATIONS),
  // Runs the batch and rolls it back: the results show what would happen.
  dryRun: z.boolean().optional(),
});

export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportOperation = ImportRequest["operations"][number];
export type ImportEvent = z.infer<typeof event>;
