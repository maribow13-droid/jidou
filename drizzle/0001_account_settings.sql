CREATE TABLE `account_settings` (
  `id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
  `enabled` integer DEFAULT false NOT NULL,
  `theme` text DEFAULT '' NOT NULL,
  `audience` text DEFAULT '' NOT NULL,
  `tone` text DEFAULT '親しみやすく、誠実' NOT NULL,
  `rules` text DEFAULT '' NOT NULL,
  `posts_per_week` integer DEFAULT 3 NOT NULL,
  `posting_time` text DEFAULT '08:00' NOT NULL,
  `image_mode` text DEFAULT 'auto' NOT NULL,
  `review_mode` integer DEFAULT false NOT NULL,
  `next_run_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
