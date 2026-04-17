import { relations, sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---------- Auth.js (Drizzle adapter) ----------

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  })
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

// ---------- Admin governance ----------

export const admins = sqliteTable("admins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  promotedAt: integer("promoted_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  promotedByNominationId: text("promoted_by_nomination_id"),
});

export const adminNominations = sqliteTable("admin_nominations", {
  id: text("id").primaryKey(),
  nomineeEmail: text("nominee_email"),
  action: text("action", { enum: ["promote", "demote"] }).notNull(),
  targetAdminId: integer("target_admin_id").references(() => admins.id, {
    onDelete: "set null",
  }),
  nominatedByAdminId: integer("nominated_by_admin_id")
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "cancelled"],
  })
    .notNull()
    .default("pending"),
});

export const adminApprovals = sqliteTable(
  "admin_approvals",
  {
    nominationId: text("nomination_id")
      .notNull()
      .references(() => adminNominations.id, { onDelete: "cascade" }),
    approverAdminId: integer("approver_admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.nominationId, t.approverAdminId] }),
  })
);

// ---------- Events ----------

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default(""),
  startTime: integer("start_time", { mode: "timestamp_ms" }).notNull(),
  endTime: integer("end_time", { mode: "timestamp_ms" }).notNull(),
  recurrenceFreq: text("recurrence_freq", {
    enum: ["daily", "weekly", "monthly", "yearly"],
  }),
  recurrenceByWeekday: text("recurrence_by_weekday"),
  recurrenceInterval: integer("recurrence_interval").notNull().default(1),
  recurrenceUntil: integer("recurrence_until", { mode: "timestamp_ms" }),
  createdByAdminId: integer("created_by_admin_id")
    .notNull()
    .references(() => admins.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const eventCancellations = sqliteTable(
  "event_cancellations",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    occurrenceDate: text("occurrence_date").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.occurrenceDate] }),
  })
);

export const eventRsvps = sqliteTable(
  "event_rsvps",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    occurrenceStart: integer("occurrence_start", { mode: "timestamp_ms" }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["yes", "no", "maybe"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.occurrenceStart, t.userId] }),
  })
);

// ---------- Prayer times cache ----------

export const prayerTimesCache = sqliteTable("prayer_times_cache", {
  date: text("date").primaryKey(), // YYYY-MM-DD (Santa Cruz local)
  fajr: text("fajr").notNull(),
  sunrise: text("sunrise").notNull(),
  dhuhr: text("dhuhr").notNull(),
  asr: text("asr").notNull(),
  maghrib: text("maghrib").notNull(),
  isha: text("isha").notNull(),
  cachedAt: integer("cached_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ---------- Relations (optional helpers) ----------

export const adminsRelations = relations(admins, ({ one, many }) => ({
  user: one(users, { fields: [admins.userId], references: [users.id] }),
  nominationsFiled: many(adminNominations, { relationName: "nominator" }),
  approvals: many(adminApprovals),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  cancellations: many(eventCancellations),
  rsvps: many(eventRsvps),
}));
