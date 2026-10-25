CREATE TABLE `card_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`card_id`) REFERENCES `task_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_versions_card_idx` ON `card_versions` (`card_id`);--> statement-breakpoint
CREATE TABLE `event_plan_selections` (
	`event_id` text PRIMARY KEY NOT NULL,
	`card_ids` text NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_plan_selections_request_id_unique` ON `event_plan_selections` (`request_id`);--> statement-breakpoint
ALTER TABLE `task_templates` ADD `body` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_templates` ADD `dependencies` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_templates` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_templates` ADD `archived_at` integer;--> statement-breakpoint
-- Copy the current, possibly admin-edited guide text verbatim. The guides and
-- their version history remain intact. No external content is fetched.
UPDATE task_templates SET body = COALESCE((SELECT body FROM guides WHERE slug = task_templates.guide_slug), '');
--> statement-breakpoint
UPDATE task_templates SET dependencies = '["proposal"]' WHERE id IN ('room', 'purchase', 'advisor');
--> statement-breakpoint
UPDATE task_templates SET dependencies = '["proposal","vendor-204"]' WHERE id = 'purchase';
--> statement-breakpoint
UPDATE task_templates SET dependencies = '["flyer"]' WHERE id = 'promo-week';
--> statement-breakpoint
UPDATE task_templates SET dependencies = '["promo-week"]' WHERE id = 'promo-eve';
--> statement-breakpoint
INSERT INTO card_versions (card_id, snapshot)
SELECT id, json_object('title', title, 'body', body, 'daysBefore', days_before,
  'tag', tag, 'dependencies', json(dependencies), 'sort', sort,
  'guideSlug', guide_slug, 'archived', json('false')) FROM task_templates;
