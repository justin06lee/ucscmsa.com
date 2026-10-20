CREATE TABLE `admin_removals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`nomination_id` text,
	`removed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_removals_email_idx` ON `admin_removals` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`recurrence_freq` text,
	`recurrence_by_weekday` text,
	`recurrence_interval` integer DEFAULT 1 NOT NULL,
	`recurrence_until` integer,
	`created_by_admin_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "title", "description", "location", "start_time", "end_time", "recurrence_freq", "recurrence_by_weekday", "recurrence_interval", "recurrence_until", "created_by_admin_id", "created_at", "updated_at") SELECT "id", "title", "description", "location", "start_time", "end_time", "recurrence_freq", "recurrence_by_weekday", "recurrence_interval", "recurrence_until", "created_by_admin_id", "created_at", "updated_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `events_created_by_admin_id_idx` ON `events` (`created_by_admin_id`);