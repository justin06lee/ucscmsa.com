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
- Write directly in the visual blocks, including in the full reference guides. The toolbar changes block type (text, heading, bullets, numbered steps, checklist or callout) and applies bold/italic. Select text and choose Link, or click an existing link, to edit its readable label and web address. A blank label becomes a short resource name.
- Drag a block's grip to reorder it. Add a subtask creates an indented block under the current one. More also offers move up/down, nest/unnest, duplicate and delete; these work on touch screens and with a keyboard. Undo/redo apply to unsaved text edits. Save step or Save commits the document, including nesting and link labels.
- Expand “Depends on” to choose prerequisites. Cycles, missing prerequisites and deleting a step that others need are refused.
- The playbook home lists categories (Hold an event, Get funding, Book a room, Serve food, Big event, Go off campus, Work with another group; `app/admin/playbook/_tasks.ts`). A category page shows its steps as numbered instructions. Only after "Edit steps" can an admin edit, add, or move a step up or down, and only within its category; nothing is draggable in view mode.
- Every save, reorder, delete and restore records a snapshot. Version history includes title, text, timing and dependencies. Deleted steps can be restored below the board.
- The five original full guides and their edit history are preserved under “Full reference guides.” Cards start with the current guide text, copied verbatim, and existing task-template lead times. Reference guides remain editable separately, with the same visual editor. Long raw URLs display as short highlighted resource labels while their exact destinations stay intact. An admin can change any label or destination in the editor.

At `/admin/plan`, describe an event, then select “Make a timeline.” Review the inferred title, date, needs and included steps. Prerequisites are added automatically. Saving creates a **date-only draft** and a persistent checklist; it never publishes. The existing checklist supports completion, assignment and links back to the cards. Moving the event re-dates its open tasks. Editing the board updates open tasks; completed tasks keep their dates, titles and attribution.

`/admin/plan/settings` now redirects to the board, which owns the lead-time controls.

## Agent boundary and decision

`getPlanningAgent()` in `lib/planning-agent.ts` is the single server-side provider selection point behind `PlanningAgent` (`lib/playbook.ts`). With `DEEPINFRA_API_KEY` set it uses `lib/deepinfra-planner.ts`: one call to DeepInfra's OpenAI-compatible endpoint (temperature 0, at most 300 output tokens, 8 second timeout), whose JSON reply may only name a title, a date and known planning tags; the steps come from those tags, never from the model. Results are cached in memory per instance for a day, keyed by the description, the date and the board's card revisions. With no key, or when the call errors, times out or fails validation, the local keyword planner below answers instead.

The local planner understands ISO dates, English month names, attendance numbers and planning keywords. Missing dates stay blank. A missing year is suggested as the next occurrence and called out for review. It cannot interpret arbitrary language reliably. The preview tells the admin to review its choices and that the local planner uses keywords.

The smallest LLM option is **one server-side structured-output request**, using the same interface to return an event title/date, planning tags, known card IDs and review notes. It needs no autonomous tools, vector database, conversation store or new tables. Justin needs to choose an approved provider/model and its credentials before that adapter can be enabled. This branch is usable without that decision.

Model output must remain a proposal: the server validates its shape and card IDs, computes dates itself and writes only after the admin reviews. Never let a provider supply arbitrary task dates, SQL or server actions. Only send the description and playbook content necessary to choose steps to a provider approved to receive the board's material.

## Timeline rules

Offsets are **Santa Cruz calendar days**, preserving the existing seed defaults. Weeks are seven calendar days. Day-of is zero. Date calculations do not step through UTC event instants, so DST cannot move a deadline. Business-day minimums and holidays remain in the fact-checked guide text; this is not an approval or working-day calendar.

The scheduler includes the prerequisite closure once, rejects cycles and orders equal-day tasks by dependency. If a prerequisite's default falls after its dependent, it moves earlier to the dependent's date and warns. Same-day dependencies warn that approval needs time. Past deadlines stay on their real dates, with a warning; today through two days ahead is marked tight. The planner never silently squeezes a missed lead time into the remaining days.

For large/public events and off-campus plans, read the guide and confirm requirements with the advisor. In particular, more than 250 people can require eight weeks; the default large-event card uses the existing six-week setting and the local planner explicitly calls out the longer requirement for review.

## Data and authorization

Cards extend `task_templates`; this keeps one lead-time source for manual and generated plans. `card_versions` stores snapshots. Soft deletion preserves completed event tasks and card history. `event_plan_selections` stores the reviewed selection and a unique request key so retrying a save does not create a second draft. Existing guides, guide versions, events and completed tasks are not rewritten by the migration.

Visual edits store a versioned `playbook-blocks-v1` document in the existing body column, so nested content survives save/reload without a lossy Markdown export. Legacy Markdown and every earlier version remain readable and restorable; opening a guide alone never rewrites it. No additional migration or service is needed. BlockNote is loaded only when an editor opens; reading remains server rendered through React elements, with no raw HTML. The shared server validator accepts only supported blocks/styles and safe http(s) links, up to 20,000 text characters, 250 blocks, 8 nesting levels and 200,000 serialized characters. Malformed structured bodies are refused on save and fail closed on read. Older app versions cannot read the new structured bodies; keep the compatible renderer when rolling back after visual edits have been saved.

Each page and every action calls the existing admin gate before database access. Generation is also admin-only because the playbook is private. Card edits use a revision check to refuse stale overwrites. Reordering checks the expected current order and exact card set. Generated-plan saves validate the current playbook again, use a transaction and keep drafts out of public reads.

## Demo screenshots

Captured against a clean scratch database with fake board members:

- [Visual editor on desktop](screenshots/playbook-visual/editor-1280.png)
- [Visual editor on a phone](screenshots/playbook-visual/editor-375.png)
- [Editing a link](screenshots/playbook-visual/link-editor-1280.png)
- [Room guide with labeled links](screenshots/playbook-visual/guide-1280.png)
- [Timeline review on a phone](screenshots/playbook-board/plan-review-phone.png)
- [Saved checklist on a phone](screenshots/playbook-board/saved-timeline-phone.png)

Capture scripts: `scripts/playbook-agent-demo.ts` for the board/timeline and `scripts/visual-playbook-demo.ts` for visual editing and the compact resource links.

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
