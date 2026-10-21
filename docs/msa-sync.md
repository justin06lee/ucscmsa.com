# MSA sync: announcements → calendar

The MSA site's calendar is kept filled from the WhatsApp announcements chat, each announcement paired with the flyer image(s) Justin saved to a folder. `scripts/msa-sync.ts` runs the whole pipeline daily; the pieces are also usable by hand. (There is no Instagram path.)

## The daily pipeline — `bun scripts/msa-sync.ts`

One command does three steps and prints a summary:

1. **Scrape (plain code, no LLM).** New WhatsApp announcements since the last run, each matched to its flyer image(s) from Justin's saved folder by the timestamp in the filename. Incremental: only messages newer than the last run.
2. **Eventify (an LLM through [yagami](https://github.com/justin06lee/yagami)).** Each new message + its flyer becomes an event JSON. **A time is kept only when it's quoted from the message text, or both the primary (Haiku) and verifier (Sonnet) model read the same time off the flyer** — otherwise the time is dropped (date-only / start-only) or the item is held for review. The description is the full announcement text with its line breaks, opening with "Hosted by …" for other groups' events (phone numbers and private names removed). Links are the URLs that actually appear in the text, classified (`rsvp`/`form`/`donate`/`signup`/`map`/`other`) — a URL only on a flyer, or not in the text, is never used. All flyer images are kept in order. Jummah, polls, deleted messages and non-events are skipped.
3. **Post.** Valid events go to the [import API](import.md) as idempotent upserts on stable `wa:` ids. Low-confidence or unclear items go to a review file instead of the site.

```bash
umask 077
bun scripts/msa-sync.ts             # scrape, eventify, post; writes a summary
bun scripts/msa-sync.ts --dry-run   # same, but the import is previewed and rolled back; state is not advanced
```

Flags: `--since <ISO>` overrides the WhatsApp start (default: the last run; **on a real run, never earlier than the last run**: the full history up to 2026-10-21 13:24 was imported by hand, and re-reading it would overwrite those hand-checked events with the model's text. `--dry-run --since …` is safe for testing); `--images <folder>` matches a folder of flyer images to announcements (see [below](#another-image-folder---images-folder)); `--config <path>` and `--sync-config <path>` point at non-default config files.

The summary lists created, updated, unchanged, needs-review, skipped and errors, plus how many flyers matched an announcement (and how many didn't). **The exit code is non-zero if anything errored.** Needs-review items are written to `ucscmsa-sync-review.json`; read them, and add them by hand with the manual flow below if they're real.

### The LLM step (yagami)

The eventify step talks to an Anthropic-compatible endpoint. In development that's **yagami** on this Mac; only midna starts it (`yagami start`), never the sync. msa-sync checks the port first (a TCP connect, since a busy yagami can take many seconds to answer HTTP) and, **if yagami is down, stops before posting anything** — it eventifies and posts nothing, says so in the summary, and exits non-zero. Settings come from the environment or config, never hardcoded:

| Setting | From |
|---|---|
| Endpoint | `ANTHROPIC_BASE_URL` (env), else the env file, else `aiBaseUrl`, else `http://127.0.0.1:8787` |
| Key | `ANTHROPIC_API_KEY` (env), else the env file |
| Primary model | `aiModel`, default `claude-haiku-5-5` |
| Verifier model | `aiVerifierModel`, default `claude-sonnet-5-5` (retry / second flyer reader only) |
| Effort | `aiEffort`, default `medium` (sent as yagami's top-level `effort`) |

The **env file** is `~/.local/share/midna-ucscmsa/msa-sync.env` (`chmod 600`), holding `KEY=VALUE` lines. Fill it from yagami:

```bash
umask 077
yagami key    # prints ANTHROPIC_BASE_URL=… and ANTHROPIC_API_KEY=ygm_…
# paste both lines into ~/.local/share/midna-ucscmsa/msa-sync.env, then:
chmod 600 ~/.local/share/midna-ucscmsa/msa-sync.env
```

The key is read but never printed. Requests are sent one at a time (under yagami's concurrency guidance); overloads — which yagami returns as a normal reply, not an HTTP error — and 5xx/429 are retried up to six times with backoff and `Retry-After`, but a refused connection is never retried. A request with no answer in 5 minutes fails without a retry (yagami's turn is stalled upstream; another request would only queue behind it): that item is reported as an error and tried again on the next run.

### Flyers

Flyers come from Justin's saved folder, `~/.local/share/midna-ucscmsa/flyers/Msa events/` (set `flyerDir` in the sync config to change it). WhatsApp saves photos as `PHOTO-YYYY-MM-DD-HH-MM-SS.jpg` in Santa Cruz wall-clock time — the instant the announcement was sent — so each flyer is matched to the announcement it was posted with, within 90 seconds. An album sent at once (`PHOTO-…-SS.jpg`, `…(1).jpg`, `…(2).jpg`) stays together and in order. A folder flyer takes precedence over WhatsApp's own downloaded copy. Messages are grouped into posts the way they were sent: an uncaptioned image joins the same sender's nearest text (or captioned image) within 10 minutes, and uncaptioned images with no text nearby, sent within a minute of each other, are one post. So an album is one event with all its flyers in order, not one event per image. Flyers that match no announcement are counted in the summary (`unmatched`) and left alone. The matched flyers are the event's images for the Blob upload (a later step, once that endpoint is live).

### Another image folder: `--images <folder>`

For flyers saved somewhere else — say, exported from Photos or iCloud — point the sync at the folder:

```bash
bun scripts/msa-sync.ts --dry-run --images ~/Pictures/msa-flyers   # preview the matches
bun scripts/msa-sync.ts --images ~/Pictures/msa-flyers             # record them
```

- **Read only.** The folder is listed and its images read; nothing in it is moved, renamed or written. Subfolders are ignored.
- **Dating.** Each image is dated by a timestamp in its filename (`PHOTO-…`, `WhatsApp Image 2025-10-08 at 12.34.56`, `IMG_20251008_123456`; 24-hour only), else its EXIF capture date (JPEG), else the file's modified time. A filename timestamp must be within 10 minutes of an announcement (a flyer can follow its text by minutes); any other date, within 14 days.
- **Confirming.** The primary model (Haiku) reads the image against those announcements (nearest 8, numbered) and picks one. A pick with confidence 0.8 or more is attached; no candidate, no pick or a lower score goes to `ucscmsa-sync-review.json` as `image:<path>`. Never a guess.
- **What a match does.** The image is added to that event's images in `ucscmsa-sync-enrichment.json`, for the Blob upload. It doesn't change the event's text or times, and doesn't re-post the event.
- **Formats.** JPEG, PNG and WebP. Anything else (HEIC from an iPhone, say) goes to review: export it as JPEG.
- **Once each.** An image is matched once; it's looked at again only if the file changes (size or modified time). A `--dry-run` records nothing.

## Where things are

Everything private lives in `~/.local/share/midna-ucscmsa/` (the directory is `chmod 700`, each file `chmod 600`), never in the repo. **Never put anything under `~/.config/`** — it is a symlink into Justin's dotfiles git repo, so a file written there can be committed and pushed.

| File | What |
|---|---|
| `ucscmsa-wa.json` | Config: `chatJid` (the announcements chat), and optionally `tokenFile`, `stateFile`, `baseUrl`, `dbDir`. |
| `ucscmsa-sync.json` | Sync config: the yagami endpoint, key file, model ids, and `flyerDir`. |
| `ucscmsa-import-token` | The `EVENT_IMPORT_TOKEN`. The scripts read it and never print it. |
| `ucscmsa-wa-state.json` | A hash per message, so `read` can tell when a message was edited. |
| `ucscmsa-sync-state.json` | The sync's last-seen WhatsApp time, per-id status, and which `--images` files it has matched. |
| `ucscmsa-sync-review.json` | Items the sync held back for a human to check. |
| `ucscmsa-sync-enrichment.json` | Per posted event: its links and flyer images, held until the import API accepts those fields. |
| `flyers/Msa events/` | Justin's saved announcement flyers (`PHOTO-…` images). |
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
M=~/.local/share/midna-ucscmsa

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
