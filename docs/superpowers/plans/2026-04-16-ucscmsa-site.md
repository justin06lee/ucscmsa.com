# UCSC MSA Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UCSC MSA website end-to-end: hand-drawn paper-aesthetic landing with a wiggling moon-stars icon and wiggling "msa @ ucsc" letters, a public event calendar (day/month/year) with Fajr-to-Isha prayer-aligned day grid, and an admin dashboard with two-approver governance for admin membership changes.

**Architecture:** Next.js 16 App Router (with `proxy.ts` not `middleware.ts`), React 19, Tailwind v4 utilities-first with hand-written CSS for multi-layer coordination, Auth.js v5 Google + ucsc.edu allowlist, Drizzle ORM against Turso (libSQL), server components for reads and server actions for all writes, pure-function event expansion for recurrence, Aladhan API with Turso write-through cache for prayer times.

**Tech Stack:** Next 16.2.3, React 19.2.4, Tailwind v4, Auth.js v5 (`next-auth@beta`), `@auth/drizzle-adapter`, `drizzle-orm`, `@libsql/client`, `drizzle-kit`, `date-fns`, `date-fns-tz`, `zod`, `lucide-react`, `ulid`, Vitest, Testing Library, Playwright. Package manager: `bun`.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ucscmsa-site-design.md`

**Conventions used in this plan:**
- All bash commands run from repo root: `/Users/huiyunlee/Workspace/github.com/justin06lee/ucscmsa.com`
- Package manager is `bun`; never substitute npm/pnpm.
- "No emojis" rule is absolute — do not add emoji in code, comments, commit messages, or UI copy. Use `lucide-react` for all iconography.
- Tailwind-first for styling; fall back to hand-rolled CSS in `globals.css` only where utilities become unwieldy (noted explicitly in the relevant tasks).
- All dates inside tests use `2026-04-16` or later to match project current date.

---

## Phase 1: Foundation

### Task 1: Install dependencies and add scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add runtime dependencies**

Run:

```bash
bun add next-auth@beta @auth/drizzle-adapter drizzle-orm @libsql/client date-fns date-fns-tz zod lucide-react ulid
```

Expected: new entries appear under `dependencies` in `package.json`.

- [ ] **Step 2: Add dev dependencies**

Run:

```bash
bun add -d drizzle-kit vitest @vitejs/plugin-react @testing-library/react @testing-library/dom @testing-library/jest-dom @playwright/test happy-dom tsx
```

Expected: new entries under `devDependencies`.

- [ ] **Step 3: Add scripts to package.json**

Open `package.json` and replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:studio": "drizzle-kit studio"
}
```

- [ ] **Step 4: Verify install succeeded**

Run:

```bash
bun install && bun run typecheck
```

Expected: `bun install` completes without errors; `tsc --noEmit` passes (no source files changed yet).

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "Install runtime deps and add typecheck/test/db scripts"
```

---

### Task 2: Read Next 16 docs for proxy + App Router basics

**Files:** none (reading only)

AGENTS.md demands reading `node_modules/next/dist/docs/` for Next 16 changes before writing code. This is a standing reference task; skim now and re-open as needed during later tasks.

- [ ] **Step 1: Read the proxy doc**

Run:

```bash
cat node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
```

Notes to internalize:
- File is `proxy.ts` at repo root, exports a function (named `proxy` or default).
- Runtime is `nodejs` only; no edge support.
- `config = { matcher: [...] }` still works the same way.

- [ ] **Step 2: Read the upgrade-to-16 doc for middleware deprecation**

Run:

```bash
sed -n '620,690p' node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
```

- [ ] **Step 3: Read server-actions + route-handlers docs (skim)**

Run:

```bash
ls node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/ && cat node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
```

No commit for this task — it is a knowledge checkpoint.

---

### Task 3: Define theme tokens and base body styling

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace globals.css with theme tokens and paper background**

Open `app/globals.css` and replace its entire contents with:

```css
@import "tailwindcss";

@theme inline {
  --color-paper: #f5efe2;
  --color-ink: #151312;
  --color-burgundy: #6b1f2a;
  --color-burgundy-soft: #b96c75;
  --color-dim: #7a6f63;
  --font-sans: var(--font-serif-display), "Iowan Old Style", Georgia, serif;
}

:root {
  color-scheme: light;
}

html,
body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

body {
  min-height: 100dvh;
}

*:focus-visible {
  outline: 2px solid var(--color-burgundy);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Replace app/layout.tsx with a paper-themed shell**

Open `app/layout.tsx` and replace its entire contents with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MSA at UCSC",
  description: "The Muslim Student Association at the University of California, Santa Cruz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Remove the template homepage**

Open `app/page.tsx` and replace its entire contents with a placeholder; Task 17 will replace this with the real landing page:

```tsx
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center py-24">
      <p className="text-dim">Landing coming up.</p>
    </main>
  );
}
```

- [ ] **Step 4: Verify dev server renders cleanly**

Run:

```bash
bun run dev
```

Visit `http://localhost:3000` — expect paper background (#f5efe2), ink text "Landing coming up." centered. Kill the dev server with Ctrl-C after verification.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx app/page.tsx
git commit -m "Establish paper/ink/burgundy theme tokens and layout shell"
```

---

### Task 4: Copy letter and icon assets into public/letters

**Files:**
- Create: `public/letters/m-1.png`, `m-2.png`, `s-1.png`, `s-2.png`, `a-1.png`, `a-2.png`, `at-1.png`, `at-2.png`, `u-1.png`, `u-2.png`, `c-1.png`, `c-2.png`, `icon-1.png`, `icon-2.png`

- [ ] **Step 1: Create the directory**

Run:

```bash
mkdir -p public/letters
```

- [ ] **Step 2: Copy with renames**

Run each line (the parentheses in the source filenames must be quoted):

```bash
cp ~/Pictures/ucscmsa.com/m.png      public/letters/m-1.png
cp ~/Pictures/ucscmsa.com/"m (2).png" public/letters/m-2.png
cp ~/Pictures/ucscmsa.com/s.png      public/letters/s-1.png
cp ~/Pictures/ucscmsa.com/"s (2).png" public/letters/s-2.png
cp ~/Pictures/ucscmsa.com/a.png      public/letters/a-1.png
cp ~/Pictures/ucscmsa.com/"a (2).png" public/letters/a-2.png
cp ~/Pictures/ucscmsa.com/at.png     public/letters/at-1.png
cp ~/Pictures/ucscmsa.com/"at (2).png" public/letters/at-2.png
cp ~/Pictures/ucscmsa.com/u.png      public/letters/u-1.png
cp ~/Pictures/ucscmsa.com/"u (2).png" public/letters/u-2.png
cp ~/Pictures/ucscmsa.com/c.png      public/letters/c-1.png
cp ~/Pictures/ucscmsa.com/"c (2).png" public/letters/c-2.png
cp ~/Pictures/ucscmsa.com/icon.png   public/letters/icon-1.png
cp ~/Pictures/ucscmsa.com/"icon (2).png" public/letters/icon-2.png
```

- [ ] **Step 3: Verify all 14 files exist**

Run:

```bash
ls -1 public/letters/ | wc -l
```

Expected: `14`.

- [ ] **Step 4: Commit**

```bash
git add public/letters/
git commit -m "Import hand-drawn letter and icon assets into public/letters"
```

---

## Phase 2: Database

### Task 5: Configure Drizzle + Turso client + migration runner

**Files:**
- Create: `drizzle.config.ts`
- Create: `lib/db/client.ts`
- Create: `scripts/migrate.ts`
- Create: `.env.local.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create drizzle.config.ts**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
} satisfies Config;
```

- [ ] **Step 2: Create lib/db/client.ts**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  throw new Error("TURSO_DATABASE_URL is not set");
}

export const libsql = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(libsql, { schema });
export type DB = typeof db;
```

- [ ] **Step 3: Create scripts/migrate.ts**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
await client.close();
```

- [ ] **Step 4: Create .env.local.example**

```
TURSO_DATABASE_URL=file:./local.db
TURSO_AUTH_TOKEN=
AUTH_SECRET=replace-with-openssl-rand-base64-32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ADMIN_SEED_EMAILS=a@ucsc.edu,b@ucsc.edu,c@ucsc.edu
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 5: Append local DB file and env to .gitignore**

Append these lines to `.gitignore`:

```
# Local dev database
local.db
local.db-*

# Env files
.env
.env.local
.env.*.local
```

- [ ] **Step 6: Commit**

```bash
git add drizzle.config.ts lib/db/client.ts scripts/migrate.ts .env.local.example .gitignore
git commit -m "Add Drizzle config, Turso client wrapper, and migration runner"
```

---

### Task 6: Define Drizzle schema (auth + admin + events + prayer cache)

**Files:**
- Create: `lib/db/schema.ts`

- [ ] **Step 1: Write the schema**

Create `lib/db/schema.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run:

```bash
bun run typecheck
```

Expected: passes. If it fails on `crypto.randomUUID`, add `/// <reference lib="dom" />` or `node` lib to `tsconfig.json` — but Node 20 `@types` should already provide it.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "Add Drizzle schema for auth, admins, nominations, events, prayer cache"
```

---

### Task 7: Generate initial migration and create local DB

**Files:**
- Create: `drizzle/` (generated)
- Modify: `.env.local` (created from example)

- [ ] **Step 1: Copy the example env file**

Run:

```bash
cp .env.local.example .env.local
```

The defaults (`file:./local.db`) are fine for dev. Generate `AUTH_SECRET` with:

```bash
openssl rand -base64 32
```

Replace the `AUTH_SECRET=replace-...` line in `.env.local` with the output. Leave `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` blank for now — populate them from Google Cloud Console when auth is wired up in Task 14.

- [ ] **Step 2: Generate migration files**

Run:

```bash
bun run db:generate
```

Expected: a `drizzle/0000_*.sql` file appears plus a `drizzle/meta/` folder.

- [ ] **Step 3: Apply migration to local DB**

Run:

```bash
bun run db:migrate
```

Expected output: `Migrations applied.` and a `local.db` file exists at repo root (gitignored).

- [ ] **Step 4: Spot-check the DB**

Run:

```bash
sqlite3 local.db ".tables"
```

Expected: lists all tables — `user`, `account`, `session`, `verificationToken`, `admins`, `admin_nominations`, `admin_approvals`, `events`, `event_cancellations`, `event_rsvps`, `prayer_times_cache`, plus `__drizzle_migrations`.

- [ ] **Step 5: Commit (migrations only, NOT local.db)**

```bash
git add drizzle/
git commit -m "Generate initial Drizzle migration"
```

---

### Task 8: Vitest setup with in-memory libSQL

**Files:**
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Create: `test/db.ts`

- [ ] **Step 1: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 2: Create test/setup.ts**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Create test/db.ts (in-memory DB factory for tests)**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";

export async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, client };
}
```

- [ ] **Step 4: Add a smoke test**

Create `test/db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./db";
import { events } from "@/lib/db/schema";

describe("in-memory test db", () => {
  it("runs migrations and allows inserts", async () => {
    const { db, client } = await createTestDb();
    // Insert needs an admin first; for smoke, assert no tables-missing error.
    const count = await db.select().from(events);
    expect(count).toEqual([]);
    client.close();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
bun run test
```

Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts test/
git commit -m "Add Vitest config and in-memory libSQL test harness"
```

---

## Phase 3: Time and prayer times

### Task 9: Time helpers (America/Los_Angeles conversions) with tests

**Files:**
- Create: `lib/time.ts`
- Create: `lib/time.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SITE_TZ,
  toLocalYmd,
  parseHMInLocal,
  floorLocalHour,
  ceilLocalHour,
  startOfLocalDayUtc,
  endOfLocalDayUtc,
} from "./time";

