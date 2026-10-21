import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { EVENT_TIMINGS, type EventLink } from "../event-rules";

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

export const adminNominations = sqliteTable(
  "admin_nominations",
  {
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
  },
  (t) => ({
    nominatedByIdx: index("admin_nominations_nominated_by_admin_id_idx").on(
      t.nominatedByAdminId
    ),
  })
);

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
    approverIdx: index("admin_approvals_approver_admin_id_idx").on(
      t.approverAdminId
    ),
  })
);

// One row per admin removed by an approved demote nomination. Deliberately no
// foreign keys: the admins row it describes is deleted, and the record must
// outlive later cascades. ADMIN_SEED_EMAILS seeding skips emails listed here,
// so a demoted seed admin is not re-promoted at their next sign-in.
export const adminRemovals = sqliteTable(
  "admin_removals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    nominationId: text("nomination_id"),
    removedAt: integer("removed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    emailIdx: index("admin_removals_email_idx").on(t.email),
  })
);

// ---------- Events ----------

export const events = sqliteTable(
  "events",
  {
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
    // Which of the times are known; see EVENT_TIMINGS in lib/event-rules.ts.
    // start_time/end_time are always set: an unknown start is the start of the
    // Santa Cruz day, an unknown end the end of the event's last day.
    timing: text("timing", { enum: EVENT_TIMINGS }).notNull().default("timed"),
    // Nullable with SET NULL: a NOT NULL reference here made any admin who had
    // created an event impossible to demote (the admins delete failed).
    createdByAdminId: integer("created_by_admin_id").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // Where the event came from: "manual" for the admin form, or an import
    // source such as "whatsapp" with that source's stable id for it.
    source: text("source").notNull().default("manual"),
    sourceId: text("source_id"),
    sourceRef: text("source_ref"), // free text: a link or a note on the origin
    importedAt: integer("imported_at", { mode: "timestamp_ms" }),
    lastImportedAt: integer("last_imported_at", { mode: "timestamp_ms" }),
    // Set when an admin saves the event in the admin form. The importer won't
    // overwrite an event with this set unless told to (override), which
    // clears it again.
    adminEditedAt: integer("admin_edited_at", { mode: "timestamp_ms" }),
    // The whole event is cancelled; it drops off the public calendar.
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    // Up to LINKS_MAX buttons ({ label, url }, checked by eventLinks in
    // lib/event-rules.ts), such as an RSVP form. Null when there are none.
    links: text("links", { mode: "json" }).$type<EventLink[]>(),
  },
  (t) => ({
    createdByIdx: index("events_created_by_admin_id_idx").on(
      t.createdByAdminId
    ),
    sourceIdUnique: uniqueIndex("events_source_source_id_unique").on(
      t.source,
      t.sourceId
    ),
  })
);

// An imported event an admin deleted. The importer must not bring it back
// unless it says so explicitly (override).
export const eventImportTombstones = sqliteTable(
  "event_import_tombstones",
  {
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    eventId: text("event_id").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.source, t.sourceId] }),
  })
);

// Fixed-window request counters (see lib/rate-limit.ts).
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: integer("window_start").notNull(), // ms since epoch
    count: integer("count").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.windowStart] }),
    windowIdx: index("rate_limits_window_start_idx").on(t.windowStart),
  })
);

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
    eventIdx: index("event_cancellations_event_id_idx").on(t.eventId),
    occurrenceDateFormat: check(
      "event_cancellations_occurrence_date_format",
      sql`${t.occurrenceDate} GLOB '????-??-??'`
    ),
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
    userIdx: index("event_rsvps_user_id_idx").on(t.userId),
    occurrenceStartIdx: index("event_rsvps_occurrence_start_idx").on(
      t.occurrenceStart
    ),
  })
);

// ---------- Prayer times cache ----------

export const prayerTimesCache = sqliteTable(
  "prayer_times_cache",
  {
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
  },
  (t) => ({
    fajrFormat: check(
      "prayer_times_cache_fajr_format",
      sql`${t.fajr} GLOB '??:??'`
    ),
    sunriseFormat: check(
      "prayer_times_cache_sunrise_format",
      sql`${t.sunrise} GLOB '??:??'`
    ),
    dhuhrFormat: check(
      "prayer_times_cache_dhuhr_format",
      sql`${t.dhuhr} GLOB '??:??'`
    ),
    asrFormat: check(
      "prayer_times_cache_asr_format",
      sql`${t.asr} GLOB '??:??'`
    ),
    maghribFormat: check(
      "prayer_times_cache_maghrib_format",
      sql`${t.maghrib} GLOB '??:??'`
    ),
    ishaFormat: check(
      "prayer_times_cache_isha_format",
      sql`${t.isha} GLOB '??:??'`
    ),
  })
);

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
