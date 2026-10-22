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

# v3 site upgrade: flyers, links, add to calendar

`before-v3/` is the site just before the v3 upgrade, at 375, 390 and 768px, named `<page>-<width>.png` like the sets above.

- **Public pages:** taken from the LIVE site, https://ucscmsa.com, on 2026-10-21 at about 14:28 PT, read-only (GETs, signed out). That was master `0feaa92`, minutes before the times release (`91244a0`) went live. They show the real events: Sisters' Game Night, Laser Tag + Arcade Social, and the Jummah series.
- **Admin pages:** from a local `next start` of `91244a0` on `scripts/seed-local.ts` data, since production admin needs a real sign-in.

`after-v3/` is the same pages once v3 shipped, with the same names:

- **Public pages:** from the LIVE site on 2026-10-21 at about 19:03 PT, read-only, the same way: master `875e85f` (Release 2, v3 from `midna/v3` `65700fb`, plus the board release), after MSA sync attached flyers to 63 events. Sisters' Game Night was under way, so it still shows its RSVP button.
- **Admin pages:** from a local `next start` of `65700fb` on `scripts/seed-local.ts` data, as before; the edit page now has the Links and Flyers sections.

| Page | Before (390px) | After (390px) |
|---|---|---|
| Landing | <img src="before-v3/landing-390.png" width="260" alt="Landing, before v3, 390px"> | <img src="after-v3/landing-390.png" width="260" alt="Landing, after v3, 390px"> |
| Calendar — today (Wed Oct 21) | <img src="before-v3/calendar-day-today-390.png" width="260" alt="Calendar day view for Oct 21, before v3, 390px"> | <img src="after-v3/calendar-day-today-390.png" width="260" alt="Calendar day view for Oct 21, after v3, 390px"> |
| Calendar — day (Fri Oct 23) | <img src="before-v3/calendar-day-390.png" width="260" alt="Calendar day view for Oct 23, before v3, 390px"> | <img src="after-v3/calendar-day-390.png" width="260" alt="Calendar day view for Oct 23, after v3, 390px"> |
| Calendar — month (Oct 2026) | <img src="before-v3/calendar-month-390.png" width="260" alt="Calendar month view, before v3, 390px"> | <img src="after-v3/calendar-month-390.png" width="260" alt="Calendar month view, after v3, 390px"> |
| Calendar — year (2026) | <img src="before-v3/calendar-year-390.png" width="260" alt="Calendar year view, before v3, 390px"> | <img src="after-v3/calendar-year-390.png" width="260" alt="Calendar year view, after v3, 390px"> |
| Event — Sisters' Game Night | <img src="before-v3/event-game-night-390.png" width="260" alt="Sisters' Game Night event page, before v3, 390px"> | <img src="after-v3/event-game-night-390.png" width="260" alt="Sisters' Game Night event page, after v3, 390px"> |
| Event — Laser Tag + Arcade Social | <img src="before-v3/event-laser-tag-390.png" width="260" alt="Laser Tag event page, before v3, 390px"> | <img src="after-v3/event-laser-tag-390.png" width="260" alt="Laser Tag event page, after v3, 390px"> |
| Event — Jummah 1 (weekly) | <img src="before-v3/event-recurring-390.png" width="260" alt="Jummah 1 event page, before v3, 390px"> | <img src="after-v3/event-recurring-390.png" width="260" alt="Jummah 1 event page, after v3, 390px"> |
| Login | <img src="before-v3/login-390.png" width="260" alt="Login, before v3, 390px"> | <img src="after-v3/login-390.png" width="260" alt="Login, after v3, 390px"> |
| 404 | <img src="before-v3/not-found-390.png" width="260" alt="404, before v3, 390px"> | <img src="after-v3/not-found-390.png" width="260" alt="404, after v3, 390px"> |
| Admin — events (seed) | <img src="before-v3/admin-events-390.png" width="260" alt="Admin events list, before v3, 390px"> | <img src="after-v3/admin-events-390.png" width="260" alt="Admin events list, after v3, 390px"> |
| Admin — new event (seed) | <img src="before-v3/admin-event-new-390.png" width="260" alt="Admin new event form, before v3, 390px"> | <img src="after-v3/admin-event-new-390.png" width="260" alt="Admin new event form, after v3, 390px"> |
| Admin — edit event (seed) | <img src="before-v3/admin-event-edit-390.png" width="260" alt="Admin edit event form, before v3, 390px"> | <img src="after-v3/admin-event-edit-390.png" width="260" alt="Admin edit event form, after v3, 390px"> |
| Admin — admins (seed) | <img src="before-v3/admin-admins-390.png" width="260" alt="Admin admins page, before v3, 390px"> | <img src="after-v3/admin-admins-390.png" width="260" alt="Admin admins page, after v3, 390px"> |
| Admin — nominations (seed) | <img src="before-v3/admin-nominations-390.png" width="260" alt="Admin nominations page, before v3, 390px"> | <img src="after-v3/admin-nominations-390.png" width="260" alt="Admin nominations page, after v3, 390px"> |

