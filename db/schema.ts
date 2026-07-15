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
