import { db } from "@/lib/db/client";
import { retryCalendarSyncs } from "@/lib/calendar-sync";
import { mailContextFromEnv, runDailyReminders } from "@/lib/reminders";
import { floorLocalHour, toLocalYmd } from "@/lib/time";

export const maxDuration = 60;

// Vercel Cron calls this at 15:00 and 16:00 UTC (vercel.json): 8 AM in Santa
// Cruz in summer time and in standard time. Only the run that lands in the
// 8 AM hour here does anything; ?now=1 skips that check for a manual run.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  if (new URL(req.url).searchParams.get("now") !== "1" && floorLocalHour(now) !== 8) {
    return Response.json({ skipped: "not 8 AM in Santa Cruz" });
  }
  const calendar = await retryCalendarSyncs(db);
  const mail = mailContextFromEnv();
  const reminders = mail ? await runDailyReminders(db, toLocalYmd(now), mail) : "email is off";
  return Response.json({ calendar, reminders });
}
