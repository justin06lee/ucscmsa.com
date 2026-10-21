CREATE TABLE `event_tags` (
	`event_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`event_id`, `tag`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_tags_tag_check" CHECK("event_tags"."tag" IN ('room', 'food', 'funding', 'big', 'offcampus', 'collab'))
);
--> statement-breakpoint
CREATE TABLE `event_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`template_id` text,
	`tag` text,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`done_at` integer,
	`done_by_user_id` text,
	`assignee_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `task_templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`done_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "event_tasks_due_date_format" CHECK("event_tasks"."due_date" GLOB '????-??-??')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_tasks_event_template_unique` ON `event_tasks` (`event_id`,`template_id`);--> statement-breakpoint
CREATE INDEX `event_tasks_due_date_idx` ON `event_tasks` (`due_date`);--> statement-breakpoint
CREATE TABLE `guide_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guide_slug` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`guide_slug`) REFERENCES `guides`(`slug`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `guide_versions_guide_slug_idx` ON `guide_versions` (`guide_slug`);--> statement-breakpoint
CREATE TABLE `guides` (
	`slug` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by_user_id` text,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`tag` text,
	`title` text NOT NULL,
	`days_before` integer NOT NULL,
	`guide_slug` text,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_templates_days_before_check" CHECK("task_templates"."days_before" BETWEEN 0 AND 120),
	CONSTRAINT "task_templates_tag_check" CHECK("task_templates"."tag" IS NULL OR "task_templates"."tag" IN ('room', 'food', 'funding', 'big', 'offcampus', 'collab'))
);
--> statement-breakpoint
ALTER TABLE `events` ADD `draft` integer DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO `guides` (`slug`, `title`, `body`, `sort`) VALUES ('book-a-room', 'Book a room', '## Steps

1. Go to the UCSC spaces website and pick a room. TODO: add the link to the spaces website.
2. Check how that room is booked:
   - Some rooms: email the room''s reservation contact.
   - Others: check the available times on its calendar and press **Reserve**.
3. Fill in the Google form:
   - Lounges and meeting rooms: [2025/2026 Lounge and Meeting Room Reservation Form](https://docs.google.com/forms/d/e/1FAIpQLSetTP8kGTdY1_rH7cdxHB7cMZQCQBjWGcMYaHTUZur9BhzrOw/viewform). It covers the Stevenson Fireside, Cowell Mary Holmes Fireside, College 9 & John R. Lewis Namaste, Porter Hitchcock and Rachel Carson Red Room lounges.
   - Redwood Lounge has its own form. TODO: add the link to the Redwood Lounge form.
   - [Second room/event form](https://docs.google.com/forms/d/e/1FAIpQLSd4lXQAcMVEomd7vu_8420ySAP3dxuc9mtYGQEeJz4-_LT0sA/viewform). TODO: it needs a UCSC sign-in to open; say which form it is.
4. Wait for their email confirming the booking.

## Last minute

- Library study rooms, at McHenry or Science & Engineering: [Reserve a study room](https://guides.library.ucsc.edu/reserve-a-study-room).
- If the other rooms are full, use a classroom.

## Gotchas

- Sending the form doesn''t book the room. Their confirmation email does.
- The lounge form asks for at least seven business days to confirm a request.
', 1);
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) VALUES ('book-a-room', 'Book a room', '## Steps

1. Go to the UCSC spaces website and pick a room. TODO: add the link to the spaces website.
2. Check how that room is booked:
   - Some rooms: email the room''s reservation contact.
   - Others: check the available times on its calendar and press **Reserve**.
3. Fill in the Google form:
   - Lounges and meeting rooms: [2025/2026 Lounge and Meeting Room Reservation Form](https://docs.google.com/forms/d/e/1FAIpQLSetTP8kGTdY1_rH7cdxHB7cMZQCQBjWGcMYaHTUZur9BhzrOw/viewform). It covers the Stevenson Fireside, Cowell Mary Holmes Fireside, College 9 & John R. Lewis Namaste, Porter Hitchcock and Rachel Carson Red Room lounges.
   - Redwood Lounge has its own form. TODO: add the link to the Redwood Lounge form.
   - [Second room/event form](https://docs.google.com/forms/d/e/1FAIpQLSd4lXQAcMVEomd7vu_8420ySAP3dxuc9mtYGQEeJz4-_LT0sA/viewform). TODO: it needs a UCSC sign-in to open; say which form it is.
4. Wait for their email confirming the booking.

## Last minute

- Library study rooms, at McHenry or Science & Engineering: [Reserve a study room](https://guides.library.ucsc.edu/reserve-a-study-room).
- If the other rooms are full, use a classroom.

## Gotchas

- Sending the form doesn''t book the room. Their confirmation email does.
- The lounge form asks for at least seven business days to confirm a request.
');
--> statement-breakpoint
INSERT INTO `guides` (`slug`, `title`, `body`, `sort`) VALUES ('funding', 'Get funding', 'Money takes 2–3 weeks to arrive, so apply early.

## Steps

1. Read how funding works: [Student organization funding](https://getinvolved.ucsc.edu/student-organizations/funding/).
2. Apply to a college. The colleges are the main source, and you can apply to any of them.
3. Submit the [funding form](https://docs.google.com/forms/d/1Cav9BEd5mqBPgXNLlje_QlgbZPRQBYmoSx_ct6pSjrg/viewform) **and** send an email. You need both.
4. Wait 2–3 weeks for the money.

## Colleges

- Cowell: [Student leadership](https://cowell.ucsc.edu/student-opportunities/student-leadership/)
- TODO: college funding emails (to be filled in).

## Gotchas

- Several applications a week are fine, as long as each one is for a different event.
- The form alone isn''t enough: send the email too.
', 2);
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) VALUES ('funding', 'Get funding', 'Money takes 2–3 weeks to arrive, so apply early.

## Steps

1. Read how funding works: [Student organization funding](https://getinvolved.ucsc.edu/student-organizations/funding/).
2. Apply to a college. The colleges are the main source, and you can apply to any of them.
3. Submit the [funding form](https://docs.google.com/forms/d/1Cav9BEd5mqBPgXNLlje_QlgbZPRQBYmoSx_ct6pSjrg/viewform) **and** send an email. You need both.
4. Wait 2–3 weeks for the money.

## Colleges

- Cowell: [Student leadership](https://cowell.ucsc.edu/student-opportunities/student-leadership/)
- TODO: college funding emails (to be filled in).

## Gotchas

- Several applications a week are fine, as long as each one is for a different event.
- The form alone isn''t enough: send the email too.
');
--> statement-breakpoint
INSERT INTO `guides` (`slug`, `title`, `body`, `sort`) VALUES ('bigger-events', 'Run a bigger event', '## Steps

1. Fill in the event proposal form. TODO: add the link to the event proposal form.
2. Meet with the advisor.
', 3);
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) VALUES ('bigger-events', 'Run a bigger event', '## Steps

1. Fill in the event proposal form. TODO: add the link to the event proposal form.
2. Meet with the advisor.
');
--> statement-breakpoint
INSERT INTO `guides` (`slug`, `title`, `body`, `sort`) VALUES ('food', 'Buy food', 'Money is spent through purchase orders, and they pay the vendor.

## Steps

1. Fill in the purchase form. TODO: add its link, if it isn''t the DocuSign form in step 2.
2. Meet in person to sign everything off on DocuSign. TODO: add the DocuSign link.
3. They email you a purchase order (for restaurants).
4. Get an itemized receipt.

## Gotchas

- Spend money through purchase orders.
- Always get an itemized receipt.
', 4);
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) VALUES ('food', 'Buy food', 'Money is spent through purchase orders, and they pay the vendor.

## Steps

1. Fill in the purchase form. TODO: add its link, if it isn''t the DocuSign form in step 2.
2. Meet in person to sign everything off on DocuSign. TODO: add the DocuSign link.
3. They email you a purchase order (for restaurants).
4. Get an itemized receipt.

## Gotchas

- Spend money through purchase orders.
- Always get an itemized receipt.
');
--> statement-breakpoint
INSERT INTO `guides` (`slug`, `title`, `body`, `sort`) VALUES ('promotion', 'Promote the event', '## A week before

1. Post on Instagram.
2. Announce it in the WhatsApp announcements.
3. Add it to the shared calendar, and publish it on this site: open the event in Planning and press **Publish**.

## The day before

- Post a reminder.
', 5);
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) VALUES ('promotion', 'Promote the event', '## A week before

1. Post on Instagram.
2. Announce it in the WhatsApp announcements.
3. Add it to the shared calendar, and publish it on this site: open the event in Planning and press **Publish**.

## The day before

- Post a reminder.
');
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('funding', 'funding', 'Apply for funding', 21, 'funding', 10);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('proposal', 'big', 'Send the event proposal', 21, 'bigger-events', 20);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('advisor', 'big', 'Meet with the advisor', 14, 'bigger-events', 21);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('collab', 'collab', 'Agree with the partner org who does what', 21, NULL, 25);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('room', 'room', 'Book a room', 14, 'book-a-room', 30);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('offcampus', 'offcampus', 'Confirm the venue and how everyone gets there', 14, NULL, 40);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('purchase', 'food', 'Submit the purchase form', 7, 'food', 50);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('promo-week', NULL, 'Post on Instagram and WhatsApp', 7, 'promotion', 60);
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('promo-eve', NULL, 'Post a reminder', 1, 'promotion', 70);
