# UCSC MSA Site — Design Spec

Date: 2026-04-16
Status: Approved, pending implementation plan

## Goal

Build the UCSC Muslim Student Association site at ucscmsa.com. Hand-drawn paper aesthetic with a wiggling moon-stars icon and wiggling "msa @ ucsc" letters on the landing page. Event calendar with day/month/year views, prayer-time-aligned day grid (Fajr to Isha), and an admin panel gated by a two-of-N approval rule for admin membership changes.

## Constraints & decisions already locked in

- **Framework:** Next.js 16.2.3 (App Router). Uses `proxy.ts` at repo root, NOT `middleware.ts` (deprecated in Next 16).
- **Styling:** Tailwind v4 utilities first; hand-written CSS in `app/globals.css` only when utilities get unwieldy (complex keyframes, multi-layer backgrounds, grid overlays).
- **Storage:** Turso (libSQL) + Drizzle ORM.
- **Auth:** Auth.js v5, Google provider, `ucsc.edu` domain allowlist.
- **Calendar day range:** floor(Fajr) to ceil(Isha), dynamic per date. Prayer data from aladhan.com ISNA method for Santa Cruz (36.974, -122.031).
- **Event model:** Single `events` table with recurrence columns (no separate "tasks" entity).
- **Calendar visibility:** Public read; login required to RSVP.
- **Admin governance:** Adding or removing an admin requires 2 approvers other than the nominator. Event mutations need only 1 admin. Bootstrap via `ADMIN_SEED_EMAILS` env var (≥ 3 seed admins required for any future nominations to pass).
- **Recurrence:** Simple presets (daily / weekly-on-dow / monthly / yearly), not full RRULE.
- **No emojis anywhere.** Use `lucide-react` icon components for UI iconography. Hand-drawn PNG logo assets are fine (they are image assets, not emoji characters).

## Architecture

### Stack

Next 16 App Router, React 19, Tailwind v4, Auth.js v5, Drizzle ORM → Turso, `date-fns` + `date-fns-tz`, Zod for validation, `lucide-react` for UI icons, `ulid` for IDs.

### Routes

- `/` — landing: wiggling moon-stars icon, wiggling "msa @ ucsc" letters, one-line welcome, preview of next 3 upcoming events, link to `/calendar`.
- `/calendar` — calendar shell with view toggle (day/month/year). URL-driven state: `/calendar?view=day&date=2026-04-16`. Public read.
- `/calendar/events/[id]` — event detail (shows occurrence info when linked from a recurring series).
- `/admin` — admin dashboard, gated by proxy + defense-in-depth server-action checks. Tabs: Events, Admins, Pending Nominations.
- `/admin/events/new`, `/admin/events/[id]/edit` — event form.
- `/api/prayer-times?date=YYYY-MM-DD` — internal route handler with `revalidate = 3600`.
- `/api/auth/*` — Auth.js.

### Proxy

`proxy.ts` at repo root wraps Auth.js `auth()` handler; on requests to `/admin/**` without `session.user.isAdmin`, returns `NextResponse.redirect('/')`. Runtime: `nodejs` (edge not supported in Next 16 proxy). Matcher excludes `/api/auth`, `/_next`, static assets.

### Server components for reads, server actions for writes

Client components only where interaction requires it: calendar grids, logo animation, event form with recurrence picker. No API routes for mutations — all writes are server actions in `app/admin/_actions.ts` (and `app/calendar/_actions.ts` for RSVP).

### File layout

```
app/
  page.tsx                          // landing
  calendar/
    page.tsx                        // view shell (server component, expands events in range)
    day-view.tsx                    // client: hourly grid + prayer overlays
    month-view.tsx                  // client: month grid
    year-view.tsx                   // client: 12-month mini-grid
    events/[id]/page.tsx            // event detail
    _actions.ts                     // rsvp server action
  admin/
    page.tsx                        // dashboard tabs
    events/new/page.tsx
    events/[id]/edit/page.tsx
    _actions.ts                     // create/edit/delete event, nominate, approve, cancel-nomination
  api/prayer-times/route.ts
  api/auth/[...nextauth]/route.ts
  error.tsx                         // top-level error boundary
lib/
  db/
    schema.ts                       // drizzle schema
    client.ts                       // turso connection
    queries.ts                      // typed read helpers
  auth.ts                           // auth.js config + isAdmin helper + assertAdmin
  aladhan.ts                        // prayer-time fetch + turso cache
  rrule-lite.ts                     // expand recurring events for a date range
  time.ts                           // America/Los_Angeles helpers
components/
  logo/
    wiggle-letters.tsx              // 2-frame boil animation for msa @ ucsc
    wiggle-icon.tsx                 // 2-frame boil for moon-stars
    boil-ticker.tsx                 // shared tick provider
  ui/...                            // small shared primitives
public/
  letters/
    m-1.png, m-2.png, s-1.png, s-2.png, a-1.png, a-2.png,
    at-1.png, at-2.png, u-1.png, u-2.png, c-1.png, c-2.png,
    icon-1.png, icon-2.png
proxy.ts
drizzle.config.ts
drizzle/                            // generated migrations
```