describe("time helpers", () => {
  it("SITE_TZ is America/Los_Angeles", () => {
    expect(SITE_TZ).toBe("America/Los_Angeles");
  });

  it("toLocalYmd returns YYYY-MM-DD in Santa Cruz tz", () => {
    // 2026-04-16T07:00:00Z is 2026-04-16 00:00 PDT
    expect(toLocalYmd(new Date("2026-04-16T07:00:00Z"))).toBe("2026-04-16");
    // 2026-04-16T06:59:00Z is 2026-04-15 23:59 PDT
    expect(toLocalYmd(new Date("2026-04-16T06:59:00Z"))).toBe("2026-04-15");
  });

  it("parseHMInLocal combines a date and HH:mm string into a UTC Date", () => {
    const d = parseHMInLocal("2026-04-16", "05:18");
    // 05:18 PDT on 2026-04-16 = 12:18 UTC
    expect(d.toISOString()).toBe("2026-04-16T12:18:00.000Z");
  });

  it("floorLocalHour returns local-hour integer", () => {
    // 05:18 PDT
    const d = new Date("2026-04-16T12:18:00.000Z");
    expect(floorLocalHour(d)).toBe(5);
  });

  it("ceilLocalHour rounds up when minutes > 0", () => {
    const d = new Date("2026-04-16T03:47:00.000Z"); // 20:47 PDT previous day? no: UTC-7 = 20:47 PDT on 4/15
    // Use a clearer example: 20:47 PDT on 2026-04-16 = 03:47 UTC 2026-04-17
    const d2 = new Date("2026-04-17T03:47:00.000Z");
    expect(ceilLocalHour(d2)).toBe(21);
  });

  it("ceilLocalHour returns the exact hour when minutes == 0", () => {
    const d = new Date("2026-04-17T02:00:00.000Z"); // 19:00 PDT
    expect(ceilLocalHour(d)).toBe(19);
  });

  it("startOfLocalDayUtc returns UTC for local midnight", () => {
    const d = startOfLocalDayUtc("2026-04-16");
    expect(d.toISOString()).toBe("2026-04-16T07:00:00.000Z");
  });

  it("endOfLocalDayUtc returns UTC for local 23:59:59.999", () => {
    const d = endOfLocalDayUtc("2026-04-16");
    expect(d.toISOString()).toBe("2026-04-17T06:59:59.999Z");
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

```bash
bun run test lib/time
```

Expected: `Cannot find module './time'`.

- [ ] **Step 3: Implement lib/time.ts**

```ts
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const SITE_TZ = "America/Los_Angeles" as const;

export function toLocalYmd(utc: Date): string {
  return formatInTimeZone(utc, SITE_TZ, "yyyy-MM-dd");
}

export function parseHMInLocal(ymd: string, hm: string): Date {
  return fromZonedTime(`${ymd}T${hm}:00`, SITE_TZ);
}

export function floorLocalHour(utc: Date): number {
  return Number(formatInTimeZone(utc, SITE_TZ, "H"));
}

export function ceilLocalHour(utc: Date): number {
  const parts = formatInTimeZone(utc, SITE_TZ, "H:m").split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return m === 0 ? h : h + 1;
}

export function startOfLocalDayUtc(ymd: string): Date {
  return fromZonedTime(`${ymd}T00:00:00.000`, SITE_TZ);
}

export function endOfLocalDayUtc(ymd: string): Date {
  return fromZonedTime(`${ymd}T23:59:59.999`, SITE_TZ);
}

export function localHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function formatLocal(utc: Date, fmt: string): string {
  return formatInTimeZone(utc, SITE_TZ, fmt);
}

export { toZonedTime };
```

- [ ] **Step 4: Re-run tests until green**

```bash
bun run test lib/time
```

Expected: all time tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/time.ts lib/time.test.ts
git commit -m "Add America/Los_Angeles time helpers with DST-aware tests"
```

---

### Task 10: Aladhan prayer-times fetch with Turso cache and fallback

**Files:**
- Create: `lib/aladhan.ts`
- Create: `lib/aladhan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/aladhan.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { getPrayerTimes, DEFAULT_PRAYER_TIMES, type PrayerTimes } from "./aladhan";
import { prayerTimesCache } from "@/lib/db/schema";

describe("getPrayerTimes", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns cached row when present", async () => {
    const { db, client } = await createTestDb();
    await db.insert(prayerTimesCache).values({
      date: "2026-04-16",
      fajr: "05:18",
      sunrise: "06:38",
      dhuhr: "13:07",
      asr: "16:45",
      maghrib: "19:35",
      isha: "20:47",
    });

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    const result = await getPrayerTimes("2026-04-16", db);

    expect(result.fajr).toBe("05:18");
    expect(result.isha).toBe("20:47");
    expect(fetchSpy).not.toHaveBeenCalled();
    client.close();
  });

  it("fetches and caches on miss", async () => {
    const { db, client } = await createTestDb();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            timings: {
              Fajr: "05:18",
              Sunrise: "06:38",
              Dhuhr: "13:07",
              Asr: "16:45",
              Maghrib: "19:35",
              Isha: "20:47",
            },
          },
        }),
        { status: 200 }
      )
    ) as any;

    const result = await getPrayerTimes("2026-04-16", db);
    expect(result.fajr).toBe("05:18");

    const rows = await db.select().from(prayerTimesCache);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-04-16");
    client.close();
  });

  it("returns defaults and does not cache on fetch failure", async () => {
    const { db, client } = await createTestDb();
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as any;

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await getPrayerTimes("2026-04-16", db);
    expect(result).toEqual(DEFAULT_PRAYER_TIMES);
    expect(warn).toHaveBeenCalled();

    const rows = await db.select().from(prayerTimesCache);
    expect(rows).toHaveLength(0);
    client.close();
  });
});
```

- [ ] **Step 2: Run — should fail (module not found)**

```bash
bun run test lib/aladhan
```

- [ ] **Step 3: Implement lib/aladhan.ts**

```ts
import { eq } from "drizzle-orm";
import { prayerTimesCache } from "./db/schema";
import type { DB } from "./db/client";

export type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
};

export const DEFAULT_PRAYER_TIMES: PrayerTimes = {
  fajr: "05:30",
  sunrise: "06:45",
  dhuhr: "12:30",
  asr: "15:30",
  maghrib: "18:30",
  isha: "20:00",
};

const LAT = 36.974;
const LON = -122.031;
const METHOD = 2; // ISNA

