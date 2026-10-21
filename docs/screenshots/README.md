# Screenshots: before and after the mobile pass

Full-page Playwright captures of every page at 375, 390 and 768px, named `<page>-<width>.png`. `before/` was taken on 2026-10-20 before any UI change (master at f3f855d); `after/` after the step 2 mobile work on `midna/v2`. Both run against a local `next start` on the fake data from `scripts/seed-local.ts`. The after set's day view also has one extra pre-Fajr event (Qiyam al-Layl) that the seed gained, to show events before Fajr are kept.

Re-shoot with:

```bash
bun scripts/seed-local.ts file:/tmp/ucscmsa/audit.db > /tmp/ucscmsa/seed.json
# build and start with TURSO_DATABASE_URL=file:/tmp/ucscmsa/audit.db (never .env.local, which is production)
bun scripts/screenshots.ts --base http://localhost:3100 --out docs/screenshots/after --seed /tmp/ucscmsa/seed.json
```

## 390px, before → after

| Page | Before | After |
|---|---|---|
| Landing | <img src="before/landing-390.png" width="260" alt="Landing, before, 390px"> | <img src="after/landing-390.png" width="260" alt="Landing, after, 390px"> |
| Calendar — day (Fri Oct 23) | <img src="before/calendar-day-390.png" width="260" alt="Calendar — day (Fri Oct 23), before, 390px"> | <img src="after/calendar-day-390.png" width="260" alt="Calendar — day (Fri Oct 23), after, 390px"> |
| Calendar — month (Oct 2026) | <img src="before/calendar-month-390.png" width="260" alt="Calendar — month (Oct 2026), before, 390px"> | <img src="after/calendar-month-390.png" width="260" alt="Calendar — month (Oct 2026), after, 390px"> |
| Calendar — year (2026) | <img src="before/calendar-year-390.png" width="260" alt="Calendar — year (2026), before, 390px"> | <img src="after/calendar-year-390.png" width="260" alt="Calendar — year (2026), after, 390px"> |
| Event (one-off) | <img src="before/event-390.png" width="260" alt="Event (one-off), before, 390px"> | <img src="after/event-390.png" width="260" alt="Event (one-off), after, 390px"> |
| Event (recurring) | <img src="before/event-recurring-390.png" width="260" alt="Event (recurring), before, 390px"> | <img src="after/event-recurring-390.png" width="260" alt="Event (recurring), after, 390px"> |
| Event, signed in (RSVP) | <img src="before/event-signed-in-390.png" width="260" alt="Event, signed in (RSVP), before, 390px"> | <img src="after/event-signed-in-390.png" width="260" alt="Event, signed in (RSVP), after, 390px"> |
| Login | <img src="before/login-390.png" width="260" alt="Login, before, 390px"> | <img src="after/login-390.png" width="260" alt="Login, after, 390px"> |
| 404 | <img src="before/not-found-390.png" width="260" alt="404, before, 390px"> | <img src="after/not-found-390.png" width="260" alt="404, after, 390px"> |
| Admin — events | <img src="before/admin-events-390.png" width="260" alt="Admin — events, before, 390px"> | <img src="after/admin-events-390.png" width="260" alt="Admin — events, after, 390px"> |
| Admin — new event | <img src="before/admin-event-new-390.png" width="260" alt="Admin — new event, before, 390px"> | <img src="after/admin-event-new-390.png" width="260" alt="Admin — new event, after, 390px"> |
| Admin — edit event | <img src="before/admin-event-edit-390.png" width="260" alt="Admin — edit event, before, 390px"> | <img src="after/admin-event-edit-390.png" width="260" alt="Admin — edit event, after, 390px"> |
| Admin — admins | <img src="before/admin-admins-390.png" width="260" alt="Admin — admins, before, 390px"> | <img src="after/admin-admins-390.png" width="260" alt="Admin — admins, after, 390px"> |
| Admin — nominations | <img src="before/admin-nominations-390.png" width="260" alt="Admin — nominations, before, 390px"> | <img src="after/admin-nominations-390.png" width="260" alt="Admin — nominations, after, 390px"> |

375 and 768px pairs have the same names in `before/` and `after/`.
