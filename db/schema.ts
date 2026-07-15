import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  status: text("status", { enum: ["draft", "scheduled", "published", "failed"] }).notNull().default("scheduled"),
  imageKey: text("image_key"),
  imageUrl: text("image_url"),
  threadsPostId: text("threads_post_id"),
  publishedAt: text("published_at"),
  error: text("error"),
  source: text("source").notNull().default("dashboard"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accountSettings = sqliteTable("account_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  theme: text("theme").notNull().default(""),
  audience: text("audience").notNull().default(""),
  tone: text("tone").notNull().default("親しみやすく、誠実"),
  rules: text("rules").notNull().default(""),
  postsPerWeek: integer("posts_per_week").notNull().default(3),
  postingTime: text("posting_time").notNull().default("08:00"),
  imageMode: text("image_mode").notNull().default("auto"),
  reviewMode: integer("review_mode", { mode: "boolean" }).notNull().default(false),
  nextRunAt: text("next_run_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
