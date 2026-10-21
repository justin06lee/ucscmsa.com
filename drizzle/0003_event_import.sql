CREATE TABLE `event_import_tombstones` (
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`event_id` text NOT NULL,
	`deleted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`source`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `rate_limits_window_start_idx` ON `rate_limits` (`window_start`);--> statement-breakpoint
ALTER TABLE `events` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `events` ADD `imported_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `last_imported_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `admin_edited_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `cancelled_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `events_source_source_id_unique` ON `events` (`source`,`source_id`);