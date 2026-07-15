import { and, asc, eq, lte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { posts } from "../../../../db/schema";
import { publishToThreads } from "../../../../lib/threads";

type CronEnv = { CRON_SECRET?: string };

export async function POST(request: Request) {
  const runtime = env as unknown as CronEnv;
  if (!runtime.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${runtime.CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const due = await db.select().from(posts).where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date().toISOString()))).orderBy(asc(posts.scheduledAt)).limit(20);
  let published = 0; let failed = 0;
  for (const post of due) {
    try {
      const result = await publishToThreads({ text: post.text, imageUrl: post.imageUrl });
      await db.update(posts).set({ status: "published", threadsPostId: result.id, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null }).where(eq(posts.id, post.id)); published++;
    } catch (error) {
      await db.update(posts).set({ status: "failed", error: error instanceof Error ? error.message : "投稿に失敗しました。", updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id)); failed++;
    }
  }
  return Response.json({ checked: due.length, published, failed });
}
