import { z } from "zod";

// A real calendar date in a sane range. The pattern alone let "2026-02-31"
// and "0001-01-01" through: the first became an Invalid Date at insert time,
// the second made every page view expand two thousand years of recurrences.
function isRealYmd(s: string): boolean {
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  const year = d.getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

const realYmd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine(isRealYmd, "Invalid date");

const ymd = realYmd.or(z.literal("")).default("");

const hm = (message: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, message);

const WEEKDAY = "(SU|MO|TU|WE|TH|FR|SA)";

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title required").max(200, "Title is too long"),
    description: z.string().max(10_000, "Description is too long").default(""),
    location: z.string().trim().max(200, "Location is too long").default(""),
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
    recurrenceInterval: z.coerce.number().int().min(1).max(99).default(1),
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
