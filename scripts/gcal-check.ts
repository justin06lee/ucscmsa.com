// Checks the MSA calendar connection against a real Google calendar: makes a
// test event a week out, renames it, deletes it. Point it at a TEST calendar.
//   GOOGLE_SA_JSON="$(cat key.json)" GOOGLE_CALENDAR_ID=<calendar id> bun scripts/gcal-check.ts
import { calendarConfigFromEnv, deleteCalendarEvent, putCalendarEvent } from "../lib/gcal";

const cfg = calendarConfigFromEnv();
if (!cfg) {
  console.error("Set GOOGLE_SA_JSON (the key file's JSON) and GOOGLE_CALENDAR_ID.");
  process.exit(1);
}
const id = crypto.randomUUID();
const eventDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const made = await putCalendarEvent(cfg, { id, title: "ucscmsa.com calendar check", eventDate, googleEventId: null });
console.log(`made ${made} on ${eventDate}`);
await putCalendarEvent(cfg, { id, title: "ucscmsa.com calendar check (renamed)", eventDate, googleEventId: made });
console.log("renamed it");
await deleteCalendarEvent(cfg, made);
console.log(`deleted it. ${cfg.clientEmail} can write to ${cfg.calendarId}.`);