## Data model

All timestamps stored as UTC; render via `date-fns-tz` in `America/Los_Angeles`.

### Auth.js tables (standard Drizzle adapter schema)

- `users` (id, name, email, image, emailVerified)
- `accounts`, `sessions`, `verificationTokens`

### Admin governance

- `admins` — `(id PK, userId FK→users UNIQUE, promotedAt, promotedByNominationId NULL FK)`. `promotedByNominationId = NULL` marks a bootstrap admin.
- `adminNominations` — `(id ULID PK, nomineeEmail TEXT, action ENUM('promote','demote'), targetAdminId FK→admins NULL, nominatedByAdminId FK→admins, createdAt, status ENUM('pending','approved','rejected','cancelled') default 'pending')`. Demote nominations set `targetAdminId`; promote nominations set `nomineeEmail`.
- `adminApprovals` — `(nominationId FK, approverAdminId FK, createdAt)` with `UNIQUE(nominationId, approverAdminId)`. The nominator-cannot-approve rule is enforced at the server-action layer (SQLite CHECK constraints cannot reference columns in a different table).

### Events

- `events` — `(id ULID PK, title, description TEXT, location, startTime timestamp, endTime timestamp, recurrenceFreq NULL|'daily'|'weekly'|'monthly'|'yearly', recurrenceByWeekday TEXT NULL comma-sep 'MO,WE,FR', recurrenceInterval INT default 1, recurrenceUntil timestamp NULL, createdByAdminId FK, createdAt, updatedAt)`. Non-recurring events have all recurrence fields NULL.
- `eventCancellations` — `(eventId FK, occurrenceDate DATE)` with `UNIQUE(eventId, occurrenceDate)`. Lets an admin skip one occurrence of a recurring series.
- `eventRsvps` — `(eventId FK, occurrenceStart timestamp, userId FK, status ENUM('yes','no','maybe'), createdAt)` with `UNIQUE(eventId, occurrenceStart, userId)`.

### Prayer cache

- `prayerTimesCache` — `(date DATE PK, fajr TEXT, sunrise TEXT, dhuhr TEXT, asr TEXT, maghrib TEXT, isha TEXT, cachedAt)`. Times stored as `HH:mm` local Santa Cruz time, one row per date.

## Auth & authorization

### Sign-in flow

Auth.js v5 Google provider.

- `signIn` callback: reject if `!email.endsWith('@ucsc.edu')`. After domain check, if `ADMIN_SEED_EMAILS.split(',').includes(email)` and no `admins` row exists for this user, insert one with `promotedByNominationId = NULL`.
- `session` callback: attach `isAdmin: boolean` by querying `admins` for the current `userId`. Attach `adminId: number | null` too.

### Authorization

- Proxy redirects `/admin/**` to `/` when `!session.user.isAdmin`.
- Every admin server action calls `assertAdmin()` from `lib/auth.ts` as defense in depth. `assertAdmin()` throws a typed error that server actions convert to `{ ok: false, error: 'unauthorized' }`.

### Admin governance rules

- A nomination's approvers must be disjoint from its nominator. Enforced by a runtime check in `approveNomination` before inserting the approval row, and re-checked inside the apply transaction.
- A nomination is applied (status flips to `approved`, `admins` row inserted/deleted) when approval count reaches 2 AND approvers ⊆ (all admins \ nominator). Applied in a single transaction with the side effect.
- `demote` nominations: rejected at creation time and re-checked at apply time if they would leave zero admins.
- Because the rule is "2 other admins approve," the site needs ≥ 3 seed admins for any future promotion to go through. Documented in README.
- Nominator may cancel their own nomination while pending; cannot approve it.

### Server actions

`app/admin/_actions.ts`:

- `createEvent(formData)`, `updateEvent(id, formData)`, `deleteEvent(id)`, `cancelOccurrence(eventId, date)` — all guarded by `assertAdmin()`.
- `nominateAdmin(input)` — inserts `adminNominations` row. Validates email format; for `demote`, validates target exists and demotion wouldn't leave zero admins.
- `approveNomination(nomId)` — transaction: insert `adminApprovals` row (unique constraint blocks double-approve), recount, if ≥ 2 approvers disjoint from nominator: flip nomination status and apply side effect.
- `cancelNomination(nomId)` — only nominator, only while `status='pending'`.