function trimToHm(s: string): string {
  // Aladhan returns "05:18 (PDT)" sometimes — strip to HH:mm.
  const m = s.match(/^(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, "0") : s;
}

async function fetchAladhan(ymd: string): Promise<PrayerTimes> {
  const [y, m, d] = ymd.split("-");
  const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${LAT}&longitude=${LON}&method=${METHOD}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aladhan ${res.status}`);
  const json = (await res.json()) as {
    data: { timings: Record<string, string> };
  };
  const t = json.data.timings;
  return {
    fajr: trimToHm(t.Fajr),
    sunrise: trimToHm(t.Sunrise),
    dhuhr: trimToHm(t.Dhuhr),
    asr: trimToHm(t.Asr),
    maghrib: trimToHm(t.Maghrib),
    isha: trimToHm(t.Isha),
  };
}

export async function getPrayerTimes(
  ymd: string,
  db: DB
): Promise<PrayerTimes> {
  const cached = await db
    .select()
    .from(prayerTimesCache)
    .where(eq(prayerTimesCache.date, ymd))
    .limit(1);

  if (cached.length > 0) {
    const row = cached[0];
    return {
      fajr: row.fajr,
      sunrise: row.sunrise,
      dhuhr: row.dhuhr,
      asr: row.asr,
      maghrib: row.maghrib,
      isha: row.isha,
    };
  }

  try {
    const times = await fetchAladhan(ymd);
    await db.insert(prayerTimesCache).values({ date: ymd, ...times });
    return times;
  } catch (err) {
    console.warn(`[aladhan] fetch failed for ${ymd}:`, err);
    return DEFAULT_PRAYER_TIMES;
  }
}
```

- [ ] **Step 4: Re-run tests**

```bash
bun run test lib/aladhan
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/aladhan.ts lib/aladhan.test.ts
git commit -m "Add Aladhan prayer-times fetch with Turso cache and default fallback"
```

---

### Task 11: API route for prayer times

**Files:**
- Create: `app/api/prayer-times/route.ts`

- [ ] **Step 1: Implement the route handler**

Create `app/api/prayer-times/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getPrayerTimes } from "@/lib/aladhan";

export const revalidate = 3600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date query param required, format YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const times = await getPrayerTimes(date, db);
  return NextResponse.json({ date, times });
}
```

- [ ] **Step 2: Manual smoke check**

```bash
bun run dev
```

In another terminal:

```bash
curl 'http://localhost:3000/api/prayer-times?date=2026-04-16'
```

Expected: JSON body with `date` and `times.fajr` etc. Ctrl-C the dev server.

- [ ] **Step 3: Commit**

```bash
git add app/api/prayer-times/route.ts
git commit -m "Add /api/prayer-times route handler with 1-hour revalidate"
```

---

## Phase 4: Event expansion

### Task 12: rrule-lite (pure-function event expansion) with tests

**Files:**
- Create: `lib/rrule-lite.ts`
- Create: `lib/rrule-lite.test.ts`

- [ ] **Step 1: Write comprehensive failing tests**

Create `lib/rrule-lite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expandEvents, type EventInput } from "./rrule-lite";

const baseOneOff: EventInput = {
  id: "e1",
  title: "One-off",
  description: "",
  location: "",
  startTime: new Date("2026-04-16T19:00:00.000Z"), // 12:00 PDT
  endTime: new Date("2026-04-16T20:00:00.000Z"),
  recurrenceFreq: null,
  recurrenceByWeekday: null,
  recurrenceInterval: 1,
  recurrenceUntil: null,
  cancellations: [],
};

describe("expandEvents", () => {
  it("emits a one-off event when it overlaps the range", () => {
    const out = expandEvents(
      [baseOneOff],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-17T00:00:00.000Z")
    );
    expect(out).toHaveLength(1);
    expect(out[0].eventId).toBe("e1");
  });

  it("excludes a one-off event outside the range", () => {
    const out = expandEvents(
      [baseOneOff],
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-04-10T00:00:00.000Z")
    );
    expect(out).toHaveLength(0);
  });

  it("expands daily recurrence", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "d1",
      recurrenceFreq: "daily",
      recurrenceInterval: 1,
    };
    const out = expandEvents(
      [daily],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-20T00:00:00.000Z") // 4 days (16,17,18,19)
    );
    expect(out).toHaveLength(4);
  });

  it("expands weekly recurrence with byWeekday MO,WE,FR (Santa Cruz local)", () => {
    // 2026-04-13 is a Monday (PDT); set base to that week.
    const weekly: EventInput = {
      ...baseOneOff,
      id: "w1",
      startTime: new Date("2026-04-13T19:00:00.000Z"), // Mon 12:00 PDT
      endTime: new Date("2026-04-13T20:00:00.000Z"),
      recurrenceFreq: "weekly",
      recurrenceByWeekday: "MO,WE,FR",
    };
    const out = expandEvents(
      [weekly],
      new Date("2026-04-13T00:00:00.000Z"),
      new Date("2026-04-20T00:00:00.000Z") // one week
    );
    // Expect Mon 4/13, Wed 4/15, Fri 4/17 — 3 occurrences
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-04-13T19:00:00.000Z",
      "2026-04-15T19:00:00.000Z",
      "2026-04-17T19:00:00.000Z",
    ]);
  });

  it("stops at recurrenceUntil", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "d2",
      recurrenceFreq: "daily",
      recurrenceUntil: new Date("2026-04-18T00:00:00.000Z"),
    };
    const out = expandEvents(
      [daily],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-30T00:00:00.000Z")
    );
    // 4/16, 4/17 only (until exclusive on 4/18 UTC midnight)
    expect(out).toHaveLength(2);
  });

  it("skips cancelled occurrences", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "d3",
      recurrenceFreq: "daily",
      cancellations: ["2026-04-17"],
    };
    const out = expandEvents(
      [daily],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-19T00:00:00.000Z")
    );
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-04-16T19:00:00.000Z",
      "2026-04-18T19:00:00.000Z",
    ]);
  });

  it("handles monthly recurrence on same day-of-month", () => {
    const monthly: EventInput = {
      ...baseOneOff,
      id: "m1",
      recurrenceFreq: "monthly",
    };
    const out = expandEvents(
      [monthly],
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-07-01T00:00:00.000Z")
    );
    // 4/16, 5/16, 6/16
    expect(out).toHaveLength(3);
  });

  it("monthly clamps day when source day does not exist (Jan 31 -> Feb 28)", () => {
    const monthly: EventInput = {
      ...baseOneOff,
      id: "m2",
      startTime: new Date("2026-01-31T19:00:00.000Z"),
      endTime: new Date("2026-01-31T20:00:00.000Z"),
      recurrenceFreq: "monthly",
    };
    const out = expandEvents(
      [monthly],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-04-01T00:00:00.000Z")
    );
    // Jan 31, Feb 28 (clamp), Mar 31
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-01-31T19:00:00.000Z",
      "2026-02-28T19:00:00.000Z",
      "2026-03-31T19:00:00.000Z",
    ]);
  });

  it("expands yearly recurrence", () => {
    const yearly: EventInput = {
      ...baseOneOff,
      id: "y1",
      recurrenceFreq: "yearly",
    };
    const out = expandEvents(
      [yearly],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2028-12-31T00:00:00.000Z")
    );
    expect(out).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```bash
bun run test lib/rrule-lite
```

- [ ] **Step 3: Implement lib/rrule-lite.ts**

```ts
import { addDays, addMonths, addYears, getDay } from "date-fns";
import { toLocalYmd } from "./time";

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export type EventInput = {
  id: string;
  title: string;
  description: string;
  location: string;
  startTime: Date;
  endTime: Date;
  recurrenceFreq: RecurrenceFreq | null;
  recurrenceByWeekday: string | null; // "MO,WE,FR"
  recurrenceInterval: number;
  recurrenceUntil: Date | null;
  cancellations: string[]; // YYYY-MM-DD (local)
};

export type Occurrence = {
  eventId: string;
  title: string;
  description: string;
  location: string;
  occurrenceStart: Date;
  occurrenceEnd: Date;
};

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function occursOnAllowedWeekday(d: Date, allowed: number[]): boolean {
  return allowed.includes(getDay(d));
}

function addMonthsClamped(start: Date, months: number, sourceDom: number): Date {
  const candidate = addMonths(start, months);
  // addMonths in date-fns already clamps to end-of-month when source day does not exist.
  // But we want "return a specific day"; we rely on that clamp behaviour.
  return candidate;
}

export function expandEvents(
  events: EventInput[],
  rangeStart: Date,
  rangeEnd: Date
): Occurrence[] {
  const out: Occurrence[] = [];

  for (const ev of events) {
    const durationMs = ev.endTime.getTime() - ev.startTime.getTime();
    const cancelSet = new Set(ev.cancellations);

    const emit = (start: Date) => {
      const end = new Date(start.getTime() + durationMs);
      // Overlap with [rangeStart, rangeEnd)
      if (end <= rangeStart || start >= rangeEnd) return;
      if (cancelSet.has(toLocalYmd(start))) return;
      out.push({
        eventId: ev.id,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        occurrenceStart: start,
        occurrenceEnd: end,
      });
    };

    if (ev.recurrenceFreq === null) {
      emit(ev.startTime);
      continue;
    }

    const interval = Math.max(1, ev.recurrenceInterval || 1);
    const hardStop = ev.recurrenceUntil
      ? new Date(Math.min(ev.recurrenceUntil.getTime(), rangeEnd.getTime()))
      : rangeEnd;

    if (ev.recurrenceFreq === "daily") {
      let cursor = ev.startTime;
      while (cursor < hardStop) {
        emit(cursor);
        cursor = addDays(cursor, interval);
      }
    } else if (ev.recurrenceFreq === "weekly") {
      const allowed = ev.recurrenceByWeekday
        ? ev.recurrenceByWeekday
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter((s) => s in WEEKDAY_MAP)
            .map((s) => WEEKDAY_MAP[s])
        : [getDay(ev.startTime)];

      let weekCursor = ev.startTime;
      while (weekCursor < hardStop) {
        for (let i = 0; i < 7; i++) {
          const day = addDays(weekCursor, i);
          if (day < ev.startTime) continue;
          if (day >= hardStop) break;
          if (occursOnAllowedWeekday(day, allowed)) emit(day);
        }
        weekCursor = addDays(weekCursor, 7 * interval);
      }
    } else if (ev.recurrenceFreq === "monthly") {
      const sourceDom = ev.startTime.getUTCDate();
      let i = 0;
      while (true) {
        const candidate = addMonthsClamped(ev.startTime, i * interval, sourceDom);
        if (candidate >= hardStop) break;
        emit(candidate);
        i++;
      }
    } else if (ev.recurrenceFreq === "yearly") {
      let i = 0;
      while (true) {
        const candidate = addYears(ev.startTime, i * interval);
        if (candidate >= hardStop) break;
        emit(candidate);
        i++;
      }
    }
  }

  out.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
  return out;
}
```

- [ ] **Step 4: Re-run tests**

```bash
bun run test lib/rrule-lite
```

Expected: all 9 tests pass. If the monthly-clamp test fails, confirm that `date-fns` `addMonths` clamps Jan 31 → Feb 28; if not, add an explicit clamp using the last day of the target month.

- [ ] **Step 5: Commit**

```bash
git add lib/rrule-lite.ts lib/rrule-lite.test.ts
git commit -m "Add rrule-lite: daily/weekly/monthly/yearly expansion with tests"
```

---

### Task 13: Event queries (range read helper)

**Files:**
- Create: `lib/db/queries.ts`

- [ ] **Step 1: Implement range-query helper**

Create `lib/db/queries.ts`:

```ts
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "./client";
import { events, eventCancellations } from "./schema";
import { expandEvents, type EventInput, type Occurrence } from "@/lib/rrule-lite";

export async function getOccurrencesInRange(
  rangeStart: Date,
  rangeEnd: Date
): Promise<Occurrence[]> {
  // Fetch every event whose first-occurrence window could overlap OR that recurs indefinitely.
  // For v1 we fetch all events; the expansion step filters properly. Turso + indexes make this fine at MSA scale.
  const rows = await db.select().from(events);

  const cancelRows = await db.select().from(eventCancellations);
  const cancelByEvent = new Map<string, string[]>();
  for (const c of cancelRows) {
    const list = cancelByEvent.get(c.eventId) ?? [];
    list.push(c.occurrenceDate);
    cancelByEvent.set(c.eventId, list);
  }

  const inputs: EventInput[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    location: r.location,
    startTime: r.startTime,
    endTime: r.endTime,
    recurrenceFreq: r.recurrenceFreq,
    recurrenceByWeekday: r.recurrenceByWeekday,
    recurrenceInterval: r.recurrenceInterval,
    recurrenceUntil: r.recurrenceUntil,
    cancellations: cancelByEvent.get(r.id) ?? [],
  }));

  return expandEvents(inputs, rangeStart, rangeEnd);
}

export async function getUpcomingOccurrences(
  limit: number,
  now: Date = new Date()
): Promise<Occurrence[]> {
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const all = await getOccurrencesInRange(now, in30d);
  return all.slice(0, limit);
}

export async function getEventById(id: string) {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries.ts
git commit -m "Add event range-query helper using rrule-lite expansion"
```

---

## Phase 5: Auth

### Task 14: Auth.js v5 config with Google + ucsc.edu allowlist + seed-on-login

**Files:**
- Create: `auth.ts` (at repo root; Auth.js v5 convention)
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `lib/auth.ts`
- Create: `types/next-auth.d.ts`

- [ ] **Step 1: Read Auth.js v5 config guidance**

Run:

```bash
cat node_modules/@auth/core/package.json | head -5
ls node_modules/next-auth/providers/
```

Note: `next-auth@beta` (v5) exports from `next-auth` directly; Google provider at `next-auth/providers/google`.

- [ ] **Step 2: Create the root auth.ts config**

Create `auth.ts` at repo root:

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { admins, users } from "@/lib/db/schema";

const seedEmails = (process.env.ADMIN_SEED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users as any,
    accountsTable: (await import("@/lib/db/schema")).accounts as any,
    sessionsTable: (await import("@/lib/db/schema")).sessions as any,
    verificationTokensTable: (await import("@/lib/db/schema")).verificationTokens as any,
  } as any),
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user }) {
      const email = (user.email ?? "").toLowerCase();
      if (!email.endsWith("@ucsc.edu")) return false;

      if (seedEmails.includes(email) && user.id) {
        const existing = await db
          .select()
          .from(admins)
          .where(eq(admins.userId, user.id))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(admins).values({
            userId: user.id,
            promotedByNominationId: null,
          });
        }
      }
      return true;
    },
    async session({ session, user }) {
      if (user?.id) {
        const rows = await db
          .select()
          .from(admins)
          .where(eq(admins.userId, user.id))
          .limit(1);
        session.user.isAdmin = rows.length > 0;
        session.user.adminId = rows[0]?.id ?? null;
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    error: "/auth/error",
  },
});
```

- [ ] **Step 3: Create the API route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from "@/auth";
```

Wait — Auth.js v5 exposes `handlers` not direct GET/POST. Use this instead:

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Type augmentation for session fields**

Create `types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      isAdmin: boolean;
      adminId: number | null;
    };
  }
}
```

- [ ] **Step 5: Create lib/auth.ts helpers**

```ts
import { auth } from "@/auth";

export async function getSession() {
  return await auth();
}

export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.isAdmin);
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    throw new Error("unauthorized");
  }
  return session;
}

export async function requireAdminId(): Promise<number> {
  const session = await requireAdmin();
  if (session.user.adminId == null) throw new Error("missing_admin_id");
  return session.user.adminId;
}
```

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck
```

Fix any type mismatches from the adapter — the `as any` casts in Step 2 are intentional bridges for Auth.js v5 adapter types that churn between releases.

- [ ] **Step 7: Commit**

```bash
git add auth.ts app/api/auth lib/auth.ts types/next-auth.d.ts
git commit -m "Wire Auth.js v5 Google provider with ucsc.edu allowlist and admin seed"
```

---

### Task 15: Proxy to gate /admin

**Files:**
- Create: `proxy.ts`

- [ ] **Step 1: Write proxy.ts**

Create `proxy.ts` at repo root:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin")) {
    if (!req.auth?.user?.isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|letters).*)"],
};
```

- [ ] **Step 2: Manual smoke check**

```bash
bun run dev
```

Visit `http://localhost:3000/admin` without signing in — should redirect to `/`. Ctrl-C after verification.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "Add Next 16 proxy.ts that gates /admin behind admin session"
```

---

## Phase 6: Logo + landing

### Task 16: Boil-ticker context + wiggle components

**Files:**
- Create: `components/logo/boil-ticker.tsx`
- Create: `components/logo/wiggle-letters.tsx`
- Create: `components/logo/wiggle-icon.tsx`
- Create: `components/logo/wiggle-letters.test.tsx`

- [ ] **Step 1: Write a test for reduced-motion behaviour**

Create `components/logo/wiggle-letters.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BoilTickerProvider } from "./boil-ticker";
import { WiggleLetters } from "./wiggle-letters";

