# Event import API

midna uses this API to add events from the MSA WhatsApp announcements to the calendar.

- **One request carries a batch** of operations: `upsert` (create or update), `cancel` and `restore`.
- **Each event is keyed** on a stable id that you choose.
- **Requests are idempotent.** Sending the same request twice changes nothing the second time.
- **Admins can still edit imported events.** The importer never silently overwrites an admin's edits.
- **A dry run previews a batch.** It returns the results the batch would get, and changes nothing.

## Setup

### 1. The token: `EVENT_IMPORT_TOKEN`

Generate a token once:

```bash
openssl rand -base64 32
```

Then add it on Vercel:

1. Go to Project → Settings → Environment Variables.
2. Add `EVENT_IMPORT_TOKEN` with that value.
3. Tick **Production only**.
4. Redeploy.

Give the same value to the importer through its own secret store. Never commit it.

**Why Production only:**
- Preview deployments use whatever database Preview is configured with, which may be the production one.
- Anyone with a preview URL could reach the endpoint there.
- With the variable unset, the endpoint on that deployment refuses everything with `503 import_disabled`, so leaving Preview without it is safe.

**The endpoint fails closed.** If `EVENT_IMPORT_TOKEN` is unset or shorter than 32 characters, it accepts nothing. Leading and trailing whitespace in the stored value is ignored.

**To rotate the token:** set a new value on Vercel and redeploy. The old token stops working on the new deployment.

### 2. The migrations

Migrations `drizzle/0002_melodic_redwing.sql` (from the audit) and `drizzle/0003_event_import.sql` (this API) must be applied to the production database **before** the code that uses them is deployed.

- **0003 is safe on live data:** it only adds columns, two tables and an index.
- **Existing events become `source: "manual"`.**
- **To apply them,** run this with the production URL and token:

  ```bash
  TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… bun scripts/migrate.ts
  ```

  Be careful with `bun run db:migrate`: it reads `.env.local`, so it migrates whichever database that file points at. Whoever holds the production credentials runs this, when midna says so.

## Endpoint

```
POST https://ucscmsa.com/api/import/events
Authorization: Bearer <EVENT_IMPORT_TOKEN>
Content-Type: application/json
```

Every other method gets `405`.

**No session or cookie is involved.** The only credential is the bearer token. The admin login (`/login`, `proxy.ts`) doesn't apply to this route.

## Request body

```json
{
  "source": "whatsapp",
  "operations": [ /* 1 to 50 operations */ ],
  "dryRun": true            // optional
}
```

**Every object is strict.** A field not listed here is an error, not ignored. If any part of the body is invalid, the whole request is rejected with `400` and nothing is applied.

| Field | Type | Rules |
|---|---|---|
| `source` | string | Names where the events come from, e.g. `"whatsapp"`. Lowercase letters, digits, `-` and `_`; 1–32 characters; must start with a letter. `"manual"` is reserved for events made in the admin form. Source ids are scoped to their source. |
| `operations` | array | 1 to 50 operations, applied in order. |
| `dryRun` | boolean | Optional. `true` previews the batch without applying it; see "Dry run". Default `false`. |

### Operation: `upsert`

Creates the event, or updates it if this source id already exists.

| Field | Type | Required | Rules |
|---|---|---|---|
| `op` | `"upsert"` | yes | |
| `sourceId` | string | yes | Your stable id for this event: 1–200 printable ASCII characters, no spaces. |
| `sourceRef` | string | no | Where it came from, for admins: a link or a note, up to 500 characters. Example: `"WhatsApp MSA Announcements, 2026-10-20 18:04"`. |
| `event` | object | yes | See below. |
| `override` | boolean | no | `true` overwrites an admin's edits or re-creates an event an admin deleted. See "Conflicts". Default `false`. |

**Choosing a `sourceId`.** It names one event (one series, for a recurring event) for its whole life, so:

- Use the WhatsApp message id of the announcement that first announced it, or a slug such as `2026-10-23-jummah` or `weekly-halaqa-fall-2026`.
- A later message that changes the event ("Jummah moved to 1:45") is an `upsert` with the **original** `sourceId`, not a new one.
- A new `sourceId` creates a second event.

#### `event`

These are the same rules as the admin event form.