`app/calendar/_actions.ts`:

- `rsvp(eventId, occurrenceStart, status)` — requires logged-in user. Upserts into `eventRsvps`.

## Calendar

### Range expansion

`lib/rrule-lite.ts` exports `expandEvents(events, rangeStart, rangeEnd): Occurrence[]`. Pure function, no I/O.

- For each event: if `recurrenceFreq == null`, emit once if it overlaps the range.
- Else iterate from `startTime` forward stepping by `(freq, interval)`: daily = +1d, weekly = +7d (or per `byWeekday` days within each week), monthly = +1mo on same day-of-month, yearly = +1yr.
- Stop at `min(recurrenceUntil, rangeEnd)`.
- Skip occurrences where `(eventId, occurrenceDate) ∈ eventCancellations`.
- Returns `{ eventId, occurrenceStart, occurrenceEnd, title, location, description }`.

Called server-side in `app/calendar/page.tsx` once per render.

### Prayer times

`lib/aladhan.ts` `getPrayerTimes(date)`:

- Reads `prayerTimesCache` first.
- On miss, fetches `https://api.aladhan.com/v1/timings/{unixSecondsUTCForDate}?latitude=36.974&longitude=-122.031&method=2` (ISNA). Writes cache row.
- On fetch or parse failure: logs `console.warn`, returns constant defaults (Fajr 5:30, Dhuhr 12:30, Asr 15:30, Maghrib 18:30, Isha 20:00). Day grid still renders.

Also exposed via `app/api/prayer-times/route.ts` with `export const revalidate = 3600` for client prefetch convenience; the day-view server component imports `getPrayerTimes` directly.

### Day view

- Range: `floor(Fajr)` to `ceil(Isha)` hours for the given date. Example: Fajr 5:18, Isha 20:47 → grid rows 5 through 21 inclusive (17 hours).
- Layout: 56px per hour. Left rail: hour labels (`5 AM`, `6 AM`, …). Main column: absolutely-positioned event blocks with `top = (startHour - gridStart) * 56 + (startMinute / 60) * 56`, `height = durationMinutes / 60 * 56`.
- Prayer overlays: 1px dashed `border-t` in `var(--color-burgundy)` with a small label (`Fajr 5:18`) at the right edge. Decorative — does not shift event layout.
- Header strip above the grid lists all five prayer times with clock values; sticky when the grid scrolls.
- Event block: paper-texture background, ink text, title + time range. Click opens `/calendar/events/[id]?occurrence=<iso>`.
- Empty state (no events for the day): plain-text "No events scheduled" centered in the main column. No icon, no emoji.

### Month view

- 6×7 grid. Leading/trailing days dimmed. Each cell shows up to 3 event pills (title truncated); overflow → `+N more` opens a day-peek popover listing all events for that day.
- Today cell: paper card with burgundy border.
- Click a day → day view for that date.

### Year view

- 12 mini-months in a 4×3 grid. Each day rendered as a small dot; dot intensity ∝ event count (0 = empty, 1 = light, 2 = medium, 3+ = deep burgundy).
- Click a day → day view. Click a month header → month view.

### Navigation & keyboard

- View toggle (Day/Month/Year) + prev/next/today buttons.
- URL is source of truth: `/calendar?view=month&date=2026-04-16`.
- Keyboard: `←`/`→` prev/next, `T` today, `D`/`M`/`Y` switch view.

### Styling

Tailwind-first. The hourly grid, prayer dashed overlays, and paper-texture event blocks will use a hand-rolled CSS block in `globals.css` keyed off semantic class names — they coordinate multiple layers and aren't worth expressing as utility soup.

## Landing page & logo animation

### Asset prep

Copy `~/Pictures/ucscmsa.com/*.png` into `public/letters/` with renames: `a.png` → `a-1.png`, `a (2).png` → `a-2.png`, same pattern for `at`, `c`, `icon`, `m`, `s`, `u`. One-time Sharp script may be needed to knock out near-white backgrounds to transparent so the paper texture blends with the page background; add as a build-time script if visual testing shows hard edges.

### Boil animation

`components/logo/boil-ticker.tsx` — a client component that ticks a shared counter via `useEffect` + `setInterval` at 250ms (4 Hz). Provides value through React context.

