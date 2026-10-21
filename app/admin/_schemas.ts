import { z } from "zod";
import { description, hm, location, realYmd, title, INTERVAL_MAX, WEEKDAY_CODES } from "@/lib/event-rules";

const ymd = realYmd.or(z.literal("")).default("");

const WEEKDAY = `(${WEEKDAY_CODES.join("|")})`;

export const eventInputSchema = z
  .object({
    title,
    description: description.default(""),
    location: location.default(""),
    startDate: ymd,
    startTime: hm("Invalid start time"),
    endDate: ymd,
    endTime: hm("Invalid end time"),
    recurrenceFreq: z
      .enum(["none", "daily", "weekly", "monthly", "yearly"])
      .default("none"),
    recurrenceByWeekday: z
      .string()
      .regex(new RegExp(`^(${WEEKDAY}(,${WEEKDAY})*)?$`), "Invalid weekdays")
      .default(""),
    recurrenceInterval: z.coerce.number().int().min(1).max(INTERVAL_MAX).default(1),
    recurrenceUntil: ymd,
  })
  .refine(
    (d) => d.recurrenceFreq !== "none" || (d.startDate && d.endDate),
    { message: "Start and end dates are required for non-recurring events", path: ["startDate"] },
  )
  .refine(
    (d) => {
      // Blank dates are filled in by resolveDates: a blank start is today
      // (can't compare here), a blank end is the start date.
      if (!d.startDate && d.endDate) return true;
      const endDate = d.endDate || d.startDate;
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