| Field | Type | Required | Rules |
|---|---|---|---|
| `title` | string | yes | 1–200 characters after trimming. |
| `description` | string | no | Up to 10,000 characters. Default `""`. |
| `location` | string | no | Up to 200 characters after trimming. Default `""`. |
| `date` | string | yes | The start date, `YYYY-MM-DD`. Must be a real date in the years 2000–2100. |
| `startTime` | string | yes | `HH:mm`, 24-hour, `00:00`–`23:59`. |
| `endTime` | string | yes | `HH:mm`, 24-hour. |
| `endDate` | string | no | `YYYY-MM-DD`, for events that end on a later day. Defaults to `date`. |
| `recurrence` | object | no | Omit for a one-off event. See below. |

**Times are Santa Cruz wall-clock times** (America/Los_Angeles), exactly as the announcement says them. `"date": "2026-10-23", "startTime": "13:30"` means 1:30 PM in Santa Cruz on that day, whether it's PDT or PST; the server works out the offset. A recurring event keeps that wall-clock time on both sides of a DST change.

Two kinds of time are rejected rather than guessed:

- **Times that don't exist:** 02:00–02:59 on the second Sunday of March, when clocks spring forward.
- **Times that happen twice:** 01:00–01:59 on the first Sunday of November, when clocks fall back.

Other date and time rules:

- **The end must be after the start.**
- **An event that ends past midnight needs `endDate`.**

#### `event.recurrence`

| Field | Type | Required | Rules |
|---|---|---|---|
| `freq` | `"daily"` \| `"weekly"` \| `"monthly"` \| `"yearly"` | yes | |
| `interval` | integer | no | Every N days, weeks, months or years: 1–99. Default 1. |
| `byWeekday` | array of `"SU"`,`"MO"`,`"TU"`,`"WE"`,`"TH"`,`"FR"`,`"SA"` | no | Weekly only; no duplicates. Defaults to the weekday of `date`. With `interval` > 1, weeks run Sunday to Saturday. |
| `until` | string | no | The last date occurrences may fall on, `YYYY-MM-DD`, inclusive. It can't be before `date`. Omit it to repeat with no end. |

The first occurrence is on `date`. Monthly events on the 29th–31st fall on the last day of shorter months.

### Operation: `cancel`

| Field | Type | Required | Rules |
|---|---|---|---|
| `op` | `"cancel"` | yes | |
| `sourceId` | string | yes | |
| `occurrenceDate` | string | no | `YYYY-MM-DD`. Omit it to cancel the **whole event**, every occurrence. Give it to cancel just the occurrence on that Santa Cruz date. |

- **A cancelled whole event** leaves the public calendar, the upcoming list and RSVPs. The row is kept: admins see it with a "Cancelled" badge. Its public page stays up, so shared links keep working; it says "This event was cancelled", has no RSVP section, and marks the event `EventCancelled` for search engines. It stays in the sitemap until its date has passed, so search engines pick up the cancellation.
- **A cancelled occurrence** disappears from that day; the rest of the series stays.
- **Cancellation is sticky.** A later `upsert` of the same `sourceId`, even re-sending the original announcement, updates the details but does **not** un-cancel. Only `restore` does.
- **An `occurrenceDate` the event has no occurrence on** gets `not_found` with reason `no_occurrence_on_date`.

### Operation: `restore`

Undoes `cancel`. It has the same fields as `cancel`: without `occurrenceDate` it restores the whole event, and with it, that one occurrence.

## Response

Every processed request gets HTTP `200`, even when some items are conflicts or `not_found`:

```json
{
  "ok": true,
  "results": [
    { "index": 0, "op": "upsert", "sourceId": "wa-3EB0C4", "status": "created", "eventId": "01JAD3X9Q0…" },
    { "index": 1, "op": "cancel", "sourceId": "2026-10-30-halaqa", "status": "cancelled", "eventId": "01JA…", "occurrenceDate": "2026-10-30" },
    { "index": 2, "op": "upsert", "sourceId": "wa-3EB0C9", "status": "conflict", "reason": "edited_by_admin", "eventId": "01JA…" }
  ]
}
```

There is one result per operation, in order:

- `index` is the operation's position.
- `eventId` is the calendar's id for the event; the event page is `https://ucscmsa.com/calendar/events/<eventId>`.
- `occurrenceDate` is echoed back for occurrence operations.

| `status` | Meaning |
|---|---|
| `created` | A new event was created. |
| `updated` | The event existed and its details changed. |
| `unchanged` | Nothing to do: the event already matches, or is already cancelled or restored. |
| `cancelled` | The whole event, or the given occurrence, is now cancelled. |
| `restored` | The cancellation was undone. |
| `conflict` | Not applied because of an admin's change; see `reason`. |
| `not_found` | No event with this `sourceId` (for `cancel` or `restore`), or no occurrence on `occurrenceDate`. |

