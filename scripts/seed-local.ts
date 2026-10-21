// Seeds a LOCAL libSQL file with realistic fake data for screenshots, e2e and
// Lighthouse runs. Refuses anything that isn't a file: URL so it can never
// touch the production Turso database.
//
//   bun scripts/seed-local.ts file:/tmp/ucscmsa/audit.db
//
// Prints the ids and session tokens as JSON on stdout. The admin session row
// lets a local browser act as an admin by setting the `authjs.session-token`
// cookie — it only exists in the local file, so production auth is untouched.
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { randomBytes } from "node:crypto";
import * as schema from "../lib/db/schema";
import {
  admins,
  adminApprovals,
  adminNominations,
  eventCancellations,
  eventTasks,
  events,
  sessions,
  users,
} from "../lib/db/schema";
import { eventInstants } from "../lib/event-rules";
import { parseHMInLocal, toLocalYmd } from "../lib/time";
import { addDaysYmd } from "../lib/planning";
import { assignTask, planFromForm, setTaskDone } from "../app/admin/plan/_plan";
import { and, eq } from "drizzle-orm";

const url = process.argv[2];
if (!url || !url.startsWith("file:")) {
  console.error("usage: bun scripts/seed-local.ts file:<path>.db  (file: URLs only)");
  process.exit(1);
}

