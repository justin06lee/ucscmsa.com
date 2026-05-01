import { z } from "zod";

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .or(z.literal(""))
  .default("");

export const eventInputSchema = z
  .object({
    title: z.string().min(1, "Title required"),
    description: z.string().default(""),
    location: z.string().default(""),
    startDate: ymd,
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time"),
    endDate: ymd,
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid end time"),
    recurrenceFreq: z
      .enum(["none", "daily", "weekly", "monthly", "yearly"])
      .default("none"),
    recurrenceByWeekday: z.string().default(""),
    recurrenceInterval: z.coerce.number().int().min(1).default(1),
    recurrenceUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .or(z.literal(""))
      .default(""),
  })
  .refine(
    (d) => d.recurrenceFreq !== "none" || (d.startDate && d.endDate),
    { message: "Start and end dates are required for non-recurring events", path: ["startDate"] },
  )
  .refine(
    (d) => {
      if (!d.startDate || !d.endDate) return true;
      return `${d.endDate}T${d.endTime}` > `${d.startDate}T${d.startTime}`;
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