| `reason` | With | Meaning |
|---|---|---|
| `edited_by_admin` | `conflict` | An admin edited the event in the admin form since it was imported. |
| `deleted_by_admin` | `conflict` | An admin deleted the event. |
| `no_occurrence_on_date` | `not_found` | The event has no occurrence on `occurrenceDate`. |

### Dry run

With `"dryRun": true` the server runs the whole batch the normal way, inside its transaction, and then rolls the transaction back:

- **The results are the ones a real run would get** at that moment: the same statuses, reasons and conflicts, in the same order.
- **The response has `"dryRun": true`,** and so does every result.
- **Nothing is written.** No event, cancellation or tombstone changes, and no page is refreshed.
- **The `eventId` of a `created` result is only a preview.** No event has that id; the real run creates the event with a new one. Other results carry the real `eventId`.
- **Auth and rate limits are the same as for a real run.** A dry run counts against the limits.

```json
{
  "ok": true,
  "dryRun": true,
  "results": [
    { "index": 0, "op": "upsert", "sourceId": "wa-3EB0C4", "status": "created", "eventId": "01JAD3X9Q0…", "dryRun": true },
    { "index": 1, "op": "cancel", "sourceId": "2026-10-30-halaqa", "status": "not_found", "dryRun": true }
  ]
}
```

A real run made later can still get different results if an admin or another import changed something in between.

### Idempotency and retries

- **A batch is applied in one transaction:** all of it or none of it.
- **The same request again** returns `unchanged` for every item, creates nothing and writes nothing.
- **After a timeout, a network error or a `500`,** resend the same request. Items that already applied come back `unchanged`.

## Errors

Errors have this shape, with the matching HTTP status:

```json
{ "ok": false, "error": "<code>", "message": "<human-readable>", … }
```

| HTTP | `error` | When | What to do |
|---|---|---|---|
| 400 | `invalid_json` | The body isn't JSON. | Fix the body. |
| 400 | `invalid_request` | The body doesn't match the schema. `issues` lists each problem as `{ "path": "operations.2.event.startTime", "message": "…" }`. Nothing was applied. | Fix the listed fields. |
| 401 | `unauthorized` | No `Authorization: Bearer …` header, or the wrong token. Sent with `WWW-Authenticate: Bearer`. | Check the token. |
| 405 | — | A method other than POST. | |
| 413 | `payload_too_large` | The body is over 256 KiB. | Split the batch. |
| 415 | `unsupported_media_type` | `Content-Type` isn't `application/json`. | |
| 429 | `rate_limited` | Over the rate limit. A `Retry-After` header and a `retryAfter` field give the seconds to wait. | Wait that long, then retry. |
| 500 | `internal_error` | Something failed on the server. Nothing was applied. | Retry the same request later. |
| 503 | `import_disabled` | `EVENT_IMPORT_TOKEN` isn't set (or is too short) on this deployment. | Set it on Vercel and redeploy. |

## Conflicts: admins come first

**Imported events are normal events.** Admins can edit or delete them in the admin dashboard; the admin list marks them as imported. When an admin has changed one, the importer doesn't silently undo that:

- **Admin edited it:** an `upsert` with different details returns `conflict` / `edited_by_admin` and changes nothing. An `upsert` that already matches the admin's version returns `unchanged`.
- **Admin deleted it:** an `upsert` returns `conflict` / `deleted_by_admin` and does not re-create it. So do `cancel` and `restore`.
- **`override: true` on an `upsert`** applies it anyway. It overwrites the admin's edits and clears the edited mark, so later imports update the event normally again. It also re-creates a deleted event with a new `eventId`.
  - Use it only when the announcement really should win.
  - `cancel` and `restore` don't take `override`, and don't need it: they change only the cancelled state, never the details.

midna can change this policy later. It lives in `lib/import/apply.ts`.

## Rate limits

Only requests with a valid token are counted; anonymous requests are refused before anything is written. There are two fixed windows:

- **Per token and client IP:** 30 requests per 10 minutes.
- **Per token overall:** 120 requests per hour.

A daily batch of announcements needs one request. Going over either limit gets `429` with `Retry-After`.

## Examples

Set these once:

```bash
URL=https://ucscmsa.com/api/import/events
TOKEN=…   # the EVENT_IMPORT_TOKEN value
```

### Create a recurring event

```bash
curl -sS "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "operations": [{
      "op": "upsert",
      "sourceId": "weekly-jummah-fall-2026",
      "sourceRef": "WhatsApp MSA Announcements, 2026-09-20 09:12",
      "event": {
        "title": "Jummah",
        "location": "Stevenson Event Center",
        "date": "2026-09-25",
        "startTime": "13:30",
        "endTime": "14:30",
        "recurrence": { "freq": "weekly", "byWeekday": ["FR"], "until": "2026-12-11" }
      }
    }]
  }'
```

