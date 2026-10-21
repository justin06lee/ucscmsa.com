# WhatsApp announcements → calendar: daily runbook

midna reads new messages from the MSA WhatsApp announcements chat, picks out the events, and sends them to the site's [event import API](import.md). `scripts/wa-announcements.ts` does the reading and the sending. midna does the event extraction; the script uses no LLM.

## Where things are

Everything private lives in `~/.config/midna/`, never in the repo. Each file is `chmod 600`.

| File | What |
|---|---|
| `ucscmsa-wa.json` | Config: `chatJid` (the announcements chat), and optionally `tokenFile`, `stateFile`, `baseUrl`, `dbDir`. |
| `ucscmsa-import-token` | The `EVENT_IMPORT_TOKEN`. The script reads it and never prints it. |
| `ucscmsa-wa-state.json` | A hash per message, so `read` can tell when a message was edited. |
| `ucscmsa-batch-<date>.json` | The batches you send. |

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