# Luma-style event displays

`after-luma/` is branch `midna/luma` (Luma-style covers, cards and event page; no arrows; off-site links in a new tab), at 375, 390, 768 and 1280px for public pages and 375, 390 and 768px for admin pages, named `<page>-<width>.png` like the sets above.

- **Public pages:** a local `next start` on tenet against Backend's public snapshot of production (2026-10-22 06:05 UTC: 72 events with their links and flyers; no users, RSVPs or drafts; the weekly Jummah series already removed). The server's and the browser's clocks are set to **Wed Oct 21, 2:00 PM PT** (`scripts/fake-now.cjs`, `--at`), so the snapshot reads as the site did that afternoon: Sisters' Game Night, with its real flyer and RSVP form, is still upcoming. Shot with `bun scripts/screenshots.ts --set snapshot --at 2026-10-21T14:00:00-07:00 --widths 375,390,768,1280`.
- **Admin pages:** a local `next start` on `scripts/seed-local.ts` data, as before; they change only in wording (no arrows; the flyer editor's Up and Down).
- New pages here: an event without a flyer (its fallback cover), a passed event, and a day with a long event (4 hours or more: listed in a "Long events" row above the day grid on wider screens, not drawn over the prayer times). The weekly Jummah page is gone with the series.

| Page | After v3 (390px) | After Luma (390px) | After Luma (1280px) |
|---|---|---|---|
| Landing | <img src="after-v3/landing-390.png" width="260" alt="Landing, after v3, 390px"> | <img src="after-luma/landing-390.png" width="260" alt="Landing, after luma, 390px"> | <img src="after-luma/landing-1280.png" width="420" alt="Landing, after luma, 1280px"> |
| Calendar — today (Wed Oct 21) | <img src="after-v3/calendar-day-today-390.png" width="260" alt="Calendar day view for Oct 21, after v3, 390px"> | <img src="after-luma/calendar-day-today-390.png" width="260" alt="Calendar day view for Oct 21, after luma, 390px"> | <img src="after-luma/calendar-day-today-1280.png" width="420" alt="Calendar day view for Oct 21, after luma, 1280px"> |
| Calendar — day (Fri Oct 23) | <img src="after-v3/calendar-day-390.png" width="260" alt="Calendar day view for Oct 23, after v3, 390px"> | <img src="after-luma/calendar-day-390.png" width="260" alt="Calendar day view for Oct 23, after luma, 390px"> | <img src="after-luma/calendar-day-1280.png" width="420" alt="Calendar day view for Oct 23, after luma, 1280px"> |
| Calendar — a long event (Niya Summit, Sat Aug 29, 8 AM–8 PM) | — | <img src="after-luma/calendar-day-long-390.png" width="260" alt="Calendar day view for Aug 29, Niya Summit in the phone list, after luma, 390px"> | <img src="after-luma/calendar-day-long-1280.png" width="420" alt="Calendar day view for Aug 29, Niya Summit in the Long events row above the grid, after luma, 1280px"> |
| Calendar — month (Oct 2026) | <img src="after-v3/calendar-month-390.png" width="260" alt="Calendar month view, after v3, 390px"> | <img src="after-luma/calendar-month-390.png" width="260" alt="Calendar month view, after luma, 390px"> | <img src="after-luma/calendar-month-1280.png" width="420" alt="Calendar month view, after luma, 1280px"> |
| Calendar — year (2026) | <img src="after-v3/calendar-year-390.png" width="260" alt="Calendar year view, after v3, 390px"> | <img src="after-luma/calendar-year-390.png" width="260" alt="Calendar year view, after luma, 390px"> | <img src="after-luma/calendar-year-1280.png" width="420" alt="Calendar year view, after luma, 1280px"> |
| Event — Sisters' Game Night (RSVP form) | <img src="after-v3/event-game-night-390.png" width="260" alt="Sisters' Game Night event page, after v3, 390px"> | <img src="after-luma/event-game-night-390.png" width="260" alt="Sisters' Game Night event page, after luma, 390px"> | <img src="after-luma/event-game-night-1280.png" width="420" alt="Sisters' Game Night event page, after luma, 1280px"> |
| Event — Laser Tag + Arcade Social (start-only) | <img src="after-v3/event-laser-tag-390.png" width="260" alt="Laser Tag event page, after v3, 390px"> | <img src="after-luma/event-laser-tag-390.png" width="260" alt="Laser Tag event page, after luma, 390px"> | <img src="after-luma/event-laser-tag-1280.png" width="420" alt="Laser Tag event page, after luma, 1280px"> |
| Event — Henna Tabling (no flyer) | — | <img src="after-luma/event-no-flyer-390.png" width="260" alt="Henna Tabling event page, no flyer, after luma, 390px"> | <img src="after-luma/event-no-flyer-1280.png" width="420" alt="Henna Tabling event page, no flyer, after luma, 1280px"> |
| Event — Niya Summit (passed, two flyers) | — | <img src="after-luma/event-past-390.png" width="260" alt="Niya Summit event page, passed, after luma, 390px"> | <img src="after-luma/event-past-1280.png" width="420" alt="Niya Summit event page, passed, after luma, 1280px"> |
| Login | <img src="after-v3/login-390.png" width="260" alt="Login, after v3, 390px"> | <img src="after-luma/login-390.png" width="260" alt="Login, after luma, 390px"> | <img src="after-luma/login-1280.png" width="420" alt="Login, after luma, 1280px"> |
| 404 | <img src="after-v3/not-found-390.png" width="260" alt="404, after v3, 390px"> | <img src="after-luma/not-found-390.png" width="260" alt="404, after luma, 390px"> | <img src="after-luma/not-found-1280.png" width="420" alt="404, after luma, 1280px"> |
| Admin — events (seed) | <img src="after-v3/admin-events-390.png" width="260" alt="Admin events list, after v3, 390px"> | <img src="after-luma/admin-events-390.png" width="260" alt="Admin events list, after luma, 390px"> | — |
| Admin — new event (seed) | <img src="after-v3/admin-event-new-390.png" width="260" alt="Admin new event form, after v3, 390px"> | <img src="after-luma/admin-event-new-390.png" width="260" alt="Admin new event form, after luma, 390px"> | — |
| Admin — edit event (seed) | <img src="after-v3/admin-event-edit-390.png" width="260" alt="Admin edit event form, after v3, 390px"> | <img src="after-luma/admin-event-edit-390.png" width="260" alt="Admin edit event form, after luma, 390px"> | — |
| Admin — flyers and links (seed) | — | <img src="after-luma/admin-event-flyers-390.png" width="260" alt="Admin edit form with flyers and links, after luma, 390px"> | — |
| Admin — admins (seed) | <img src="after-v3/admin-admins-390.png" width="260" alt="Admin admins page, after v3, 390px"> | <img src="after-luma/admin-admins-390.png" width="260" alt="Admin admins page, after luma, 390px"> | — |
| Admin — nominations (seed) | <img src="after-v3/admin-nominations-390.png" width="260" alt="Admin nominations page, after v3, 390px"> | <img src="after-luma/admin-nominations-390.png" width="260" alt="Admin nominations page, after luma, 390px"> | — |
| Admin — planning (seed) | — | <img src="after-luma/admin-plan-390.png" width="260" alt="Admin planning page, after luma, 390px"> | — |
| Admin — an event's plan (seed) | — | <img src="after-luma/admin-plan-event-390.png" width="260" alt="Admin plan timeline, after luma, 390px"> | — |
| Admin — playbook (seed) | — | <img src="after-luma/admin-playbook-390.png" width="260" alt="Admin playbook, after luma, 390px"> | — |
| Admin — a guide (seed) | — | <img src="after-luma/admin-guide-390.png" width="260" alt="Admin playbook guide, after luma, 390px"> | — |
