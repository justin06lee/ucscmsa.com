CREATE TABLE `event_images` (
	`event_id` text NOT NULL,
	`variant` text NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`event_id`, `variant`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `events` ADD `image` text;