### Update it (same `sourceId`, new details)

```bash
curl -sS "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "operations": [{
      "op": "upsert",
      "sourceId": "weekly-jummah-fall-2026",
      "event": {
        "title": "Jummah",
        "location": "Stevenson Event Center, Room 150",
        "date": "2026-09-25",
        "startTime": "13:45",
        "endTime": "14:45",
        "recurrence": { "freq": "weekly", "byWeekday": ["FR"], "until": "2026-12-11" }
      }
    }]
  }'
```

`upsert` always sends the complete event. Fields left out take their defaults; they are not kept from before.

### Cancel one week, or the whole event

```bash
# Just Friday Oct 30
curl -sS "$URL" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","operations":[{"op":"cancel","sourceId":"weekly-jummah-fall-2026","occurrenceDate":"2026-10-30"}]}'

# The whole series
curl -sS "$URL" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","operations":[{"op":"cancel","sourceId":"weekly-jummah-fall-2026"}]}'

# Undo the series cancellation
curl -sS "$URL" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","operations":[{"op":"restore","sourceId":"weekly-jummah-fall-2026"}]}'
```

### Preview a batch first (dry run)

```bash
curl -sS "$URL" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","dryRun":true,"operations":[{"op":"cancel","sourceId":"weekly-jummah-fall-2026","occurrenceDate":"2026-10-30"}]}'
```

Send the same body without `dryRun` to apply it.

### A day's announcements in one batch

```bash
curl -sS "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "operations": [
      {
        "op": "upsert",
        "sourceId": "wa-3EB0C431F8A2",
        "sourceRef": "WhatsApp MSA Announcements, 2026-10-20 18:04",
        "event": {
          "title": "Community Iftar",
          "description": "Bring a dish to share. Sisters'\'' and brothers'\'' seating.",
          "location": "College Nine Multipurpose Room",
          "date": "2026-10-24",
          "startTime": "18:15",
          "endTime": "20:30"
        }
      },
      {
        "op": "upsert",
        "sourceId": "2026-10-31-quran-night",
        "event": {
          "title": "Quran Night",
          "location": "Kresge Town Hall",
          "date": "2026-10-31",
          "startTime": "19:00",
          "endTime": "00:30",
          "endDate": "2026-11-01"
        }
      },
      { "op": "cancel", "sourceId": "weekly-jummah-fall-2026", "occurrenceDate": "2026-10-30" }
    ]
  }'
```

A response to that batch:

```json
{
  "ok": true,
  "results": [
    { "index": 0, "op": "upsert", "sourceId": "wa-3EB0C431F8A2", "status": "created", "eventId": "01JAE7…" },
    { "index": 1, "op": "upsert", "sourceId": "2026-10-31-quran-night", "status": "created", "eventId": "01JAE7…" },
    { "index": 2, "op": "cancel", "sourceId": "weekly-jummah-fall-2026", "status": "cancelled", "eventId": "01JA9Q…", "occurrenceDate": "2026-10-30" }
  ]
}
```

A validation error:

```json
{
  "ok": false,
  "error": "invalid_request",
  "message": "The request doesn't match the import schema; nothing was applied.",
  "issues": [
    { "path": "operations.1.event.endTime", "message": "End must be after start" }
  ]
}
```

## Where things are

| Part | File |
|---|---|
| Route | `app/api/import/events/route.ts` |
| Schema and limits | `lib/import/schema.ts` |
| Apply logic and conflict policy | `lib/import/apply.ts` |
| Token check | `lib/import/auth.ts` |
| Rate limiter | `lib/rate-limit.ts` (the `rate_limits` table) |
| Field rules shared with the admin form | `lib/event-rules.ts` |
| Tests | `app/api/import/events/route.test.ts`, `lib/import/auth.test.ts`, `lib/rate-limit.test.ts`, `test/migrations.test.ts` |

New columns on `events`:

| Column | Meaning |
|---|---|
| `source` | `"manual"` or the import source |
| `source_id` | The import source's id for the event |
| `source_ref` | The optional link or note |
| `imported_at` | When the event was first imported |
| `last_imported_at` | When an import last changed it |
| `admin_edited_at` | Set when an admin saves the event in the admin form |
| `cancelled_at` | Set while the whole event is cancelled |

New tables:

- **`event_import_tombstones`:** imported events that admins deleted.
- **`rate_limits`:** the request counters.
