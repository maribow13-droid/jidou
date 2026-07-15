import { and, asc, eq, lte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { accountSettings, posts } from "../../../../db/schema";
import { generateAccountPost } from "../../../../lib/generate-post";
import { publishToThreads } from "../../../../lib/threads";

type CronEnv = { CRON_SECRET?: string };

export async function POST(request: Request) {
  const runtime = env as unknown as CronEnv;
  if (!runtime.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${runtime.CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [settings] = await db.select().from(accountSettings).where(eq(accountSettings.id, 1));
  if (settings?.enabled && settings.nextRunAt && settings.nextRunAt <= new Date().toISOString()) {
    try {
      const text = await generateAccountPost(settings);
      if (settings.reviewMode) {
        await db.insert(posts).values({ text, scheduledAt: new Date().toISOString(), status: "draft", source: "ai_auto" });
      } else {
        const result = await publishToThreads({ text });
        await db.insert(posts).values({ text, scheduledAt: new Date().toISOString(), status: "published", source: "ai_auto", threadsPostId: result.id, publishedAt: new Date().toISOString() });
      }
      const days = Math.max(1, Math.round(7 / settings.postsPerWeek));
      const next = new Date(); next.setUTCDate(next.getUTCDate() + days);
      await db.update(accountSettings).set({ nextRunAt: next.toISOString(), updatedAt: new Date().toISOString() }).where(eq(accountSettings.id, 1));
    } catch (error) {
      await db.insert(posts).values({ text: "AI自動投稿の作成に失敗しました。", scheduledAt: new Date().toISOString(), status: "failed", source: "ai_auto", error: error instanceof Error ? error.message : "自動投稿に失敗しました。" });
    }
  }
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
