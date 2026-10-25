# Playbook board and planning from a description

This work is on `feat/playbook-agent`, based on master `223c19a`. It remains unmerged and undeployed. Automatic Vercel deployments are disabled for this branch in `vercel.json` so pushing it for review does not deploy it; the setting applies only to this branch and leaves `master` unchanged. Migration `0009_playbook_cards.sql` is required before running this version on a database. Use a scratch **file:** database for review; do not use production credentials.

## Try it

Install with `bun install`. Migrate and seed a disposable database with:

```sh
bun scripts/seed-local.ts file:/tmp/ucscmsa-playbook-review.db
```

The seed output includes local session tokens for browser tests (`e2e/fixtures.ts`); they have no effect on production. For normal development, configure `.env.local` from the example, point `TURSO_DATABASE_URL` to the scratch database and run `bun run dev`. Real admins sign in with the existing Google flow.

At `/admin/playbook`:

- Click a step's title or text to edit it inline. Timing supports days, weeks and the day of the event. “Applies to” uses the existing planning tags.
- Expand “Depends on” to choose prerequisites. Cycles, missing prerequisites and deleting a step that others need are refused.
- Drag the handle to reorder. A focused handle also moves with the arrow keys; Escape cancels a pointer drag. Touch scrolling works outside the handle. Reduced motion removes reorder animation.
- Every save, reorder, delete and restore records a snapshot. Version history includes title, text, timing and dependencies. Deleted steps can be restored below the board.
- The five original full guides and their edit history are preserved under “Full reference guides.” Cards start with the current guide text, copied verbatim, and existing task-template lead times. Reference guides remain editable separately.

At `/admin/plan`, describe an event, then select “Make a timeline.” Review the inferred title, date, needs and included steps. Prerequisites are added automatically. Saving creates a **date-only draft** and a persistent checklist; it never publishes. The existing checklist supports completion, assignment and links back to the cards. Moving the event re-dates its open tasks. Editing the board updates open tasks; completed tasks keep their dates, titles and attribution.

`/admin/plan/settings` now redirects to the board, which owns the lead-time controls.

## Agent boundary and decision

The app has no configured LLM, model credentials or model SDK. This branch therefore uses an explicit local keyword planner behind `PlanningAgent` in `lib/playbook.ts`; `getPlanningAgent()` is the single server-side provider selection point. No model calls, services or keys were added.

The local planner understands ISO dates, English month names, attendance numbers and planning keywords. Missing dates stay blank. A missing year is suggested as the next occurrence and called out for review. It cannot interpret arbitrary language reliably. The preview tells the admin to review its choices and that the local planner uses keywords.

The smallest LLM option is **one server-side structured-output request**, using the same interface to return an event title/date, planning tags, known card IDs and review notes. It needs no autonomous tools, vector database, conversation store or new tables. Justin needs to choose an approved provider/model and its credentials before that adapter can be enabled. This branch is usable without that decision.

Model output must remain a proposal: the server validates its shape and card IDs, computes dates itself and writes only after the admin reviews. Never let a provider supply arbitrary task dates, SQL or server actions. Only send the description and playbook content necessary to choose steps to a provider approved to receive the board's material.

## Timeline rules

Offsets are **Santa Cruz calendar days**, preserving the existing seed defaults. Weeks are seven calendar days. Day-of is zero. Date calculations do not step through UTC event instants, so DST cannot move a deadline. Business-day minimums and holidays remain in the fact-checked guide text; this is not an approval or working-day calendar.

The scheduler includes the prerequisite closure once, rejects cycles and orders equal-day tasks by dependency. If a prerequisite's default falls after its dependent, it moves earlier to the dependent's date and warns. Same-day dependencies warn that approval needs time. Past deadlines stay on their real dates, with a warning; today through two days ahead is marked tight. The planner never silently squeezes a missed lead time into the remaining days.

For large/public events and off-campus plans, read the guide and confirm requirements with the advisor. In particular, more than 250 people can require eight weeks; the default large-event card uses the existing six-week setting and the local planner explicitly calls out the longer requirement for review.

## Data and authorization

Cards extend `task_templates`; this keeps one lead-time source for manual and generated plans. `card_versions` stores snapshots. Soft deletion preserves completed event tasks and card history. `event_plan_selections` stores the reviewed selection and a unique request key so retrying a save does not create a second draft. Existing guides, guide versions, events and completed tasks are not rewritten by the migration.

Each page and every action calls the existing admin gate before database access. Generation is also admin-only because the playbook is private. Card edits use a revision check to refuse stale overwrites. Reordering checks the expected current order and exact card set. Generated-plan saves validate the current playbook again, use a transaction and keep drafts out of public reads.

## Demo screenshots

Captured against a clean scratch database with fake board members:

- [Desktop board](screenshots/playbook-board/board-desktop.png)
- [Inline editor](screenshots/playbook-board/inline-editor-desktop.png)
- [Phone board](screenshots/playbook-board/board-phone.png)
- [Timeline review on a phone](screenshots/playbook-board/plan-review-phone.png)
- [Saved checklist on a phone](screenshots/playbook-board/saved-timeline-phone.png)

The capture script is `scripts/playbook-agent-demo.ts`.

## Verification

Verified on tenet on 2026-10-25: 460 unit/integration tests pass, typechecking and the production build pass, lint has no errors (two pre-existing logo image warnings), and the full browser suite has 191 passed / 1 skipped. The skip is the existing date-only landing fixture check when the seed moves that event off today's fixed-fixture date.


```sh
bun run typecheck
bun run lint
bun run test --maxWorkers=2
bun run build
bun run test:e2e --workers=1
```

For this project, run heavy checks and browser work on tenet. When a task prohibits pushes, transfer the source with `rsync` to an isolated directory there rather than pushing any Git ref. Never copy `.env`, `.env.local` or production credentials.