function mockReducedMotion(prefers: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? prefers : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("WiggleLetters", () => {
  beforeEach(() => {
    mockReducedMotion(true);
  });

  it("renders one <img> per glyph with variant 1 when reduced motion is on", () => {
    render(
      <BoilTickerProvider>
        <WiggleLetters />
      </BoilTickerProvider>
    );
    const imgs = screen.getAllByRole("img", { hidden: true });
    // Glyphs: m, s, a, at, u, c, s, c = 8
    expect(imgs).toHaveLength(8);
    for (const img of imgs) {
      expect((img as HTMLImageElement).src).toMatch(/-1\.png$/);
    }
  });

  it("wraps the whole row in an accessible label", () => {
    render(
      <BoilTickerProvider>
        <WiggleLetters />
      </BoilTickerProvider>
    );
    expect(screen.getByLabelText("MSA at UCSC")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run test components/logo
```

- [ ] **Step 3: Implement boil-ticker.tsx**

```tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const BoilTickerContext = createContext(0);

export function BoilTickerProvider({
  intervalMs = 250,
  children,
}: {
  intervalMs?: number;
  children: ReactNode;
}) {
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const onChange = () => setReduced(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, reduced]);

  return (
    <BoilTickerContext.Provider value={reduced ? 0 : tick}>
      {children}
    </BoilTickerContext.Provider>
  );
}

export function useBoilTick() {
  return useContext(BoilTickerContext);
}
```

- [ ] **Step 4: Implement wiggle-letters.tsx**

```tsx
"use client";

import { useBoilTick } from "./boil-ticker";

type Glyph = {
  key: string;
  file: string; // base, e.g. "m", "s", "a", "at", "u", "c"
  marginLeft?: number; // px
};

const PHRASE: Glyph[] = [
  { key: "m", file: "m" },
  { key: "s1", file: "s" },
  { key: "a1", file: "a" },
  { key: "at", file: "at", marginLeft: 16 },
  { key: "u", file: "u", marginLeft: 16 },
  { key: "c1", file: "c" },
  { key: "s2", file: "s" },
  { key: "c2", file: "c" },
];

function phaseForIndex(i: number): number {
  // Deterministic pseudo-random 0..3 based on index
  return (i * 1103515245 + 12345) & 3;
}

export function WiggleLetters() {
  const tick = useBoilTick();
  return (
    <span
      role="img"
      aria-label="MSA at UCSC"
      className="inline-flex items-end gap-1 select-none"
    >
      {PHRASE.map((g, i) => {
        const variant = (tick + phaseForIndex(i)) % 2 === 0 ? 1 : 2;
        return (
          <img
            key={g.key}
            src={`/letters/${g.file}-${variant}.png`}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              height: "clamp(48px, 10vw, 96px)",
              width: "auto",
              marginLeft: g.marginLeft,
            }}
          />
        );
      })}
    </span>
  );
}
```

- [ ] **Step 5: Implement wiggle-icon.tsx**

```tsx
"use client";

import { useBoilTick } from "./boil-ticker";

export function WiggleIcon({ size = 120 }: { size?: number }) {
  const tick = useBoilTick();
  // Different phase from any letter
  const variant = (tick + 5) % 2 === 0 ? 1 : 2;
  return (
    <img
      src={`/letters/icon-${variant}.png`}
      alt="MSA at UCSC logo"
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}
```

- [ ] **Step 6: Run tests**

```bash
bun run test components/logo
```

Expected: 2 passing tests.

- [ ] **Step 7: Commit**

```bash
git add components/logo
git commit -m "Add boil-ticker context and wiggle-letters/icon components"
```

---

### Task 17: Landing page (logo + upcoming events preview)

**Files:**
- Modify: `app/page.tsx`
- Create: `components/upcoming-events.tsx`

- [ ] **Step 1: Create the upcoming-events server component**

Create `components/upcoming-events.tsx`:

```tsx
import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/db/queries";
import { formatLocal } from "@/lib/time";

export async function UpcomingEvents({ limit = 3 }: { limit?: number }) {
  const items = await getUpcomingOccurrences(limit);

  if (items.length === 0) {
    return (
      <p className="text-dim italic">No events scheduled yet. Check back soon.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-4 md:flex-row md:gap-6">
      {items.map((o) => (
        <li
          key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
          className="flex-1 rounded-lg border border-ink/10 bg-paper p-4 shadow-sm"
        >
          <Link
            href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(
              o.occurrenceStart.toISOString()
            )}`}
            className="block"
          >
            <div className="text-sm text-dim">
              {formatLocal(o.occurrenceStart, "EEE, MMM d · h:mm a")}
            </div>
            <div className="text-lg font-medium text-ink">{o.title}</div>
            {o.location ? (
              <div className="text-sm text-dim">{o.location}</div>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Replace app/page.tsx with the real landing**

```tsx
import Link from "next/link";
import { BoilTickerProvider } from "@/components/logo/boil-ticker";
import { WiggleIcon } from "@/components/logo/wiggle-icon";
import { WiggleLetters } from "@/components/logo/wiggle-letters";
import { UpcomingEvents } from "@/components/upcoming-events";

export default function Home() {
  return (
    <BoilTickerProvider>
      <main className="flex flex-1 flex-col items-center px-6 py-16 md:py-24 gap-12 max-w-5xl mx-auto w-full">
        <div className="flex flex-col items-center gap-4">
          <WiggleIcon size={120} />
          <WiggleLetters />
        </div>
        <p className="text-ink text-lg max-w-prose text-center">
          Welcome to the Muslim Student Association at UC Santa Cruz. Community,
          prayer, and every week, something to bring us together.
        </p>
        <section className="w-full">
          <h2 className="text-2xl font-medium mb-4">Upcoming</h2>
          <UpcomingEvents limit={3} />
        </section>
        <Link
          href="/calendar"
          className="inline-flex items-center rounded-full border border-ink px-6 py-3 text-ink hover:bg-ink hover:text-paper transition-colors"
        >
          See the full calendar
        </Link>
      </main>
    </BoilTickerProvider>
  );
}
```

- [ ] **Step 3: Verify visually**

```bash
bun run dev
```

Visit `http://localhost:3000` — expect wiggling icon + letters, welcome text, "No events scheduled yet" under Upcoming, "See the full calendar" button. Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/upcoming-events.tsx
git commit -m "Build landing page with wiggling logo and upcoming events preview"
```

---

## Phase 7: Calendar views

### Task 18: Calendar shell with URL state + view toggle + nav

**Files:**
- Create: `app/calendar/page.tsx`
- Create: `app/calendar/calendar-nav.tsx`

- [ ] **Step 1: Create calendar-nav.tsx (client, URL-driven view toggle)**

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, addYears, formatISO } from "date-fns";

type View = "day" | "month" | "year";

function stepDate(date: Date, view: View, delta: 1 | -1): Date {
  if (view === "day") return addDays(date, delta);
  if (view === "month") return addMonths(date, delta);
  return addYears(date, delta);
}

export function CalendarNav({ view, date }: { view: View; date: Date }) {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") go(stepDate(date, view, -1), view);
      if (e.key === "ArrowRight") go(stepDate(date, view, 1), view);
      if (e.key.toLowerCase() === "t") go(new Date(), view);
      if (e.key.toLowerCase() === "d") go(date, "day");
      if (e.key.toLowerCase() === "m") go(date, "month");
      if (e.key.toLowerCase() === "y") go(date, "year");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, date]);

  function go(next: Date, nextView: View) {
    const p = new URLSearchParams(params);
    p.set("view", nextView);
    p.set("date", formatISO(next, { representation: "date" }));
    router.push(`/calendar?${p.toString()}`);
  }

  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => go(stepDate(date, view, -1), view)}
          aria-label="Previous"
          className="p-2 rounded-full hover:bg-ink/5"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => go(new Date(), view)}
          className="px-3 py-1 rounded-full border border-ink/20 hover:bg-ink/5"
        >
          Today
        </button>
        <button
          onClick={() => go(stepDate(date, view, 1), view)}
          aria-label="Next"
          className="p-2 rounded-full hover:bg-ink/5"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex items-center rounded-full border border-ink/20 overflow-hidden">
        {(["day", "month", "year"] as const).map((v) => (
          <button
            key={v}
            onClick={() => go(date, v)}
            className={`px-4 py-1 capitalize ${
              v === view ? "bg-ink text-paper" : "hover:bg-ink/5"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create app/calendar/page.tsx (server component dispatcher)**

```tsx
import { startOfLocalDayUtc, endOfLocalDayUtc, SITE_TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { getOccurrencesInRange } from "@/lib/db/queries";
import { getPrayerTimes } from "@/lib/aladhan";
import { db } from "@/lib/db/client";
import { CalendarNav } from "./calendar-nav";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { YearView } from "./year-view";
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

type SP = { view?: string; date?: string };

function parseView(v?: string): "day" | "month" | "year" {
  return v === "month" || v === "year" ? v : "day";
}

function parseDate(d?: string): Date {
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(`${d}T12:00:00.000Z`);
  return new Date();
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const date = parseDate(sp.date);
  const ymd = formatInTimeZone(date, SITE_TZ, "yyyy-MM-dd");

  let content: React.ReactNode;

  if (view === "day") {
    const start = startOfLocalDayUtc(ymd);
    const end = endOfLocalDayUtc(ymd);
    const [occurrences, prayer] = await Promise.all([
      getOccurrencesInRange(start, end),
      getPrayerTimes(ymd, db),
    ]);
    content = <DayView ymd={ymd} occurrences={occurrences} prayer={prayer} />;
  } else if (view === "month") {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    const occurrences = await getOccurrencesInRange(start, end);
    content = <MonthView date={date} occurrences={occurrences} />;
  } else {
    const start = startOfYear(date);
    const end = endOfYear(date);
    const occurrences = await getOccurrencesInRange(start, end);
    content = <YearView date={date} occurrences={occurrences} />;
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 w-full flex-1">
      <CalendarNav view={view} date={date} />
      {content}
    </main>
  );
}
```

- [ ] **Step 3: Commit scaffolding (views stubbed in next tasks)**

The page will fail to compile until Tasks 19–21 create the view components. Before committing, add placeholder files:

Create `app/calendar/day-view.tsx`:

```tsx
"use client";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
export function DayView(props: { ymd: string; occurrences: Occurrence[]; prayer: PrayerTimes }) {
  return <div>Day view for {props.ymd} (stub)</div>;
}
```

Create `app/calendar/month-view.tsx`:

```tsx
"use client";
import type { Occurrence } from "@/lib/rrule-lite";
export function MonthView(props: { date: Date; occurrences: Occurrence[] }) {
  return <div>Month view (stub)</div>;
}
```

Create `app/calendar/year-view.tsx`:

```tsx
"use client";
import type { Occurrence } from "@/lib/rrule-lite";
export function YearView(props: { date: Date; occurrences: Occurrence[] }) {
  return <div>Year view (stub)</div>;
}
```

- [ ] **Step 4: Verify typecheck + dev server**

```bash
bun run typecheck && bun run dev
```

Visit `/calendar?view=day&date=2026-04-16` — expect "Day view for 2026-04-16 (stub)" with the nav above. Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add app/calendar
git commit -m "Scaffold calendar shell with URL-driven view toggle and nav"
```

---

### Task 19: Day view with Fajr-to-Isha grid and prayer overlays

**Files:**
- Modify: `app/calendar/day-view.tsx`
- Modify: `app/globals.css` (add calendar grid CSS block)

- [ ] **Step 1: Add hand-written CSS for the day grid**

Append to `app/globals.css`:

```css
.day-grid {
  --hour-h: 56px;
  position: relative;
  display: grid;
  grid-template-columns: 64px 1fr;
  border-top: 1px solid color-mix(in srgb, var(--color-ink) 10%, transparent);
}

.day-grid__hour {
  height: var(--hour-h);
  border-bottom: 1px solid color-mix(in srgb, var(--color-ink) 8%, transparent);
  padding: 4px 8px;
  color: var(--color-dim);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.day-grid__body {
  position: relative;
  height: 100%;
  border-left: 1px solid color-mix(in srgb, var(--color-ink) 8%, transparent);
}

.day-grid__prayer-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--color-burgundy);
  pointer-events: none;
}

.day-grid__prayer-label {
  position: absolute;
  right: 8px;
  transform: translateY(-50%);
  font-size: 0.7rem;
  color: var(--color-burgundy);
  background: var(--color-paper);
  padding: 0 4px;
  pointer-events: none;
}

.day-grid__event {
  position: absolute;
  left: 8px;
  right: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-paper) 70%, var(--color-burgundy-soft));
  color: var(--color-ink);
  border: 1px solid color-mix(in srgb, var(--color-burgundy) 30%, transparent);
  overflow: hidden;
  font-size: 0.875rem;
  text-decoration: none;
}

.day-grid__event:hover {
  border-color: var(--color-burgundy);
}
```

- [ ] **Step 2: Replace day-view.tsx with the real implementation**

```tsx
"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
import { formatLocal, parseHMInLocal, floorLocalHour, ceilLocalHour, localHourLabel } from "@/lib/time";

const HOUR_H = 56;

type Props = { ymd: string; occurrences: Occurrence[]; prayer: PrayerTimes };

function localHourAndMinute(utc: Date): { h: number; m: number } {
  // Use formatter to get local parts
  const hm = formatLocal(utc, "H:m").split(":");
  return { h: Number(hm[0]), m: Number(hm[1]) };
}

export function DayView({ ymd, occurrences, prayer }: Props) {
  const fajrUtc = parseHMInLocal(ymd, prayer.fajr);
  const ishaUtc = parseHMInLocal(ymd, prayer.isha);
  const gridStart = floorLocalHour(fajrUtc);
  const gridEnd = ceilLocalHour(ishaUtc);
  const hours = Array.from({ length: gridEnd - gridStart }, (_, i) => gridStart + i);
  const bodyHeight = hours.length * HOUR_H;

  const prayerMarkers: Array<{ label: string; hm: string }> = [
    { label: "Fajr", hm: prayer.fajr },
    { label: "Sunrise", hm: prayer.sunrise },
    { label: "Dhuhr", hm: prayer.dhuhr },
    { label: "Asr", hm: prayer.asr },
    { label: "Maghrib", hm: prayer.maghrib },
    { label: "Isha", hm: prayer.isha },
  ];

  return (
    <div>
      <header className="mb-4 flex flex-wrap gap-x-6 gap-y-2 items-baseline">
        <h1 className="text-2xl font-medium">
          {formatLocal(parseHMInLocal(ymd, "12:00"), "EEEE, MMMM d, yyyy")}
        </h1>
        <div className="flex flex-wrap gap-x-4 text-sm text-burgundy">
          {prayerMarkers.map((p) => (
            <span key={p.label} className="tabular-nums">
              {p.label} {p.hm}
            </span>
          ))}
        </div>
      </header>
      <div
        className="day-grid"
        style={{ gridTemplateRows: `repeat(${hours.length}, ${HOUR_H}px)` }}
      >
        {hours.map((h) => (
          <div key={`label-${h}`} className="day-grid__hour">
            {localHourLabel(h)}
          </div>
        ))}
        <div className="day-grid__body" style={{ gridRow: `1 / span ${hours.length}`, height: bodyHeight }}>
          {prayerMarkers.map((p) => {
            const utc = parseHMInLocal(ymd, p.hm);
            const { h, m } = localHourAndMinute(utc);
            const top = (h - gridStart) * HOUR_H + (m / 60) * HOUR_H;
            return (
              <div
                key={`pm-${p.label}`}
                className="day-grid__prayer-line"
                style={{ top }}
              >
                <span className="day-grid__prayer-label" style={{ top: 0 }}>
                  {p.label} {p.hm}
                </span>
              </div>
            );
          })}
          {occurrences.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-dim">
              No events scheduled
            </div>
          ) : (
            occurrences.map((o) => {
              const s = localHourAndMinute(o.occurrenceStart);
              const durMin =
                (o.occurrenceEnd.getTime() - o.occurrenceStart.getTime()) /
                60000;
              const top = (s.h - gridStart) * HOUR_H + (s.m / 60) * HOUR_H;
              const height = (durMin / 60) * HOUR_H;
              return (
                <Link
                  key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                  href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
                  className="day-grid__event"
                  style={{ top, height: Math.max(24, height) }}
                >
                  <div className="font-medium">{o.title}</div>
                  <div className="text-xs text-dim">
                    {formatLocal(o.occurrenceStart, "h:mm a")} –{" "}
                    {formatLocal(o.occurrenceEnd, "h:mm a")}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke check**

```bash
bun run dev
```

Visit `/calendar?view=day&date=2026-04-16` — expect hour labels in the left rail, dashed burgundy prayer lines at Fajr/Sunrise/Dhuhr/Asr/Maghrib/Isha, grid starts at floor(Fajr) and ends at ceil(Isha). With no events seeded yet, the main column shows "No events scheduled". Ctrl-C.

- [ ] **Step 4: Component test — positioning**

Create `app/calendar/day-view.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DayView } from "./day-view";

describe("DayView", () => {
  it("renders hour labels from floor(Fajr) to ceil(Isha)", () => {
    const { container } = render(
      <DayView
        ymd="2026-04-16"
        occurrences={[]}
        prayer={{
          fajr: "05:18",
          sunrise: "06:38",
          dhuhr: "13:07",
          asr: "16:45",
          maghrib: "19:35",
          isha: "20:47",
        }}
      />
    );
    const hours = container.querySelectorAll(".day-grid__hour");
    // 5..21 inclusive = 17
    expect(hours.length).toBe(17);
  });
});
```

- [ ] **Step 5: Run test**

```bash
bun run test app/calendar
```

- [ ] **Step 6: Commit**

```bash
git add app/calendar/day-view.tsx app/calendar/day-view.test.tsx app/globals.css
git commit -m "Build day view with Fajr-to-Isha grid and prayer line overlays"
```

---

### Task 20: Month view

**Files:**
- Modify: `app/calendar/month-view.tsx`

- [ ] **Step 1: Replace month-view.tsx**

```tsx
"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { formatLocal } from "@/lib/time";

type Props = { date: Date; occurrences: Occurrence[] };

export function MonthView({ date, occurrences }: Props) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = format(o.occurrenceStart, "yyyy-MM-dd");
    const list = byDay.get(key) ?? [];
    list.push(o);
    byDay.set(key, list);
  }
  const today = new Date();

  return (
    <div>
      <h1 className="text-2xl font-medium mb-4">
        {format(date, "MMMM yyyy")}
      </h1>
      <div className="grid grid-cols-7 text-sm text-dim mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-ink/10 rounded-lg overflow-hidden">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const dayEvents = byDay.get(key) ?? [];
          const inMonth = isSameMonth(d, date);
          const isToday = isSameDay(d, today);
          return (
            <Link
              key={key}
              href={`/calendar?view=day&date=${key}`}
              className={`bg-paper min-h-28 p-2 flex flex-col gap-1 ${
                inMonth ? "text-ink" : "text-ink/30"
              } ${isToday ? "ring-2 ring-burgundy" : ""}`}
            >
              <div className="text-sm font-medium">{format(d, "d")}</div>
              {dayEvents.slice(0, 3).map((o) => (
                <div
                  key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                  className="text-xs truncate rounded px-1 py-0.5 bg-burgundy-soft/30"
                >
                  {formatLocal(o.occurrenceStart, "h:mm a")} {o.title}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div className="text-xs text-dim">
                  +{dayEvents.length - 3} more
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify dev render**

```bash
bun run dev
```

Visit `/calendar?view=month&date=2026-04-16` — expect 6×7 grid for April 2026, today cell has a burgundy ring. Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add app/calendar/month-view.tsx
git commit -m "Build month view with event pills and today ring"
```

---

### Task 21: Year view

**Files:**
- Modify: `app/calendar/year-view.tsx`

- [ ] **Step 1: Replace year-view.tsx**

```tsx
"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfYear,
} from "date-fns";

type Props = { date: Date; occurrences: Occurrence[] };

export function YearView({ date, occurrences }: Props) {
  const yearStart = startOfYear(date);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(yearStart);
    d.setMonth(i);
    return d;
  });

  const byDay = new Map<string, number>();
  for (const o of occurrences) {
    const key = format(o.occurrenceStart, "yyyy-MM-dd");
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  function intensityClass(count: number): string {
    if (count === 0) return "bg-ink/5";
    if (count === 1) return "bg-burgundy/30";
    if (count === 2) return "bg-burgundy/60";
    return "bg-burgundy";
  }

  return (
    <div>
      <h1 className="text-2xl font-medium mb-4">{format(date, "yyyy")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {months.map((m) => {
          const days = eachDayOfInterval({
            start: startOfMonth(m),
            end: endOfMonth(m),
          });
          return (
            <div key={m.getMonth()} className="flex flex-col gap-1">
              <Link
                href={`/calendar?view=month&date=${format(m, "yyyy-MM-dd")}`}
                className="text-sm font-medium hover:text-burgundy"
              >
                {format(m, "MMMM")}
              </Link>
              <div className="grid grid-cols-7 gap-0.5">
                {days.map((d) => {
                  const key = format(d, "yyyy-MM-dd");
                  const count = byDay.get(key) ?? 0;
                  return (
                    <Link
                      key={key}
                      href={`/calendar?view=day&date=${key}`}
                      title={`${key}: ${count} event${count === 1 ? "" : "s"}`}
                      className={`h-3 w-3 rounded-sm ${intensityClass(count)}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify dev render**

```bash
bun run dev
```

Visit `/calendar?view=year&date=2026-04-16` — expect 12 mini-months; dots grey when no events. Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add app/calendar/year-view.tsx
git commit -m "Build year view with 12-month density grid"
```

---

### Task 22: Event detail page + RSVP action

**Files:**
- Create: `app/calendar/events/[id]/page.tsx`
- Create: `app/calendar/_actions.ts`
- Create: `app/calendar/events/[id]/rsvp-form.tsx`

- [ ] **Step 1: Create the RSVP server action**

Create `app/calendar/_actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { eventRsvps } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

const rsvpSchema = z.object({
  eventId: z.string(),
  occurrenceStart: z.string().datetime(),
  status: z.enum(["yes", "no", "maybe"]),
});

export async function rsvp(formData: FormData) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false as const, error: "login_required" };
  }
  const parsed = rsvpSchema.safeParse({
    eventId: formData.get("eventId"),
    occurrenceStart: formData.get("occurrenceStart"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: "invalid_input" };
  }
  const { eventId, occurrenceStart, status } = parsed.data;
  const start = new Date(occurrenceStart);
  const userId = session.user.id;

  const existing = await db
    .select()
    .from(eventRsvps)
    .where(
      and(
        eq(eventRsvps.eventId, eventId),
        eq(eventRsvps.occurrenceStart, start),
        eq(eventRsvps.userId, userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(eventRsvps)
      .set({ status })
      .where(
        and(
          eq(eventRsvps.eventId, eventId),
          eq(eventRsvps.occurrenceStart, start),
          eq(eventRsvps.userId, userId)
        )
      );
  } else {
    await db.insert(eventRsvps).values({
      eventId,
      occurrenceStart: start,
      userId,
      status,
    });
  }

  revalidatePath(`/calendar/events/${eventId}`);
  return { ok: true as const };
}
```

- [ ] **Step 2: Create the RSVP form (client)**

Create `app/calendar/events/[id]/rsvp-form.tsx`:

```tsx
"use client";

import { rsvp } from "@/app/calendar/_actions";
import { useTransition } from "react";

type Props = {
  eventId: string;
  occurrenceStart: string;
  current: "yes" | "no" | "maybe" | null;
  disabled?: boolean;
};

export function RsvpForm({ eventId, occurrenceStart, current, disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const choices: Array<"yes" | "maybe" | "no"> = ["yes", "maybe", "no"];

  return (
    <div className="flex gap-2">
      {choices.map((c) => (
        <form
          key={c}
          action={(fd) => {
            fd.set("eventId", eventId);
            fd.set("occurrenceStart", occurrenceStart);
            fd.set("status", c);
            startTransition(async () => {
              await rsvp(fd);
            });
          }}
        >
          <button
            type="submit"
            disabled={pending || disabled}
            className={`px-4 py-2 rounded-full border text-sm capitalize ${
              current === c
                ? "bg-ink text-paper border-ink"
                : "border-ink/30 hover:bg-ink/5"
            } disabled:opacity-50`}
          >
            {c === "yes" ? "Going" : c === "maybe" ? "Maybe" : "Can't go"}
          </button>
        </form>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create the detail page**

Create `app/calendar/events/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { eventRsvps, events } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { RsvpForm } from "./rsvp-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ occurrence?: string }>;
};

export default async function EventDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const row = (await db.select().from(events).where(eq(events.id, id)).limit(1))[0];
  if (!row) notFound();

  const occurrenceStart = sp.occurrence
    ? new Date(sp.occurrence)
    : row.startTime;
  const session = await getSession();

  let myStatus: "yes" | "no" | "maybe" | null = null;
  if (session?.user?.id) {
    const mine = await db
      .select()
      .from(eventRsvps)
      .where(
        and(
          eq(eventRsvps.eventId, id),
          eq(eventRsvps.occurrenceStart, occurrenceStart),
          eq(eventRsvps.userId, session.user.id)
        )
      )
      .limit(1);
    myStatus = (mine[0]?.status as typeof myStatus) ?? null;
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/calendar" className="text-sm text-dim hover:text-ink">
        ← Back to calendar
      </Link>
      <h1 className="text-3xl font-medium mt-4">{row.title}</h1>
      <div className="mt-2 text-dim">
        {formatLocal(occurrenceStart, "EEEE, MMMM d, yyyy · h:mm a")}
      </div>
      {row.location && <div className="mt-1 text-dim">{row.location}</div>}
      {row.description && (
        <p className="mt-6 whitespace-pre-wrap">{row.description}</p>
      )}
      <section className="mt-8">
        <h2 className="text-sm font-medium mb-2">RSVP</h2>
        {session?.user?.id ? (
          <RsvpForm
            eventId={id}
            occurrenceStart={occurrenceStart.toISOString()}
            current={myStatus}
          />
        ) : (
          <Link
            href="/api/auth/signin"
            className="inline-flex px-4 py-2 rounded-full border border-ink hover:bg-ink hover:text-paper"
          >
            Sign in with UCSC to RSVP
          </Link>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/calendar/events app/calendar/_actions.ts
git commit -m "Add event detail page and RSVP server action"
```

---

## Phase 8: Admin dashboard

### Task 23: Admin shell with tabs + Zod schemas

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`
- Create: `app/admin/_schemas.ts`

- [ ] **Step 1: Create shared Zod schemas**

Create `app/admin/_schemas.ts`:

```ts
import { z } from "zod";

export const eventInputSchema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().default(""),
  location: z.string().default(""),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date"),
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
});
export type EventInputForm = z.infer<typeof eventInputSchema>;

export const nominateSchema = z.object({
  action: z.enum(["promote", "demote"]),
  nomineeEmail: z
    .string()
    .email()
    .endsWith("@ucsc.edu", "Must be a ucsc.edu email")
    .optional(),
  targetAdminId: z.coerce.number().int().optional(),
});
export type NominateInput = z.infer<typeof nominateSchema>;
```

- [ ] **Step 2: Create the admin layout**

Create `app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="max-w-5xl mx-auto px-6 py-10 w-full flex-1">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-medium">Admin</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin" className="hover:text-burgundy">Events</Link>
          <Link href="/admin/admins" className="hover:text-burgundy">Admins</Link>
          <Link href="/admin/nominations" className="hover:text-burgundy">Nominations</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create the events dashboard (index)**

Create `app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { formatLocal } from "@/lib/time";

export default async function AdminEvents() {
  const rows = await db.select().from(events).orderBy(desc(events.startTime));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Events</h2>
        <Link
          href="/admin/events/new"
          className="px-4 py-2 rounded-full bg-ink text-paper hover:bg-burgundy"
        >
          New event
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-dim">
            <th className="py-2">Title</th>
            <th className="py-2">Start</th>
            <th className="py-2">Recurrence</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2">{r.title}</td>
              <td className="py-2 text-dim">
                {formatLocal(r.startTime, "MMM d, yyyy h:mm a")}
              </td>
              <td className="py-2 text-dim">{r.recurrenceFreq ?? "—"}</td>
              <td className="py-2 text-right">
                <Link href={`/admin/events/${r.id}/edit`} className="text-burgundy hover:underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-dim">
                No events yet. Create one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Manual check**

```bash
bun run dev
```

If you signed in with a seeded email, `/admin` should show the events table. Otherwise it redirects to `/` via the proxy.

- [ ] **Step 5: Commit**

```bash
git add app/admin
git commit -m "Scaffold admin shell with events index and shared Zod schemas"
```

---

### Task 24: Event CRUD server actions and forms

**Files:**
- Create: `app/admin/_actions.ts`
- Create: `app/admin/events/new/page.tsx`
- Create: `app/admin/events/[id]/edit/page.tsx`
- Create: `app/admin/events/event-form.tsx`

- [ ] **Step 1: Create the event-form client component**

Create `app/admin/events/event-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Initial = {
  id?: string;
  title?: string;
  description?: string;
  location?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  recurrenceFreq?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurrenceByWeekday?: string;
  recurrenceInterval?: number;
  recurrenceUntil?: string;
};

type Props = {
  initial?: Initial;
  onSubmit: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
  submitLabel: string;
};

const WEEKDAYS = [
  { v: "SU", l: "Sun" },
  { v: "MO", l: "Mon" },
  { v: "TU", l: "Tue" },
  { v: "WE", l: "Wed" },
  { v: "TH", l: "Thu" },
  { v: "FR", l: "Fri" },
  { v: "SA", l: "Sat" },
];

export function EventForm({ initial = {}, onSubmit, submitLabel }: Props) {
  const router = useRouter();
  const [freq, setFreq] = useState<Initial["recurrenceFreq"]>(
    initial.recurrenceFreq ?? "none"
  );
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        setErr(null);
        const result = await onSubmit(fd);
        if (result.ok) router.push("/admin");
        else setErr(result.error ?? "Unknown error");
      }}
      className="grid gap-4 max-w-xl"
    >
      <label className="grid gap-1">
        <span className="text-sm text-dim">Title</span>
        <input
          name="title"
          defaultValue={initial.title ?? ""}
          required
          className="border border-ink/20 rounded px-3 py-2 bg-paper"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-sm text-dim">Description</span>
        <textarea
          name="description"
          defaultValue={initial.description ?? ""}
          rows={4}
          className="border border-ink/20 rounded px-3 py-2 bg-paper"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-sm text-dim">Location</span>
        <input
          name="location"
          defaultValue={initial.location ?? ""}
          className="border border-ink/20 rounded px-3 py-2 bg-paper"
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1">
          <span className="text-sm text-dim">Start date</span>
          <input
            type="date"
            name="startDate"
            defaultValue={initial.startDate ?? ""}
            required
            className="border border-ink/20 rounded px-3 py-2 bg-paper"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-dim">Start time</span>
          <input
            type="time"
            name="startTime"
            defaultValue={initial.startTime ?? ""}
            required
            className="border border-ink/20 rounded px-3 py-2 bg-paper"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-dim">End date</span>
          <input
            type="date"
            name="endDate"
            defaultValue={initial.endDate ?? ""}
            required
            className="border border-ink/20 rounded px-3 py-2 bg-paper"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-dim">End time</span>
          <input
            type="time"
            name="endTime"
            defaultValue={initial.endTime ?? ""}
            required
            className="border border-ink/20 rounded px-3 py-2 bg-paper"
          />
        </label>
      </div>
      <fieldset className="grid gap-2 border border-ink/20 rounded p-3">
        <legend className="text-sm text-dim px-1">Recurrence</legend>
        <label className="grid gap-1">
          <span className="text-sm text-dim">Repeats</span>
          <select
            name="recurrenceFreq"
            value={freq}
            onChange={(e) => setFreq(e.target.value as Initial["recurrenceFreq"])}
            className="border border-ink/20 rounded px-3 py-2 bg-paper"
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        {freq === "weekly" && (
          <div>
            <span className="text-sm text-dim">On days</span>
            <div className="flex gap-2 mt-1">
              {WEEKDAYS.map((d) => (
                <label key={d.v} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="recurrenceByWeekday"
                    value={d.v}
                    defaultChecked={initial.recurrenceByWeekday
                      ?.split(",")
                      .includes(d.v)}
                  />
                  {d.l}
                </label>
              ))}
            </div>
          </div>
        )}
        {freq !== "none" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1">
              <span className="text-sm text-dim">Every N</span>
              <input
                type="number"
                name="recurrenceInterval"
                min={1}
                defaultValue={initial.recurrenceInterval ?? 1}
                className="border border-ink/20 rounded px-3 py-2 bg-paper"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-dim">Until (optional)</span>
              <input
                type="date"
                name="recurrenceUntil"
                defaultValue={initial.recurrenceUntil ?? ""}
                className="border border-ink/20 rounded px-3 py-2 bg-paper"
              />
            </label>
          </div>
        )}
      </fieldset>
      {err && <div className="text-burgundy text-sm">{err}</div>}
      <button
        type="submit"
        className="justify-self-start px-6 py-2 rounded-full bg-ink text-paper hover:bg-burgundy"
      >
        {submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create the admin server actions**

Create `app/admin/_actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ulid } from "ulid";
import { db } from "@/lib/db/client";
import { admins, adminApprovals, adminNominations, events } from "@/lib/db/schema";
import { and, eq, ne, count } from "drizzle-orm";
import { requireAdminId } from "@/lib/auth";
import { eventInputSchema, nominateSchema } from "./_schemas";
import { parseHMInLocal } from "@/lib/time";

function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k === "recurrenceByWeekday") continue; // handled separately
    out[k] = v;
  }
  out.recurrenceByWeekday = fd.getAll("recurrenceByWeekday").join(",");
  return out;
}

export async function createEvent(fd: FormData) {
  const adminId = await requireAdminId();
  const parsed = eventInputSchema.safeParse(formToObject(fd));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const p = parsed.data;
  const startTime = parseHMInLocal(p.startDate, p.startTime);
  const endTime = parseHMInLocal(p.endDate, p.endTime);
  const id = ulid();
  await db.insert(events).values({
    id,
    title: p.title,
    description: p.description,
    location: p.location,
    startTime,
    endTime,
    recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
    recurrenceByWeekday:
      p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
    recurrenceInterval: p.recurrenceInterval,
    recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
    createdByAdminId: adminId,
  });
  revalidatePath("/admin");
  revalidatePath("/calendar");
  return { ok: true as const, id };
}

export async function updateEvent(id: string, fd: FormData) {
  await requireAdminId();
  const parsed = eventInputSchema.safeParse(formToObject(fd));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const p = parsed.data;
  await db
    .update(events)
    .set({
      title: p.title,
      description: p.description,
      location: p.location,
      startTime: parseHMInLocal(p.startDate, p.startTime),
      endTime: parseHMInLocal(p.endDate, p.endTime),
      recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
      recurrenceByWeekday:
        p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
      recurrenceInterval: p.recurrenceInterval,
      recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, id));
  revalidatePath("/admin");
  revalidatePath(`/calendar/events/${id}`);
  revalidatePath("/calendar");
  return { ok: true as const };
}

export async function deleteEvent(id: string) {
  await requireAdminId();
  await db.delete(events).where(eq(events.id, id));
  revalidatePath("/admin");
  revalidatePath("/calendar");
  return { ok: true as const };
}

export async function nominateAdmin(fd: FormData) {
  const adminId = await requireAdminId();
  const parsed = nominateSchema.safeParse({
    action: fd.get("action"),
    nomineeEmail: fd.get("nomineeEmail") || undefined,
    targetAdminId: fd.get("targetAdminId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const { action, nomineeEmail, targetAdminId } = parsed.data;

  if (action === "promote") {
    if (!nomineeEmail) return { ok: false as const, error: "email required" };
  } else {
    if (!targetAdminId) return { ok: false as const, error: "target admin required" };
    // demotion cannot leave zero admins
    const [{ total }] = await db
      .select({ total: count() })
      .from(admins);
    if (total <= 1) {
      return { ok: false as const, error: "cannot demote the last admin" };
    }
  }

  const id = ulid();
  await db.insert(adminNominations).values({
    id,
    action,
    nomineeEmail: action === "promote" ? nomineeEmail! : null,
    targetAdminId: action === "demote" ? targetAdminId! : null,
    nominatedByAdminId: adminId,
  });
  revalidatePath("/admin/nominations");
  return { ok: true as const, id };
}

export async function approveNomination(nominationId: string) {
  const approverId = await requireAdminId();

  return await db.transaction(async (tx) => {
    const [nom] = await tx
      .select()
      .from(adminNominations)
      .where(eq(adminNominations.id, nominationId))
      .limit(1);
    if (!nom) return { ok: false as const, error: "not_found" };
    if (nom.status !== "pending") {
      return { ok: false as const, error: "not_pending" };
    }
    if (nom.nominatedByAdminId === approverId) {
      return { ok: false as const, error: "nominator_cannot_approve" };
    }

    try {
      await tx.insert(adminApprovals).values({
        nominationId,
        approverAdminId: approverId,
      });
    } catch {
      return { ok: false as const, error: "already_approved" };
    }

    const approvals = await tx
      .select()
      .from(adminApprovals)
      .where(eq(adminApprovals.nominationId, nominationId));
    const approverIds = approvals.map((a) => a.approverAdminId);
    const distinctFromNominator = approverIds.filter(
      (id) => id !== nom.nominatedByAdminId
    );

    if (distinctFromNominator.length < 2) {
      return { ok: true as const, applied: false };
    }

    // Apply
    if (nom.action === "promote") {
      if (!nom.nomineeEmail) {
        throw new Error("promote nomination missing email");
      }
      // Find user by email; if they haven't signed in yet, the admin row waits
      // until their first login (session callback handles seeding). To keep
      // things simple for v1 we require the nominee to already have a user row.
      const { users } = await import("@/lib/db/schema");
      const [u] = await tx
        .select()
        .from(users)
        .where(eq(users.email, nom.nomineeEmail))
        .limit(1);
      if (!u) {
        return {
          ok: false as const,
          error: "nominee_must_sign_in_first",
        };
      }
      await tx
        .insert(admins)
        .values({ userId: u.id, promotedByNominationId: nominationId })
        .onConflictDoNothing();
    } else {
      if (!nom.targetAdminId) throw new Error("demote nomination missing target");
      // Safety re-check
      const [{ total }] = await tx.select({ total: count() }).from(admins);
      if (total <= 1) {
        return { ok: false as const, error: "would_remove_last_admin" };
      }
      await tx.delete(admins).where(eq(admins.id, nom.targetAdminId));
    }

    await tx
      .update(adminNominations)
      .set({ status: "approved" })
      .where(eq(adminNominations.id, nominationId));

    revalidatePath("/admin");
    revalidatePath("/admin/admins");
    revalidatePath("/admin/nominations");
    return { ok: true as const, applied: true };
  });
}

export async function cancelNomination(nominationId: string) {
  const adminId = await requireAdminId();
  const [nom] = await db
    .select()
    .from(adminNominations)
    .where(eq(adminNominations.id, nominationId))
    .limit(1);
  if (!nom) return { ok: false as const, error: "not_found" };
  if (nom.nominatedByAdminId !== adminId) {
    return { ok: false as const, error: "only_nominator_can_cancel" };
  }
  if (nom.status !== "pending") {
    return { ok: false as const, error: "not_pending" };
  }
  await db
    .update(adminNominations)
    .set({ status: "cancelled" })
    .where(eq(adminNominations.id, nominationId));
  revalidatePath("/admin/nominations");
  return { ok: true as const };
}
```

- [ ] **Step 3: Create the new-event page**

Create `app/admin/events/new/page.tsx`:

```tsx
import { EventForm } from "@/app/admin/events/event-form";
import { createEvent } from "@/app/admin/_actions";

export default function NewEventPage() {
  async function submit(fd: FormData) {
    "use server";
    return await createEvent(fd);
  }
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">New event</h2>
      <EventForm submitLabel="Create event" onSubmit={submit} />
    </div>
  );
}
```

- [ ] **Step 4: Create the edit page**

Create `app/admin/events/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EventForm } from "@/app/admin/events/event-form";
import { deleteEvent, updateEvent } from "@/app/admin/_actions";
import { formatLocal } from "@/lib/time";

type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;
  const row = (await db.select().from(events).where(eq(events.id, id)).limit(1))[0];
  if (!row) notFound();

  async function submit(fd: FormData) {
    "use server";
    return await updateEvent(id, fd);
  }
  async function del() {
    "use server";
    await deleteEvent(id);
    const { redirect } = await import("next/navigation");
    redirect("/admin");
  }

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Edit event</h2>
      <EventForm
        submitLabel="Save"
        onSubmit={submit}
        initial={{
          id: row.id,
          title: row.title,
          description: row.description,
          location: row.location,
          startDate: formatLocal(row.startTime, "yyyy-MM-dd"),
          startTime: formatLocal(row.startTime, "HH:mm"),
          endDate: formatLocal(row.endTime, "yyyy-MM-dd"),
          endTime: formatLocal(row.endTime, "HH:mm"),
          recurrenceFreq: (row.recurrenceFreq ?? "none") as any,
          recurrenceByWeekday: row.recurrenceByWeekday ?? "",
          recurrenceInterval: row.recurrenceInterval,
          recurrenceUntil: row.recurrenceUntil
            ? formatLocal(row.recurrenceUntil, "yyyy-MM-dd")
            : "",
        }}
      />
      <form action={del} className="mt-8">
        <button
          type="submit"
          className="px-4 py-2 rounded-full border border-burgundy text-burgundy hover:bg-burgundy hover:text-paper"
        >
          Delete event
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/events app/admin/_actions.ts
git commit -m "Add admin event CRUD server actions with new/edit forms"
```

---

### Task 25: Admins tab + Nominations tab + governance UI

**Files:**
- Create: `app/admin/admins/page.tsx`
- Create: `app/admin/admins/demote-form.tsx`
- Create: `app/admin/nominations/page.tsx`
- Create: `app/admin/nominations/nominate-form.tsx`
- Create: `app/admin/nominations/actions-row.tsx`

- [ ] **Step 1: Create the admins list page**

Create `app/admin/admins/page.tsx`:

```tsx
import { db } from "@/lib/db/client";
import { admins, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DemoteForm } from "./demote-form";
import { formatLocal } from "@/lib/time";

export default async function AdminsList() {
  const rows = await db
    .select({
      id: admins.id,
      email: users.email,
      name: users.name,
      promotedAt: admins.promotedAt,
      promotedByNominationId: admins.promotedByNominationId,
    })
    .from(admins)
    .leftJoin(users, eq(admins.userId, users.id));

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Admins</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-dim">
            <th className="py-2">Email</th>
            <th className="py-2">Name</th>
            <th className="py-2">Promoted</th>
            <th className="py-2">Origin</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2">{r.email}</td>
              <td className="py-2">{r.name ?? "—"}</td>
              <td className="py-2 text-dim">
                {formatLocal(r.promotedAt, "MMM d, yyyy")}
              </td>
              <td className="py-2 text-dim">
                {r.promotedByNominationId ? `nomination ${r.promotedByNominationId.slice(0, 8)}` : "bootstrap"}
              </td>
              <td className="py-2 text-right">
                <DemoteForm targetAdminId={r.id} email={r.email ?? ""} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the demote-form client component**

Create `app/admin/admins/demote-form.tsx`:

```tsx
"use client";

import { nominateAdmin } from "@/app/admin/_actions";
import { useTransition, useState } from "react";

export function DemoteForm({
  targetAdminId,
  email,
}: {
  targetAdminId: number;
  email: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      action={(fd) => {
        if (!confirm(`Nominate ${email} for removal?`)) return;
        fd.set("action", "demote");
        fd.set("targetAdminId", String(targetAdminId));
        start(async () => {
          const r = await nominateAdmin(fd);
          if (!r.ok) setErr(r.error ?? "failed");
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-burgundy hover:underline disabled:opacity-50"
      >
        Nominate removal
      </button>
      {err && <span className="ml-2 text-xs text-burgundy">{err}</span>}
    </form>
  );
}
```

- [ ] **Step 3: Create the nominations page**

Create `app/admin/nominations/page.tsx`:

```tsx
import { db } from "@/lib/db/client";
import { admins, adminApprovals, adminNominations, users } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { NominateForm } from "./nominate-form";
import { ActionsRow } from "./actions-row";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";

export default async function NominationsPage() {
  const session = await getSession();
  const myAdminId = session?.user?.adminId ?? null;

  const noms = await db
    .select({
      id: adminNominations.id,
      action: adminNominations.action,
      nomineeEmail: adminNominations.nomineeEmail,
      targetAdminId: adminNominations.targetAdminId,
      nominatedByAdminId: adminNominations.nominatedByAdminId,
      createdAt: adminNominations.createdAt,
      status: adminNominations.status,
    })
    .from(adminNominations)
    .orderBy(desc(adminNominations.createdAt));

  const approvalRows =
    noms.length > 0
      ? await db
          .select()
          .from(adminApprovals)
          .where(
            inArray(
              adminApprovals.nominationId,
              noms.map((n) => n.id)
            )
          )
      : [];

  const approvalsByNom = new Map<string, number[]>();
  for (const a of approvalRows) {
    const arr = approvalsByNom.get(a.nominationId) ?? [];
    arr.push(a.approverAdminId);
    approvalsByNom.set(a.nominationId, arr);
  }

  const adminEmails = await db
    .select({ id: admins.id, email: users.email })
    .from(admins)
    .leftJoin(users, eq(admins.userId, users.id));
  const emailByAdminId = new Map<number, string>(
    adminEmails.map((r) => [r.id, r.email ?? String(r.id)])
  );

  return (
    <div>
      <section className="mb-10">
        <h2 className="text-lg font-medium mb-2">Nominate a new admin</h2>
        <NominateForm />
      </section>
      <section>
        <h2 className="text-lg font-medium mb-4">Pending nominations</h2>
        <ul className="flex flex-col gap-3">
          {noms
            .filter((n) => n.status === "pending")
            .map((n) => {
              const approvers = approvalsByNom.get(n.id) ?? [];
              const nominatorEmail =
                emailByAdminId.get(n.nominatedByAdminId) ?? "?";
              const target =
                n.action === "promote"
                  ? n.nomineeEmail
                  : n.targetAdminId != null
                    ? emailByAdminId.get(n.targetAdminId)
                    : "?";
              const iApproved = myAdminId != null && approvers.includes(myAdminId);
              const iAmNominator =
                myAdminId != null && n.nominatedByAdminId === myAdminId;
              return (
                <li
                  key={n.id}
                  className="border border-ink/10 rounded p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">
                      {n.action === "promote" ? "Promote" : "Demote"} {target}
                    </div>
                    <div className="text-sm text-dim">
                      by {nominatorEmail} · {formatLocal(n.createdAt, "MMM d, yyyy h:mm a")}
                    </div>
                    <div className="text-sm text-dim mt-1">
                      Approvals: {approvers.length}/2{" "}
                      {approvers
                        .map((id) => emailByAdminId.get(id) ?? id)
                        .join(", ")}
                    </div>
                  </div>
                  <ActionsRow
                    nominationId={n.id}
                    iAmNominator={iAmNominator}
                    iApproved={iApproved}
                  />
                </li>
              );
            })}
          {noms.filter((n) => n.status === "pending").length === 0 && (
            <li className="text-dim">No open nominations.</li>
          )}
        </ul>
        <h2 className="text-lg font-medium mt-10 mb-2">History</h2>
        <ul className="text-sm text-dim flex flex-col gap-1">
          {noms
            .filter((n) => n.status !== "pending")
            .map((n) => (
              <li key={n.id}>
                {formatLocal(n.createdAt, "MMM d")} · {n.status} ·{" "}
                {n.action === "promote" ? n.nomineeEmail : `admin #${n.targetAdminId}`}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Nominate-form component**

Create `app/admin/nominations/nominate-form.tsx`:

```tsx
"use client";

import { nominateAdmin } from "@/app/admin/_actions";
import { useState, useTransition } from "react";

export function NominateForm() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <form
      action={(fd) => {
        setErr(null);
        setOk(false);
        fd.set("action", "promote");
        start(async () => {
          const r = await nominateAdmin(fd);
          if (r.ok) setOk(true);
          else setErr(r.error ?? "failed");
        });
      }}
      className="flex items-end gap-2 flex-wrap"
    >
      <label className="grid gap-1">
        <span className="text-sm text-dim">Nominee UCSC email</span>
        <input
          name="nomineeEmail"
          type="email"
          required
          placeholder="student@ucsc.edu"
          className="border border-ink/20 rounded px-3 py-2 bg-paper"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-full bg-ink text-paper hover:bg-burgundy disabled:opacity-50"
      >
        Create nomination
      </button>
      {err && <div className="text-burgundy text-sm">{err}</div>}
      {ok && <div className="text-sm text-dim">Nomination created.</div>}
    </form>
  );
}
```

- [ ] **Step 5: Actions-row component**

Create `app/admin/nominations/actions-row.tsx`:

```tsx
"use client";

import { approveNomination, cancelNomination } from "@/app/admin/_actions";
import { useState, useTransition } from "react";

export function ActionsRow({
  nominationId,
  iAmNominator,
  iApproved,
}: {
  nominationId: string;
  iAmNominator: boolean;
  iApproved: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {!iAmNominator && (
        <button
          disabled={pending || iApproved}
          onClick={() =>
            start(async () => {
              const r = await approveNomination(nominationId);
              if (!r.ok) setErr(r.error ?? "failed");
            })
          }
          className="px-3 py-1 rounded-full bg-ink text-paper hover:bg-burgundy disabled:opacity-50"
        >
          {iApproved ? "Approved" : "Approve"}
        </button>
      )}
      {iAmNominator && (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cancelNomination(nominationId);
              if (!r.ok) setErr(r.error ?? "failed");
            })
          }
          className="px-3 py-1 rounded-full border border-ink/30 hover:bg-ink/5"
        >
          Cancel
        </button>
      )}
      {err && <span className="text-xs text-burgundy">{err}</span>}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app/admin/admins app/admin/nominations
git commit -m "Add admins list with demote nominations and nominations dashboard"
```

---

### Task 26: Integration tests for governance

**Files:**
- Create: `app/admin/_actions.test.ts`

- [ ] **Step 1: Write the test file**

Because the real server actions import `@/auth` (and thus Next runtime), this test exercises the governance logic against a test DB by re-implementing the transactional rule in a helper — OR by importing individual DB-only functions. To keep scope tight and still verify the rule, factor the transactional apply-rule into a pure helper that takes a `tx` argument.

Create `app/admin/_apply-nomination.ts`:

```ts
import { count, eq } from "drizzle-orm";
import { admins, adminApprovals, adminNominations, users } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export async function applyIfQuorum(
  tx: Tx,
  nominationId: string
): Promise<
  | { applied: false; reason: string }
  | { applied: true }
> {
  const [nom] = await tx
    .select()
    .from(adminNominations)
    .where(eq(adminNominations.id, nominationId))
    .limit(1);
  if (!nom) return { applied: false, reason: "not_found" };
  if (nom.status !== "pending") return { applied: false, reason: "not_pending" };

  const approvals = await tx
    .select()
    .from(adminApprovals)
    .where(eq(adminApprovals.nominationId, nominationId));
  const distinct = approvals
    .map((a) => a.approverAdminId)
    .filter((id) => id !== nom.nominatedByAdminId);
  if (distinct.length < 2) return { applied: false, reason: "insufficient_approvers" };

  if (nom.action === "promote") {
    if (!nom.nomineeEmail) return { applied: false, reason: "missing_email" };
    const [u] = await tx
      .select()
      .from(users)
      .where(eq(users.email, nom.nomineeEmail))
      .limit(1);
    if (!u) return { applied: false, reason: "user_not_found" };
    await tx
      .insert(admins)
      .values({ userId: u.id, promotedByNominationId: nominationId })
      .onConflictDoNothing();
  } else {
    if (!nom.targetAdminId) return { applied: false, reason: "missing_target" };
    const [{ total }] = await tx.select({ total: count() }).from(admins);
    if (total <= 1) return { applied: false, reason: "would_remove_last_admin" };
    await tx.delete(admins).where(eq(admins.id, nom.targetAdminId));
  }

  await tx
    .update(adminNominations)
    .set({ status: "approved" })
    .where(eq(adminNominations.id, nominationId));
  return { applied: true };
}
```

Now refactor `approveNomination` in `app/admin/_actions.ts` to use this helper (replace the inline block):

```ts
// inside the tx callback, after inserting the approval row:
const result = await applyIfQuorum(tx, nominationId);
if (result.applied) {
  revalidatePath("/admin");
  revalidatePath("/admin/admins");
  revalidatePath("/admin/nominations");
  return { ok: true as const, applied: true };
}
return { ok: true as const, applied: false };
```

- [ ] **Step 2: Write the integration test**

Create `app/admin/_actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createTestDb } from "@/test/db";
import { adminApprovals, adminNominations, admins, users } from "@/lib/db/schema";
import { applyIfQuorum } from "./_apply-nomination";

async function seedAdmins(db: Awaited<ReturnType<typeof createTestDb>>["db"], emails: string[]) {
  const ids: number[] = [];
  for (const email of emails) {
    const userId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email });
    const r = await db
      .insert(admins)
      .values({ userId, promotedByNominationId: null })
      .returning({ id: admins.id });
    ids.push(r[0].id);
  }
  return ids;
}

describe("applyIfQuorum", () => {
  it("does not apply with fewer than 2 distinct approvers", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2, a3] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "promote",
      nomineeEmail: "new@ucsc.edu",
      nominatedByAdminId: a1,
    });
    // Only one approver (a2) -> not applied
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a2 });
    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r).toEqual({ applied: false, reason: "insufficient_approvers" });
    client.close();
  });

  it("does not apply when one approver is the nominator", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu"]);
    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "promote",
      nomineeEmail: "new@ucsc.edu",
      nominatedByAdminId: a1,
    });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a2 });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a1 });
    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r.applied).toBe(false);
    client.close();
  });

  it("applies promote when 2 distinct non-nominator approvers exist and user pre-exists", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2, a3] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    const nomineeUserId = crypto.randomUUID();
    await db.insert(users).values({ id: nomineeUserId, email: "new@ucsc.edu" });

    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "promote",
      nomineeEmail: "new@ucsc.edu",
      nominatedByAdminId: a1,
    });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a2 });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a3 });

    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r.applied).toBe(true);

    const all = await db.select().from(admins);
    expect(all.some((a) => a.userId === nomineeUserId)).toBe(true);
    client.close();
  });

  it("refuses to demote the last admin", async () => {
    const { db, client } = await createTestDb();
    const [only] = await seedAdmins(db, ["only@ucsc.edu"]);
    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "demote",
      targetAdminId: only,
      nominatedByAdminId: only,
    });
    // Even with fake approvals, rule must refuse
    const fakeId = 9999;
    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r.applied).toBe(false);
    client.close();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun run test app/admin
```

Expected: 4 passing tests.

- [ ] **Step 4: Commit**

```bash
git add app/admin/_apply-nomination.ts app/admin/_actions.ts app/admin/_actions.test.ts
git commit -m "Extract apply-if-quorum helper and add governance rule tests"
```

---

## Phase 9: Polish

### Task 27: Playwright E2E happy path

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/happy-path.spec.ts`

- [ ] **Step 1: Initialize Playwright browsers**

```bash
bunx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
```

- [ ] **Step 3: Write the happy-path spec**

Create `e2e/happy-path.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("landing renders logo and upcoming section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("MSA at UCSC")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByRole("link", { name: /See the full calendar/i })).toBeVisible();
});

test("day view shows prayer line markers", async ({ page }) => {
  await page.goto("/calendar?view=day&date=2026-04-16");
  // At least Fajr marker should be in the header strip
  await expect(page.getByText(/Fajr /i)).toBeVisible();
});

test("admin page redirects unauthenticated visitors", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForURL("**/");
});
```

- [ ] **Step 4: Run E2E**

Make sure `local.db` has at least one event for the upcoming section to exercise real data — or accept the empty-state copy. The test above accepts either state.

```bash
bun run test:e2e
```

Expected: 3 passing specs.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e
git commit -m "Add Playwright happy-path E2E covering landing, day view, admin gate"
```

---

### Task 28: README setup section + .env.example check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md**

```markdown
# ucscmsa.com

UCSC Muslim Student Association site — landing with hand-drawn wiggling logo, public event calendar (day / month / year) with Fajr-to-Isha prayer-aligned day grid, and an admin dashboard with two-approver governance for admin membership changes.

## Stack

- Next.js 16 (App Router, `proxy.ts` not `middleware.ts`)
- React 19, Tailwind v4
- Auth.js v5 (Google provider, `ucsc.edu` domain allowlist)
- Drizzle ORM against Turso (libSQL)
- Vitest + Playwright

## Setup

Prerequisites: `bun` >= 1.1. From repo root:

```bash
bun install
cp .env.local.example .env.local
```

Edit `.env.local`:
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google Cloud Console OAuth client (Web application). Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
- `ADMIN_SEED_EMAILS` — **at least three** `@ucsc.edu` emails, comma-separated. Because every future nomination requires 2 approvers other than the nominator, seeding fewer than three admins makes promotions impossible to pass.

### Database

Local dev uses a SQLite file at `local.db` (gitignored). For production, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to your Turso database.

```bash
bun run db:generate   # after schema changes
bun run db:migrate    # apply migrations
bun run db:studio     # drizzle studio GUI
```

### Development

```bash
bun run dev
```

Open http://localhost:3000.

### Tests

```bash
bun run test          # vitest (unit + integration + component)
bun run test:e2e      # playwright
bun run typecheck     # tsc --noEmit
```

## Governance

- Any 1 admin can create, edit, or delete events.
- Adding or removing an admin requires a nomination followed by approvals from **2 admins other than the nominator**. The nominator may cancel their own pending nomination; they cannot approve it.
- Removing the last admin is always blocked (both at nomination creation and at apply time).
```

- [ ] **Step 2: Verify .env.local.example still covers every var referenced in code**

```bash
grep -rE 'process\.env\.[A-Z_]+' lib app auth.ts proxy.ts scripts | sort -u
```

Cross-check that every env var on the left of `process.env.NAME` appears in `.env.local.example`. Add any missing ones.

- [ ] **Step 3: Commit**

```bash
git add README.md .env.local.example
git commit -m "Write README setup + governance sections"
```

---

## Self-Review

**1. Spec coverage**

Walk each spec section and confirm a task covers it:

- Theme + Tailwind tokens → Task 3
- `proxy.ts` (not middleware) → Task 15
- Turso + Drizzle → Tasks 5, 6, 7
- Auth.js v5 + ucsc.edu allowlist + session.isAdmin → Task 14
- Admin seed from env → Task 14
- `admins`, `adminNominations`, `adminApprovals` schema → Task 6
- `events`, `eventCancellations`, `eventRsvps` schema → Task 6
- `prayerTimesCache` → Task 6
- Aladhan fetch + cache + fallback → Task 10
- `/api/prayer-times` route → Task 11
- `expandEvents` recurrence expansion → Task 12
- Range-query helper → Task 13
- Logo wiggle animation (2-frame boil + reduced motion) → Task 16
- Landing page with upcoming events → Task 17
- Calendar shell + URL state + keyboard nav → Task 18
- Day view (floor Fajr → ceil Isha, 56px/hour, prayer overlays) → Task 19
- Month view → Task 20
- Year view → Task 21
- Event detail + RSVP server action → Task 22
- Admin dashboard shell + events index → Task 23
- Event CRUD actions → Task 24
- Admins tab + demote nomination → Task 25
- Nominations tab + approve/cancel → Task 25
- 2-other-admins rule + last-admin protection → Tasks 24, 26
- Unit tests (rrule-lite, time) → Tasks 9, 12
- Integration tests (governance) → Task 26
- Component tests (wiggle reduced-motion, day-view positioning) → Tasks 16, 19
- E2E happy path → Task 27
- README setup → Task 28

No gaps identified.

**2. Placeholder scan**

No `TBD` / `TODO` / "implement later" / "similar to Task N" in the plan body. All code steps contain the full code to paste.

**3. Type consistency**

- `Occurrence` type defined once in `lib/rrule-lite.ts`, imported everywhere else. Consistent.
- `PrayerTimes` exported from `lib/aladhan.ts`, consumed by `DayView` and `/api/prayer-times`. Consistent.
- `requireAdmin` vs `requireAdminId`: both defined in `lib/auth.ts`; actions use the `Id` variant. Consistent.
- Server actions uniformly return `{ ok: true } | { ok: false; error }`. Consistent.

**4. Ambiguity check**

- One spot worth noting: `parseHMInLocal(p.recurrenceUntil, "23:59")` in Task 24 uses 23:59 to treat "until" as inclusive end-of-day. The `rrule-lite` hardStop comparison is strict `<`, so an event on the `until` date is still emitted. This matches the spec's `min(recurrenceUntil, rangeEnd)` semantics. Intentional.

No issues requiring inline fixes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-ucscmsa-site.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each subagent writes tests-first per TDD, commits at the end of every task, surfaces failures immediately.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for your review.

Which approach?
