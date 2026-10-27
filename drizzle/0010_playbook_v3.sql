CREATE TABLE `playbook_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by_user_id` text,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playbook_categories_slug_unique` ON `playbook_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `playbook_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`when_note` text DEFAULT '' NOT NULL,
	`lead_days` integer,
	`form_label` text DEFAULT '' NOT NULL,
	`form_url` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by_user_id` text,
	FOREIGN KEY (`category_id`) REFERENCES `playbook_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "playbook_steps_lead_days_range" CHECK("playbook_steps"."lead_days" IS NULL OR ("playbook_steps"."lead_days" BETWEEN -60 AND 120))
);
--> statement-breakpoint
CREATE INDEX `playbook_steps_category_idx` ON `playbook_steps` (`category_id`,`sort`);--> statement-breakpoint
CREATE TABLE `timelines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`event_date` text NOT NULL,
	`size` text DEFAULT 'small' NOT NULL,
	`items` text NOT NULL,
	`chat` text NOT NULL,
	`source` text DEFAULT 'rules' NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`share_slug` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "timelines_event_date_format" CHECK("timelines"."event_date" GLOB '????-??-??')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timelines_share_slug_unique` ON `timelines` (`share_slug`);--> statement-breakpoint
CREATE INDEX `timelines_owner_idx` ON `timelines` (`owner_user_id`,`created_at`);