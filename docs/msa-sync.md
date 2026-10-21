# MSA sync: announcements → calendar

The MSA site's calendar is kept filled from two sources: the WhatsApp announcements chat (primary) and the public `@ucsc.msa` Instagram (secondary, for flyers WhatsApp doesn't have). `scripts/msa-sync.ts` runs the whole pipeline daily; the pieces are also usable by hand.

## The daily pipeline — `bun scripts/msa-sync.ts`

One command does three steps and prints a summary:

1. **Scrape (plain code, no LLM).** New WhatsApp announcements since the last run, plus their downloaded flyer files; and new Instagram image posts (reels and videos skipped). Incremental: only items newer than the last run.
2. **Eventify (an LLM through [yagami](https://github.com/justin06lee/yagami)).** Each new message + its flyer becomes an event JSON. **A time is kept only when it's quoted from the message text, or both the primary (Haiku) and verifier (Sonnet) model read the same time off the flyer** — otherwise the time is dropped (date-only / start-only) or the item is held for review. The description is the full announcement text with its line breaks, opening with "Hosted by …" for other groups' events (phone numbers and private names removed). Links are the URLs that actually appear in the text, classified (`rsvp`/`form`/`donate`/`signup`/`map`/`other`) — a URL only on a flyer, or not in the text, is never used. All flyer images are kept in order. Jummah, polls, deleted messages and non-events are skipped.
3. **Post.** Valid events go to the [import API](import.md) as idempotent upserts on stable `wa:`/`ig:` ids. Low-confidence or unclear items go to a review file instead of the site.

```bash
umask 077
bun scripts/msa-sync.ts                       # WhatsApp only (Instagram is off by default); scrape, eventify, post
bun scripts/msa-sync.ts --dry-run             # same, but the import is previewed and rolled back; state is not advanced
bun scripts/msa-sync.ts --instagram           # also scrape the live Instagram (slow, stops on any challenge)
bun scripts/msa-sync.ts --instagram-export <dir>   # also read Instagram from a "Download your information" folder (no browser)
```

Flags: `--since <ISO>` overrides the WhatsApp start (default: the last run); `--config <path>` and `--sync-config <path>` point at non-default config files. Instagram is a secondary input, **off unless `--instagram` or `--instagram-export` is given**.

The summary lists created, updated, unchanged, needs-review, skipped and errors. **The exit code is non-zero if anything errored** (including an Instagram stop). Needs-review items are written to `ucscmsa-sync-review.json`; read them, and add them by hand with the manual flow below if they're real.

### The LLM step (yagami)

The eventify step talks to an Anthropic-compatible endpoint. In development that's yagami on this Mac; run `yagami start` first (it must be up). Settings come from the environment or `ucscmsa-sync.json`, never hardcoded:

| Setting | Env | Default |
|---|---|---|
| Endpoint | `ANTHROPIC_BASE_URL` | `aiBaseUrl`, else `https://api.anthropic.com` |
| Key | `ANTHROPIC_API_KEY` | `aiKeyFile` (a `chmod 600` file) |
| Primary model | — | `aiModel`, default `claude-haiku-5-5` |
| Verifier model | — | `aiVerifierModel`, default `claude-sonnet-5-5` |

### Instagram

Instagram is off by default. Two ways to turn it on:

- **`--instagram` (live scrape).** Read through a **throwaway copy** of the signed-in Helium profile, in a separate headless Helium, GET-only and slowly, with a **hard stop on any challenge, login wall or "try again later"**. The profile copy (it holds the session cookies) is made on the internal disk and deleted on every exit; the real browser is never touched, and Safari is never used. Images and captions are public, so they're written to `/Volumes/T7/Stockpile/midna/ucscmsa-ig/` (symlinked from `~/.config/midna/ucscmsa-ig`). `scripts/ig-posts.ts` can be run alone: `bun scripts/ig-posts.ts --since 2025-09-01`.
- **`--instagram-export <dir>` (official export).** Point at an unzipped Instagram "Download your information" folder. The posts JSON and media files are read straight off disk — no browser, no network, no rate limits. Posts with only video are skipped; the event id is derived from each post's timestamp (`ig:ts<unix>`), since the export carries no shortcode.

## Where things are

Everything private lives in `~/.config/midna/`, never in the repo. Each file is `chmod 600`.

| File | What |
|---|---|
| `ucscmsa-wa.json` | Config: `chatJid` (the announcements chat), and optionally `tokenFile`, `stateFile`, `baseUrl`, `dbDir`. |
| `ucscmsa-sync.json` | Sync config: the yagami endpoint, key file and model ids, and Instagram settings. |
| `ucscmsa-import-token` | The `EVENT_IMPORT_TOKEN`. The scripts read it and never print it. |
| `ucscmsa-wa-state.json` | A hash per message, so `read` can tell when a message was edited. |
| `ucscmsa-sync-state.json` | The sync's last-seen WhatsApp time, last-seen Instagram post, and per-id status. |
| `ucscmsa-sync-review.json` | Items the sync held back for a human to check. |
| `ucscmsa-sync-enrichment.json` | Per posted event: its links and flyer images, held until the import API accepts those fields. |
| `ucscmsa-ig/` | Instagram images and `manifest.json` (a symlink to the T7 disk). |
| `ucscmsa-batch-<date>.json` | The hand-written batches you send. |

## The manual flow (`scripts/wa-announcements.ts`)

When you want to read the chat or send a batch by hand — or add a reviewed item the pipeline held back — use `scripts/wa-announcements.ts` directly. It does the reading and the sending; the event extraction is yours (no LLM).

The script reads WhatsApp's database at `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`, but only from a copy:

- It copies the database, `-wal` and `-shm` into a fresh `0700` temp directory.
- It opens the copy read-only, then deletes it.
- It never opens or writes WhatsApp's own files.
- It only queries the configured chat.

## Every day

Run these from the repo root.

```bash
umask 077
M=~/.config/midna

# 1. New messages since the last run (keep the time you started this run for tomorrow's --since)
bun scripts/wa-announcements.ts read --since 2026-10-21T09:00:00-07:00 > $M/wa-2026-10-22.json

# 2. Pick out the events and write $M/ucscmsa-batch-2026-10-22.json (see "Writing the batch")

# 3. Check it offline, preview it on the site, then send it
bun scripts/wa-announcements.ts import $M/ucscmsa-batch-2026-10-22.json --check
bun scripts/wa-announcements.ts import $M/ucscmsa-batch-2026-10-22.json --dry-run
bun scripts/wa-announcements.ts import $M/ucscmsa-batch-2026-10-22.json

# 4. Open each created or updated event: https://ucscmsa.com/calendar/events/<eventId>
```

If nothing in the messages is an event, there's no batch to send.

### `read`

```
read --since <time> [--until <time>] [--no-state] [--config <path>]
```

`<time>` can be any of these:

- unix seconds, e.g. `1792540800`
- an ISO time with `Z` or an offset, e.g. `2026-10-21T09:00:00-07:00`
- a date, `YYYY-MM-DD`, meaning midnight in Santa Cruz

A time without an offset is refused rather than guessed.

**The window includes `--since` and excludes `--until`,** so back-to-back windows neither overlap nor leave gaps. Re-reading a window is harmless: the same message gives the same `sourceId`, and upserts are idempotent.

**A message from before `--since` is also returned** in two cases. Both flags say why it's there:

- **It was revoked inside the window** (`revoked: true`).
- **`read` first saw it edited inside the window** (`edited: true`).

**System rows are left out:** joins, settings changes and call notices.

**State.** Each `read` updates `ucscmsa-wa-state.json`; that's how it notices edits.

- `--no-state` skips the file. Use it for one-off looks, so the daily run still flags the edit.
- The first run only records the messages, so edits made before it can't be flagged. The text is still the latest.

### Output

`read` prints a JSON array, oldest first, to stdout, and a one-line summary to stderr. Here is one message (made up):

```json
{
  "id": "3AF0000000000000A002",
  "sourceId": "wa:3AF0000000000000A002",
  "time": { "utc": "2026-10-20T20:26:08Z", "santaCruz": "2026-10-20T13:26:08-07:00", "unix": 1792527968 },
  "sender": { "name": "Board Member", "jid": "100000000000001@lid", "admin": true, "fromMe": false },
  "type": "image",
  "waType": 1,
  "text": null,
  "caption": "Potluck this Friday, Oct 23, 6-8 PM at the lounge. Bring a dish!",
  "mediaPath": null,
  "linkTitle": null,
  "replyTo": null,
  "edited": false,
  "editSeenAt": null,
  "revoked": false,
  "revokedAt": null,
  "revokedBy": null
}
```

| Field | Meaning |
|---|---|
| `id` | WhatsApp's message (stanza) id. The same on every device, and kept when the message is edited. |
| `sourceId` | `wa:<id>`: the `sourceId` for an event this message announces. |
| `time` | When it was sent: UTC, Santa Cruz time with its offset (`-07:00` or `-08:00`), and unix seconds. |
| `sender` | Name (the sender's WhatsApp profile name), JID (usually `@lid`), and whether they're an admin of the chat. `fromMe` is a message sent from this Mac's WhatsApp account. |
| `type` | `text`, `link`, `image`, `video`, `audio`, `document`, `gif`, `sticker`, `contact`, `location`, `poll`, `revoked` or `unknown`. |
| `waType` | WhatsApp's raw type number. |
| `text` | The latest text, after any edits. `null` for media, polls and revoked messages. |
| `caption` | The caption of an image, video, document or GIF. Flyers often carry the whole announcement here. |
| `mediaPath` | The downloaded media file in WhatsApp's folder (`…/group.net.whatsapp.WhatsApp.shared/Message/Media/…`), or `null` if it isn't downloaded. When a flyer holds the details, download it in WhatsApp and read the image from there. |
| `linkTitle` | The link preview's title, for `link` messages. |
| `replyTo` | The `id` of the announcement this message replies to. Members' replies show up under announcements. They're rarely events, but an admin's reply can carry a change ("moved to 5:30"). |
| `edited`, `editSeenAt` | The text changed since a previous `read`. `editSeenAt` is when `read` noticed; WhatsApp keeps no edit time. |
| `revoked`, `revokedAt`, `revokedBy` | Deleted for everyone, by the `sender` or by an `admin`, at `revokedAt`. The text is gone. |

**What the database doesn't have:**

- **Poll questions and options** aren't stored.
- **Images** are only on this Mac once downloaded in WhatsApp; `mediaPath` says where.
- **Type `unknown`, `waType` 75,** is admin activity that points at an earlier announcement. It has no content; ignore it.
- **Another unknown `waType`** is new. Tell whoever owns this script.

**WhatsApp's native Event messages** haven't been used in this chat. If they start being used, they'll show up as a new unknown type. Their name, time and location would then be the most reliable source, so the script should learn to decode them.

### Writing the batch

The batch is the API's request body, without `dryRun`. See [import.md](import.md) for every field.

```json
{
  "source": "whatsapp",
  "operations": [
    {
      "op": "upsert",
      "sourceId": "wa:3AF0000000000000A002",
      "sourceRef": "WhatsApp MSA announcements, 2026-10-20 13:26",
      "event": {
        "title": "Potluck",
        "description": "Bring a dish!",
        "location": "The lounge",
        "date": "2026-10-23",
        "startTime": "18:00",
        "endTime": "20:00"
      }
    }
  ]
}
```

- **Be conservative.** Only clear announcements with a date and a start time. Times are Santa Cruz wall-clock, exactly as announced.
- **Write the content cleanly.** Titles short, locations as stated. Descriptions come from the announcement, without phone numbers, names or other personal details. `sourceRef` gives the chat and the time, not the sender.
- **No end time stated:** pick a default, 2 hours for a social and 1 hour for a meeting or tabling, and say in your report which events got one.
- **Only future events** (today or later): past ones don't help anyone.

### The `sourceId` convention: `wa:<message id>`

An event's `sourceId` is `wa:` plus the `id` of the message that first announced it. It names that event for its whole life.

**An edited announcement keeps its id.** Send an `upsert` with the same `sourceId` and the updated details, and it updates the event in place.

**A later message that changes the event** ("moved to 7 PM", "new room") is also an `upsert` under the original announcement's `sourceId`, not the new message's id. A new `sourceId` would create a second event.

**A reminder** ("starts in 20 minutes!", "TODAY @ 5") is not a new event. Skip it, or use it to correct the original.

### Cancellations

- **"Cancelled", "not happening this week":** send `cancel` with the event's `sourceId`, adding `occurrenceDate` for one date of a series.
- **A revoked announcement whose event we imported:** it may be a cancellation, or the admin may just be re-posting it corrected.
  - Look for a re-post in the same window.
  - With a re-post, `upsert` the corrected details under the original `sourceId`.
  - With nothing, `cancel` it, and say so in your report.
- **Cancel is sticky:** a later `upsert` won't bring the event back. Only `restore` does.

### Recurring events

- **A weekly series** ("Halaqa every Thursday at 7 this quarter") is one `upsert` with `recurrence`, e.g. `{ "freq": "weekly", "byWeekday": ["TH"], "until": "2026-12-11" }`. The `sourceId` is the message that announced the series.
- **One week moves** ("this week's halaqa is at 8"): `cancel` that `occurrenceDate`, then `upsert` a one-off under the id of the message that announced the change.
- **The whole series changes:** `upsert` the series again under its original `sourceId`.

### Don't duplicate events admins made by hand

Imported events and hand-made events don't know about each other. An `upsert` never adopts an event an admin created in the admin form; it creates a second one.

Before sending, check the live calendar:

- the month view, `https://ucscmsa.com/calendar?view=month&date=YYYY-MM-DD`
- the sitemap, `https://ucscmsa.com/sitemap.xml`

Skip anything already there.

**Weekly Jummah is a hand-made series** ("Jummah 1" at 1:30 PM, "Jummah 2" at 3:00 PM, Fridays). Don't import Jummah announcements. Tell an admin if one changes the time or place.

**Admins come first.** If an admin edited or deleted an imported event, an `upsert` comes back `conflict`. Leave it, and report it. Use `override: true` only when the announcement really should win.

### `import`

```
import <batch.json> [--check | --dry-run] [--base-url <url>] [--config <path>]
```

**`--check`** validates the batch against the API's own schema (`lib/import/schema.ts`). It needs no token and sends nothing.

**Without `--check`,** the batch is validated the same way, and an invalid one is never sent. A valid batch is then sent:

- **`--dry-run`** sends `"dryRun": true`. The server runs the batch and rolls it back, so the results show what would happen. A `created` result's `eventId` there is only a preview.
- **The results** go to stdout as the server's JSON, with one line per operation and a summary on stderr.

**When things go wrong:**

| Case | What happens |
|---|---|
| `429` | It waits the `Retry-After` the server asks for, then retries, up to three times. |
| `500`, `502`, `504` or a network error | It retries twice, after 5 and 20 seconds. That's safe because batches are idempotent. |
| A redirect | It stops, and tells you to fix `--base-url`. |

**The token is safe:**

- It's sent only over https; plain http is allowed only for localhost.
- It's refused if the token file can be read by other users.

| Exit | Meaning |
|---|---|
| 0 | Everything applied (or would, for `--dry-run`), or `--check` passed. |
| 1 | An operation came back `conflict` or `not_found`, the server returned an error, a dry run wasn't confirmed as one, or the request failed. |
| 2 | A usage, config, token or batch problem. Nothing was sent. |

## When something's off

**"macOS blocked reading …":** the app running the command needs Full Disk Access, or permission to access data from other apps. Grant it in System Settings → Privacy & Security. Don't work around it.

**"WhatsApp kept writing its database…":** WhatsApp was busy syncing. Run it again in a minute.

**"Expected one chat with JID …":** the chat changed. `bun scripts/wa-announcements.ts chats --name "UC Santa Cruz MSA"` lists the chats with that name, from metadata only, never message content:

- type: `group`, or `community` for the parent
- members and admins
- message and poster counts
- first and last dates

The announcements chat is the `group` created together with the `community`. Most of its posts are by the community's admins, and the rest are replies. Put its JID in `ucscmsa-wa.json`.