`components/logo/wiggle-letters.tsx` — client. Receives the phrase "msa @ ucsc" and renders each glyph as an `<img>`. Subscribes to the boil tick; each glyph has a per-glyph integer `phaseOffset` (deterministic pseudo-random hash of glyph index, values 0–3) and picks variant `((tick + phaseOffset) % 2 === 0) ? 1 : 2`. Different offsets per glyph keep the animation from looking robotic.

`components/logo/wiggle-icon.tsx` — same pattern, single image, own phase so it doesn't lock visually to a specific letter.

### Accessibility

- Whole logo wrapped in `<span role="img" aria-label="MSA at UCSC">`. Decorative `<img>` children get `alt=""` and `aria-hidden="true"`.
- `prefers-reduced-motion: reduce`: the ticker pauses; all glyphs render variant 1. No flicker.

### Landing layout

Top to bottom:

1. Centered `<WiggleIcon>` — roughly 120px square.
2. `<WiggleLetters>` for "msa @ ucsc". Letter height `clamp(48px, 10vw, 96px)`, width auto.
3. One-sentence welcome in plain Tailwind (`text-ink text-lg`).
4. "Upcoming" heading; 3 event cards (title, day-of-week + time, location) in a horizontal row on desktop, stacked on mobile. Each links to `/calendar/events/[id]`.
5. "See full calendar" button → `/calendar`.

Spacing between glyphs: tight for "msa", extra around `@`, tight for "ucsc" — tuned with inline style overrides on each glyph.

## Error handling

- **Aladhan fetch failure** → `getPrayerTimes` logs, returns defaults. No user-visible error.
- **Turso unavailable** → server components and actions throw; `app/error.tsx` renders a plain-paper error card with a retry button. Server actions return `{ ok: false, error }` so forms can show inline errors without losing input.
- **Auth failures** → non-ucsc.edu email: redirect to `/auth/error?reason=domain` with explanatory copy. OAuth callback errors: Auth.js default error page, styled via `pages` override.
- **Race on approval** → `UNIQUE(nominationId, approverAdminId)` blocks double-approve; caught and returned as `{ ok: false, error: 'already_approved' }`. Simultaneous final approvals: transaction linearizes; second one sees nomination already `approved` and returns a no-op success.
- **Form validation** → Zod schemas shared between server action and client form component. Invalid input returns field-level errors; form keeps user input.

## Testing

- **Unit (Vitest):** `lib/rrule-lite.ts` (weekly-on-MWF, cancellation skip, `until` clamp, monthly DOM edge cases like Jan 31 → Feb 28), `lib/time.ts` (DST boundaries for `America/Los_Angeles`), governance rules (nominator cannot approve, demote blocked when it'd leave zero admins), domain-allowlist check.
- **Integration (Vitest + libSQL in-memory or embedded replica):** server actions. Create/update/delete event, full promotion flow (nominate → 2 approvals → admin row inserted), demote flow, seed-on-first-login idempotency.
- **Component (Vitest + Testing Library):** day view places an event at the correct pixel offset given a mocked prayer range; recurrence preset picker produces the right payload; `wiggle-letters` respects `prefers-reduced-motion` by not subscribing to the tick.
- **E2E (Playwright, one happy path):** landing loads, calendar day view renders with prayer overlays visible, logged-in admin can create an event and see it on the day grid.
- Tests land in the same commit as the feature, written before the implementation per TDD.

## Environment

`.env.local`:

```
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ADMIN_SEED_EMAILS=a@ucsc.edu,b@ucsc.edu,c@ucsc.edu
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`drizzle.config.ts` → `lib/db/schema.ts`, out `drizzle/`. Scripts added to `package.json`: `db:generate`, `db:migrate`, `db:studio`, `test`, `test:e2e`.

`README.md` gets a Setup section covering env vars, seeding admins (≥ 3), running migrations, dev commands.

## Dependencies to add

```
next-auth@^5 (beta)           @auth/drizzle-adapter           @auth/core
drizzle-orm                   @libsql/client                  drizzle-kit (dev)
date-fns                      date-fns-tz
zod
lucide-react
ulid
vitest (dev)                  @testing-library/react (dev)    @testing-library/dom (dev)
@playwright/test (dev)
```

## Out of scope (deliberate non-goals for v1)

Email notifications, push notifications, ICS export, multi-language, photos/media library, newsletter signup, donations, public member directory, mobile app, comments on events, event categories/tags, search.

## Open items deferred to implementation plan

- Exact Zod schemas for each form.
- Whether the first migration creates all tables in one file or splits auth/events/admin into separate migrations.
- Whether to pre-render the landing page's upcoming-events list at build time with ISR or always render it dynamically.
