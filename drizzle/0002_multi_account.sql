ALTER TABLE `posts` ADD `account_key` text DEFAULT 'ai_gal_mama' NOT NULL;
--> statement-breakpoint
ALTER TABLE `account_settings` ADD `account_key` text DEFAULT 'ai_gal_mama' NOT NULL;
--> statement-breakpoint
CREATE INDEX `posts_account_created_idx` ON `posts` (`account_key`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_settings_account_key_unique` ON `account_settings` (`account_key`);