const at = (ymd: string, hm: string) => parseHMInLocal(ymd, hm);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });

  for (const t of [
    "event_tasks",
    "event_tags",
    "event_rsvps",
    "event_cancellations",
    "events",
    "admin_approvals",
    "admin_nominations",
    "admins",
    "session",
    "account",
    "user",
  ]) {
    await client.execute(`DELETE FROM ${t}`);
  }

  const people = [
    { id: "u-aisha", name: "Aisha Karim", email: "aisha.karim@ucsc.edu" },
    { id: "u-omar", name: "Omar Farouk", email: "omar.farouk@ucsc.edu" },
    { id: "u-maryam", name: "Maryam Siddiqui", email: "maryam.siddiqui@ucsc.edu" },
    { id: "u-yusuf", name: "Yusuf Rahman", email: "yusuf.rahman@ucsc.edu" },
  ];
  await db.insert(users).values(people);

  const t0 = new Date("2026-04-20T17:00:00.000Z");
  await db.insert(admins).values([
    { id: 1, userId: "u-aisha", promotedAt: t0 },
    { id: 2, userId: "u-omar", promotedAt: t0 },
    { id: 3, userId: "u-maryam", promotedAt: new Date("2026-09-28T19:00:00.000Z"), promotedByNominationId: "01J9ZB4M2Q7X8N3K5V6W1T0R9S" },
  ]);

  await db.insert(adminNominations).values([
    { id: "01K7PENDING0000000000000001", action: "promote", nomineeEmail: "zaynab.hussain@ucsc.edu", nominatedByAdminId: 2, createdAt: new Date("2026-10-17T21:12:00.000Z"), status: "pending" },
    { id: "01J9ZB4M2Q7X8N3K5V6W1T0R9S", action: "promote", nomineeEmail: "maryam.siddiqui@ucsc.edu", nominatedByAdminId: 1, createdAt: new Date("2026-09-25T18:00:00.000Z"), status: "approved" },
    { id: "01K0CANCELLED00000000000001", action: "promote", nomineeEmail: "test.account@ucsc.edu", nominatedByAdminId: 2, createdAt: new Date("2026-10-02T16:30:00.000Z"), status: "cancelled" },
  ]);
  await db.insert(adminApprovals).values([
    { nominationId: "01K7PENDING0000000000000001", approverAdminId: 3 },
  ]);

  const fallUntil = at("2026-12-11", "23:59");
  const ev = [
    {
      id: "ev-jummah",
      title: "Jummah Prayer",
      description:
        "Weekly Friday congregational prayer. Khutbah starts at 1:15 PM, salah right after. Wudu facilities are down the hall; bring a prayer mat if you have one.",
      location: "Student Union Assembly Hall",
      startTime: at("2026-09-25", "13:15"),
      endTime: at("2026-09-25", "14:00"),
      recurrenceFreq: "weekly" as const,
      recurrenceByWeekday: "FR",
      recurrenceUntil: fallUntil,
    },
    {
      id: "ev-halaqa",
      title: "Weekly Halaqa",
      description: "Tafsir of Surah Al-Kahf, one passage a week. Chai and snacks provided.",
      location: "Merrill College, Room 102",
      startTime: at("2026-09-30", "19:30"),
      endTime: at("2026-09-30", "21:00"),
      recurrenceFreq: "weekly" as const,
      recurrenceByWeekday: "WE",
      recurrenceUntil: fallUntil,
    },
    {
      id: "ev-sisters",
      title: "Sisters' Circle",
      // A Game Night-style RSVP link, and a long one that must wrap at 375px
      // (e2e/event-description.spec.ts).
      description:
        "A relaxed space for sisters to catch up, study together and plan events.\n\n" +
        "RSVP for the address: https://forms.gle/thkacLx82yYcgxjt9.\n" +
        "Reading list (PDF): https://drive.google.com/file/d/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ4/view?usp=sharing",
      location: "Cantú Queer Center Lounge",
      startTime: at("2026-09-29", "18:00"),
      endTime: at("2026-09-29", "19:15"),
      recurrenceFreq: "weekly" as const,
      recurrenceByWeekday: "TU",
      recurrenceUntil: fallUntil,
    },
    {
      id: "ev-quran",
      title: "Quran Study Circle",
      description: "Tajweed practice in small groups. All levels welcome.",
      location: "McHenry Library, Room 1350",
      startTime: at("2026-09-28", "12:00"),
      endTime: at("2026-09-28", "12:45"),
      recurrenceFreq: "weekly" as const,
      recurrenceByWeekday: "MO,TH",
      recurrenceUntil: fallUntil,
    },
    {
      id: "ev-gbm",
      title: "Fall General Body Meeting",
      description:
        "Meet the new board, hear what's planned for the quarter, and sign up for committees. Dinner from a local halal spot will be served.\n\nNew members especially welcome — no experience needed.",
      location: "Stevenson Event Center",
      startTime: at("2026-10-22", "18:30"),
      endTime: at("2026-10-22", "20:00"),
    },
    {
      id: "ev-basketball",
      title: "Brothers' Basketball",
      description: "Pickup games after Jummah.",
      location: "East Field House Gym",
      startTime: at("2026-10-23", "13:30"),
      endTime: at("2026-10-23", "15:00"),
    },
    {
      id: "ev-qiyam",
      title: "Qiyam al-Layl",
      description: "Night prayer before Fajr, then breakfast together.",
      location: "Kresge College Town Hall",
      startTime: at("2026-10-23", "05:00"),
      endTime: at("2026-10-23", "05:50"),
    },
    {
      id: "ev-potluck",
      title: "Community Potluck",
      description: "Bring a dish to share. Plates and drinks provided.",
      location: "Oakes College Learning Center",
      startTime: at("2026-11-14", "18:00"),
      endTime: at("2026-11-14", "20:00"),
      source: "whatsapp",
      sourceId: "wa-msg-0193",
      sourceRef: "WhatsApp MSA Announcements, 2026-10-20 18:04",
      importedAt: new Date("2026-10-21T01:04:00.000Z"),
      lastImportedAt: new Date("2026-10-21T01:04:00.000Z"),
    },
    {
      id: "ev-cleanup",
      title: "Beach Cleanup at Natural Bridges",
      description: "Gloves and bags provided. Carpool from the base of campus.",
      location: "Natural Bridges State Beach",
      startTime: at("2026-10-25", "10:00"),
      endTime: at("2026-10-25", "12:00"),
      source: "whatsapp",
      sourceId: "wa-msg-0188",
      sourceRef: "https://chat.whatsapp.com/example-announcements",
      importedAt: new Date("2026-10-18T19:30:00.000Z"),
      lastImportedAt: new Date("2026-10-20T02:00:00.000Z"),
      cancelledAt: new Date("2026-10-20T02:00:00.000Z"),
    },
    {
      id: "ev-hike",
      title: "Night Hike to the Lookout",
      description: "Meet at the base of campus. Bring a flashlight and water.",
      location: "Lower Campus Lime Kiln trailhead",
      startTime: at("2026-10-23", "20:30"),
      endTime: at("2026-10-23", "22:00"),
    },
    {
      id: "ev-welcome",
      title: "Fall Welcome Dinner",
      description: "Kick off the year with food and new friends.",
      location: "College Nine Multipurpose Room",
      startTime: at("2026-10-09", "18:00"),
      endTime: at("2026-10-09", "20:00"),
    },
    {
      id: "ev-bakesale",
      title: "Charity Bake Sale",
      description: "All proceeds go to the Islamic Relief winter appeal.",
      location: "Quarry Plaza",
      startTime: at("2026-11-05", "11:00"),
      endTime: at("2026-11-05", "15:00"),
    },
    {
      id: "ev-panel",
      title: "Islamic Awareness Week: Faith on Campus Panel",
      description:
        "Students and chaplains talk about practicing faith at a public university: finding prayer space, fasting during finals, and building community. Q&A after.",
      location: "Humanities Lecture Hall",
      startTime: at("2026-11-12", "18:00"),
      endTime: at("2026-11-12", "19:30"),
    },
  ];
  // A year of past one-off events, dated relative to now so they are always
  // past: the landing's Past events, the calendar going back, and the phone
  // month list's "Earlier this month" (e2e/past-events.spec.ts). Like the
  // WhatsApp history import, most are imported.
  const HISTORY: [title: string, location: string, start: string, minutes: number, description: string][] = [
    ["Game Night", "Cowell College Fireside Lounge", "18:30", 150, "Board games, cards and chai. Bring a friend."],
    ["Halaqa: Patience in Hard Times", "Merrill College Room 102", "19:00", 75, "A short talk and open discussion."],
    ["Community Iftar", "Stevenson Event Center", "18:45", 120, "Break your fast with us. Dates, water and dinner provided."],
    ["Beach Day at Seabright", "Seabright State Beach", "13:00", 180, "Volleyball, snacks and Asr on the beach."],
    ["Study Night", "Science & Engineering Library", "19:00", 180, "Quiet study with snack breaks every hour."],
    ["Eid Dinner", "College Nine Multipurpose Room", "18:00", 150, "Celebrate Eid with the MSA. Families welcome."],
    ["Sisters' Brunch", "Kresge Town Hall", "11:00", 90, "Brunch and catch-up for sisters."],
    ["Charity Car Wash", "Base of Campus", "10:00", 240, "All proceeds go to local food banks."],
  ];
  const now = Date.now();
  const pastDay = (daysAgo: number) => toLocalYmd(new Date(now - daysAgo * DAY));
  const history = Array.from({ length: 48 }, (_, i) => {
    const [title, location, hm, minutes, description] = HISTORY[i % HISTORY.length];
    const startTime = at(pastDay(2 + Math.floor(i * 6.8)), hm);
    return { title, location, description, startTime, endTime: new Date(startTime.getTime() + minutes * 60_000) };
  });
  // One busy past day, to see chips and dots under load.
  for (const [hm, title] of [["10:00", "Quran Competition"], ["12:30", "Lunch & Learn"], ["16:00", "Volunteer Fair"], ["19:30", "Nasheed Night"]]) {
    const startTime = at(pastDay(47), hm);
    history.push({ title, location: "Quarry Plaza", description: `${title} during Islamic Awareness Week.`, startTime, endTime: new Date(startTime.getTime() + 90 * 60_000) });
  }
  // Events whose times weren't announced, stored the way the admin form and the
  // import store them (eventInstants): date-only and start-only, upcoming and
  // past, plus a date-only weekend (e2e/event-timing.spec.ts). They keep off
  // the fixed one-off fixtures' days, which e2e lists event by event.
  const fixtureDays = new Set(ev.flatMap((e) => ("recurrenceFreq" in e ? [] : [toLocalYmd(e.startTime)])));
  const freeDay = (days: number, step: 1 | -1) => {
    while (fixtureDays.has(toLocalYmd(new Date(now + days * DAY)))) days += step;
    return toLocalYmd(new Date(now + days * DAY));
  };
  const dayAhead = (days: number) => freeDay(days, 1);
  const dayBack = (days: number) => freeDay(-days, -1);
  const plusDays = (ymd: string, days: number) => toLocalYmd(new Date(at(ymd, "12:00").getTime() + days * DAY));
  const retreat = dayAhead(9);
  const untimed: (typeof events.$inferInsert)[] = [
    {
      id: "ev-start-only",
      title: "Laser Tag + Arcade Social",
      description: "Entry: $8 per person for a 15-minute game. Everyone is welcome!",
      location: "Santa Cruz Beach Boardwalk",
      ...eventInstants({ date: dayAhead(2), startTime: "18:00" }),
    },
    {
      id: "ev-date-only",
      title: "Henna Night",
      description: "Henna, snacks and good company. Time and room to be announced.",
      location: "Cowell College",
      ...eventInstants({ date: dayAhead(0) }),
    },
    {
      id: "ev-retreat",
      title: "Winter Retreat",
      description: "A weekend away in the mountains. Details to follow.",
      location: "Mount Hermon",
      ...eventInstants({ date: retreat, endDate: plusDays(retreat, 2) }),
    },
    {
      id: "ev-past-date-only",
      title: "Grappling Night",
      description: "Open mat with the brothers' grappling group.",
      location: "East Field House",
      ...eventInstants({ date: dayBack(4) }),
    },
    {
      id: "ev-past-start-only",
      title: "Hilltop Potluck",
      description: "Bring a dish; we eat at sunset.",
      location: "Porter Meadow",
      ...eventInstants({ date: dayBack(6), startTime: "17:30" }),
    },
  ].map((e) => ({
    ...e,
    createdByAdminId: 1,
    createdAt: new Date("2026-10-01T18:00:00.000Z"),
    updatedAt: new Date("2026-10-01T18:00:00.000Z"),
    source: "whatsapp",
    sourceId: `wa-${e.id}`,
    importedAt: new Date("2026-10-01T18:00:00.000Z"),
    lastImportedAt: new Date("2026-10-01T18:00:00.000Z"),
  }));
  await db.insert(events).values(untimed);
  await db.insert(events).values(
    ev.map((e) => ({
      recurrenceFreq: null,
      recurrenceByWeekday: null,
      recurrenceUntil: null,
      recurrenceInterval: 1,
      createdByAdminId: 1,
      createdAt: new Date("2026-09-20T18:00:00.000Z"),
      updatedAt: new Date("2026-10-01T18:00:00.000Z"),
      ...e,
    })),
  );
  await db.insert(events).values(
    history.map((e, i): typeof events.$inferInsert => ({
      id: `ev-past-${String(i + 1).padStart(2, "0")}`,
      ...e,
      createdByAdminId: 1,
      createdAt: e.endTime,
      updatedAt: e.endTime,
      ...(i % 3 === 0
        ? {}
        : { source: "whatsapp", sourceId: `wa-hist-${i + 1}`, importedAt: e.endTime, lastImportedAt: e.endTime }),
    })),
  );
  await db.insert(eventCancellations).values([
    { eventId: "ev-jummah", occurrenceDate: "2026-11-27" },
  ]);

  // Board planning (/admin/plan): a draft being planned and a published event
  // with its checklist. The draft's date follows today, so its timeline always
  // has overdue, done and upcoming tasks around the today marker.
  const today = toLocalYmd(new Date());
  const bonfireDay = addDaysYmd(today, 12);
  await db.insert(events).values({
    id: "ev-bonfire",
    title: "Fall Bonfire Night",
    description: "S’mores, hot cider and a short reminder after Maghrib.",
    location: "Porter Meadow",
    startTime: at(bonfireDay, "18:30"),
    endTime: at(bonfireDay, "21:00"),
    createdByAdminId: 1,
    draft: true,
  });
  await planFromForm(db, "ev-bonfire", { tags: ["room", "food", "funding"], recurring: false });
  await planFromForm(db, "ev-panel", { tags: ["big", "room"], recurring: false });
  const taskId = async (eventId: string, templateId: string) =>
    (
      await db
        .select({ id: eventTasks.id })
        .from(eventTasks)
        .where(and(eq(eventTasks.eventId, eventId), eq(eventTasks.templateId, templateId)))
    )[0]?.id;
  const bonfireRoom = await taskId("ev-bonfire", "room");
  if (bonfireRoom) await setTaskDone(db, bonfireRoom, "u-omar", true);
  const bonfireFood = await taskId("ev-bonfire", "purchase");
  if (bonfireFood) await assignTask(db, bonfireFood, "u-maryam");

  const adminToken = randomBytes(32).toString("hex");
  const memberToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * DAY);
  await db.insert(sessions).values([
    { sessionToken: adminToken, userId: "u-aisha", expires },
    { sessionToken: memberToken, userId: "u-yusuf", expires },
  ]);

  console.log(
    JSON.stringify({
      adminToken,
      memberToken,
      singleEventId: "ev-gbm",
      recurringEventId: "ev-jummah",
      plannedEventId: "ev-bonfire",
    }),
  );
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
