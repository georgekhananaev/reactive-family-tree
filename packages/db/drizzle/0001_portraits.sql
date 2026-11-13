CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `person` ADD `portrait` text;