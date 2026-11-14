ALTER TABLE `fact` ADD `lang` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `fact` ADD `tr` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `memory` ADD `lang` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `memory` ADD `tr` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `person` ADD `lang` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `person` ADD `tr` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `language` text;