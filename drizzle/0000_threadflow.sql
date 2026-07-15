CREATE TABLE `posts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `text` text NOT NULL,
  `scheduled_at` text NOT NULL,
  `status` text DEFAULT 'scheduled' NOT NULL,
  `image_key` text,
  `image_url` text,
  `threads_post_id` text,
  `published_at` text,
  `error` text,
  `source` text DEFAULT 'dashboard' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_schedule_idx` ON `posts` (`status`,`scheduled_at`);
