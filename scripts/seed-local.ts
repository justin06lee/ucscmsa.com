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
import {
  admins,
  adminApprovals,
  adminNominations,
  eventCancellations,
  events,
  sessions,
  users,
} from "../lib/db/schema";
import { parseHMInLocal } from "../lib/time";

const url = process.argv[2];
if (!url || !url.startsWith("file:")) {
  console.error("usage: bun scripts/seed-local.ts file:<path>.db  (file: URLs only)");
  process.exit(1);
}

const at = (ymd: string, hm: string) => parseHMInLocal(ymd, hm);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const client = createClient({ url });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });

  for (const t of [
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
      description: "A relaxed space for sisters to catch up, study together and plan events.",
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
  await db.insert(eventCancellations).values([
    { eventId: "ev-jummah", occurrenceDate: "2026-11-27" },
  ]);

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
    }),
  );
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
