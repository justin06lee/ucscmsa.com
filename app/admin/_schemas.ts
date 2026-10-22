import { z } from "zod";
import { description, eventLinks, hm, location, realYmd, title, INTERVAL_MAX, WEEKDAY_CODES } from "@/lib/event-rules";

const ymd = realYmd.or(z.literal("")).default("");
// Both times are optional (see EVENT_TIMINGS in lib/event-rules.ts): blank
// times make a date-only event, a start time alone a start-only one.
const optionalHm = (message: string) => hm(message).or(z.literal("")).default("");

const WEEKDAY = `(${WEEKDAY_CODES.join("|")})`;

export const eventInputSchema = z
  .object({
    title,
    description: description.default(""),
    location: location.default(""),
    startDate: ymd,
    startTime: optionalHm("Invalid start time"),
    endDate: ymd,
    endTime: optionalHm("Invalid end time"),
    recurrenceFreq: z
      .enum(["none", "daily", "weekly", "monthly", "yearly"])
      .default("none"),
    recurrenceByWeekday: z
      .string()
      .regex(new RegExp(`^(${WEEKDAY}(,${WEEKDAY})*)?$`), "Invalid weekdays")
      .default(""),
    recurrenceInterval: z.coerce.number().int().min(1).max(INTERVAL_MAX).default(1),
    recurrenceUntil: ymd,
    // Left out when the form has no link fields: an update then keeps the
    // event's links as they are.
    links: eventLinks.optional(),
  })
  .refine(
    (d) => d.recurrenceFreq !== "none" || (d.startDate && d.endDate),
    { message: "Start and end dates are required for non-recurring events", path: ["startDate"] },
  )
  .refine((d) => !d.endTime || d.startTime, {
    message: "An end time needs a start time; clear both for a date-only event",
    path: ["startTime"],
  })
  .refine(
    (d) => {
      // Blank dates are filled in by resolveDates: a blank start is today
      // (can't compare here), a blank end is the start date.
      if (!d.startDate && d.endDate) return true;
      const endDate = d.endDate || d.startDate;
      // Without both times the event spans whole days, so the end date may
      // equal the start date.
      if (!d.startTime || !d.endTime) return endDate >= d.startDate;
      return `${endDate}T${d.endTime}` > `${d.startDate}T${d.startTime}`;
    },
    { message: "End must be after start", path: ["endDate"] },
  );
export type EventInputForm = z.infer<typeof eventInputSchema>;

export const nominateSchema = z.object({
  action: z.enum(["promote", "demote"]),
  nomineeEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .endsWith("@ucsc.edu", "Must be a ucsc.edu email")
    .optional(),
  targetAdminId: z.coerce.number().int().optional(),
});
export type NominateInput = z.infer<typeof nominateSchema>;
