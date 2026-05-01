CREATE INDEX `admin_approvals_approver_admin_id_idx` ON `admin_approvals` (`approver_admin_id`);--> statement-breakpoint
CREATE INDEX `admin_nominations_nominated_by_admin_id_idx` ON `admin_nominations` (`nominated_by_admin_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_event_cancellations` (
	`event_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	PRIMARY KEY(`event_id`, `occurrence_date`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_cancellations_occurrence_date_format" CHECK("__new_event_cancellations"."occurrence_date" GLOB '????-??-??')
);
--> statement-breakpoint
INSERT INTO `__new_event_cancellations`("event_id", "occurrence_date") SELECT "event_id", "occurrence_date" FROM `event_cancellations`;--> statement-breakpoint
DROP TABLE `event_cancellations`;--> statement-breakpoint
ALTER TABLE `__new_event_cancellations` RENAME TO `event_cancellations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `event_cancellations_event_id_idx` ON `event_cancellations` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_rsvps_user_id_idx` ON `event_rsvps` (`user_id`);--> statement-breakpoint
CREATE INDEX `event_rsvps_occurrence_start_idx` ON `event_rsvps` (`occurrence_start`);--> statement-breakpoint
CREATE INDEX `events_created_by_admin_id_idx` ON `events` (`created_by_admin_id`);--> statement-breakpoint
CREATE TABLE `__new_prayer_times_cache` (
	`date` text PRIMARY KEY NOT NULL,
	`fajr` text NOT NULL,
	`sunrise` text NOT NULL,
	`dhuhr` text NOT NULL,
	`asr` text NOT NULL,
	`maghrib` text NOT NULL,
	`isha` text NOT NULL,
	`cached_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "prayer_times_cache_fajr_format" CHECK("__new_prayer_times_cache"."fajr" GLOB '??:??'),
	CONSTRAINT "prayer_times_cache_sunrise_format" CHECK("__new_prayer_times_cache"."sunrise" GLOB '??:??'),
	CONSTRAINT "prayer_times_cache_dhuhr_format" CHECK("__new_prayer_times_cache"."dhuhr" GLOB '??:??'),
	CONSTRAINT "prayer_times_cache_asr_format" CHECK("__new_prayer_times_cache"."asr" GLOB '??:??'),
	CONSTRAINT "prayer_times_cache_maghrib_format" CHECK("__new_prayer_times_cache"."maghrib" GLOB '??:??'),
	CONSTRAINT "prayer_times_cache_isha_format" CHECK("__new_prayer_times_cache"."isha" GLOB '??:??')
);
--> statement-breakpoint
INSERT INTO `__new_prayer_times_cache`("date", "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha", "cached_at") SELECT "date", "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha", "cached_at" FROM `prayer_times_cache`;--> statement-breakpoint
DROP TABLE `prayer_times_cache`;--> statement-breakpoint
ALTER TABLE `__new_prayer_times_cache` RENAME TO `prayer_times_cache`;