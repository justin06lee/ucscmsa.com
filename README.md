<div align="center">

<img src="assets/ucscmsa.svg" alt="MSA at UCSC" width="420" />

# ucscmsa.com

**Events, prayer times and board planning for UCSC's Muslim Student Association.**

</div>

## Stack

- Next.js 16 (App Router, `proxy.ts` not `middleware.ts`)
- React 19, Tailwind v4
- Auth.js v5 (Google provider, `ucsc.edu` domain allowlist)
- Drizzle ORM against Turso (libSQL)
- Vitest + Playwright

## Setup

Prerequisites: Node.js >= 20. From repo root:

```bash
bun install
cp .env.local.example .env.local
```

Edit `.env.local`:
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google Cloud Console OAuth client (Web application). Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
- `ADMIN_SEED_EMAILS` — **at least three** `@ucsc.edu` emails, comma-separated. Because every future nomination requires 2 approvers other than the nominator, seeding fewer than three admins makes promotions impossible to pass.
- `AUTH_EXTRA_ALLOWED_EMAILS` — optional; exact addresses, comma-separated, that may sign in besides `@ucsc.edu` ones (say, a maintainer's gmail). Each gets in only when Google reports it verified. Signing in doesn't make anyone an admin; to make one an admin, also list it in `ADMIN_SEED_EMAILS`.
- `EVENT_IMPORT_TOKEN` — optional; turns on the event import API (`POST /api/import/events`). Generate with `openssl rand -base64 32`. See [docs/import.md](docs/import.md).

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

## Board playbook and planning

Admins can edit, reorder and restore playbook step cards at `/admin/playbook`.
Each step has a lead time, planning tag and prerequisites. The original full
guides and their version history remain available. `/admin/plan` can turn an
event description into a reviewed, dated checklist and save it as a private
draft. With no model configured, a local keyword planner supplies the proposal.
The `PlanningAgent` interface allows an approved model adapter later.

See [the playbook board guide](docs/playbook-board.md) for setup, timeline rules,
authorization, model decisions and checks. Apply migration `0009` to a scratch
database before trying this branch. Completed event tasks keep their history.
