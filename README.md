# ucscmsa.com

UCSC Muslim Student Association site — landing with hand-drawn wiggling logo, public event calendar (day / month / year) with Fajr-to-Isha prayer-aligned day grid, and an admin dashboard with two-approver governance for admin membership changes.

## Stack

- Next.js 16 (App Router, `proxy.ts` not `middleware.ts`)
- React 19, Tailwind v4
- Auth.js v5 (Google provider, `ucsc.edu` domain allowlist)
- Drizzle ORM against Turso (libSQL)
- Vitest + Playwright

## Setup

Prerequisites: Node.js >= 20. From repo root:

```bash
npm install
cp .env.local.example .env.local
```

Edit `.env.local`:
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google Cloud Console OAuth client (Web application). Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
- `ADMIN_SEED_EMAILS` — **at least three** `@ucsc.edu` emails, comma-separated. Because every future nomination requires 2 approvers other than the nominator, seeding fewer than three admins makes promotions impossible to pass.

### Database

Local dev uses a SQLite file at `local.db` (gitignored). For production, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to your Turso database.

```bash
npm run db:generate   # after schema changes
npm run db:migrate    # apply migrations
npm run db:studio     # drizzle studio GUI
```

### Development

```bash
npm run dev
```

Open http://localhost:3000.

### Tests

```bash
npm run test          # vitest (unit + integration + component)
npm run test:e2e      # playwright
npm run typecheck     # tsc --noEmit
```

## Governance

- Any 1 admin can create, edit, or delete events.
- Adding or removing an admin requires a nomination followed by approvals from **2 admins other than the nominator**. The nominator may cancel their own pending nomination; they cannot approve it.
- Removing the last admin is always blocked (both at nomination creation and at apply time).
