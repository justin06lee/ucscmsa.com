CREATE TABLE `notify_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`muted` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reminder_sends` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`sent_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `timeline_assignees` (
	`timeline_id` text NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_by_user_id` text,
	`assigned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`timeline_id`, `item_id`),
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `timeline_assignees_user_idx` ON `timeline_assignees` (`user_id`);--> statement-breakpoint
ALTER TABLE `timelines` ADD `on_calendar` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `timelines` ADD `google_event_id` text;--> statement-breakpoint
ALTER TABLE `timelines` ADD `calendar_dirty` integer DEFAULT false NOT NULL;