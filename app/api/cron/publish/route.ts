import { and, asc, eq, lte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { accountSettings, posts } from "../../../../db/schema";
import { generateAccountPost } from "../../../../lib/generate-post";
import { publishToThreads } from "../../../../lib/threads";

type CronEnv = { CRON_SECRET?: string; MEDIA: R2Bucket };

export async function POST(request: Request) {
  const runtime = env as unknown as CronEnv;
  if (!runtime.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${runtime.CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const settingsRows = await db.select().from(accountSettings);
  let generated = 0;
  let generatedFailed = 0;

  for (const settings of settingsRows) {
    if (!settings.enabled || !settings.nextRunAt || settings.nextRunAt > new Date().toISOString()) continue;
    const intervalMinutes = Math.max(60, Math.floor((24 * 60) / Math.min(10, Math.max(1, settings.postsPerWeek))));
    const next = new Date(Date.now() + intervalMinutes * 60 * 1000);
    try {
      const text = await generateAccountPost(settings);
      const media = settings.imageMode === "auto" && settings.imageKey
        ? await loadImage(runtime.MEDIA, settings.imageKey, settings.imageContentType)
        : null;
      if (settings.reviewMode) {
        await db.insert(posts).values({ accountKey: settings.accountKey, text, scheduledAt: new Date().toISOString(), status: "draft", source: "template_auto", imageKey: settings.imageKey, imageUrl: settings.imageUrl });
      } else {
        const result = await publishToThreads({ accountKey: settings.accountKey as "ai_gal_mama" | "ouchiwork_mari", text, imageUrl: media ? settings.imageUrl : null, imageBase64: media?.base64, imageContentType: media?.contentType });
        await db.insert(posts).values({ accountKey: settings.accountKey, text, scheduledAt: new Date().toISOString(), status: "published", source: "template_auto", imageKey: media ? settings.imageKey : null, imageUrl: media ? settings.imageUrl : null, threadsPostId: result.id, publishedAt: new Date().toISOString() });
      }
      generated++;
    } catch (error) {
      await db.insert(posts).values({ accountKey: settings.accountKey, text: "無料自動投稿の作成に失敗しました。", scheduledAt: new Date().toISOString(), status: "failed", source: "template_auto", error: error instanceof Error ? error.message : "自動投稿に失敗しました。" });
      generatedFailed++;
    } finally {
      await db.update(accountSettings).set({ nextRunAt: next.toISOString(), updatedAt: new Date().toISOString() }).where(eq(accountSettings.id, settings.id));
    }
  }

  const due = await db.select().from(posts).where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date().toISOString()))).orderBy(asc(posts.scheduledAt)).limit(20);
  let published = 0;
  let failed = 0;
  for (const post of due) {
    try {
      const media = post.imageKey ? await loadImage(runtime.MEDIA, post.imageKey, null) : null;
      const result = await publishToThreads({ accountKey: post.accountKey as "ai_gal_mama" | "ouchiwork_mari", text: post.text, imageUrl: post.imageUrl, imageBase64: media?.base64, imageContentType: media?.contentType });
      await db.update(posts).set({ status: "published", threadsPostId: result.id, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null }).where(eq(posts.id, post.id));
      published++;
    } catch (error) {
      await db.update(posts).set({ status: "failed", error: error instanceof Error ? error.message : "投稿に失敗しました。", updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id));
      failed++;
    }
  }
  return Response.json({ checked: due.length, generated, generatedFailed, published, failed });
}

async function loadImage(bucket: R2Bucket, key: string, fallbackContentType: string | null) {
  const object = await bucket.get(key);
  if (!object) throw new Error("登録画像を読み込めませんでした。画像を再登録してください。");
  const bytes = new Uint8Array(await object.arrayBuffer());
  return { base64: bytesToBase64(bytes), contentType: object.httpMetadata?.contentType ?? fallbackContentType ?? "image/jpeg" };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}
