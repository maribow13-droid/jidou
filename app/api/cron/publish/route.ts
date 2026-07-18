import { and, asc, eq, gte, lte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { accountSettings, posts } from "../../../../db/schema";
import { generateAccountPostDetails } from "../../../../lib/generate-post";
import { nextScheduledRun, tokyoDayStartSql } from "../../../../lib/schedule";
import { publishToThreads } from "../../../../lib/threads";

type CronEnv = { CRON_SECRET?: string; MEDIA: R2Bucket };

type SheetProfile = {
  accountKey?: string;
  enabled?: boolean;
  theme?: string;
  audience?: string;
  tone?: string;
  rules?: string;
  postsPerDay?: number;
  postingTime?: string;
  imageMode?: string;
  reviewMode?: boolean;
};

type GeneratedRecord = {
  id: number;
  accountKey: string;
  category: string;
  text: string;
  status: "draft" | "published" | "failed";
  scheduledAt: string;
  publishedAt: string | null;
  threadsPostId: string | null;
  imageUrl: string | null;
  error: string | null;
};

export async function POST(request: Request) {
  const runtime = env as unknown as CronEnv;
  if (!runtime.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${runtime.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const body = await request.json().catch(() => ({})) as { profiles?: SheetProfile[] };
  if (body.profiles?.length) await syncProfiles(db, body.profiles);

  const settingsRows = await db.select().from(accountSettings);
  const generatedPosts: GeneratedRecord[] = [];
  let generated = 0;
  let generatedFailed = 0;

  for (const settings of settingsRows) {
    const now = new Date();
    if (!settings.enabled || !settings.nextRunAt || settings.nextRunAt > now.toISOString()) continue;

    const dailyLimit = Math.min(10, Math.max(1, settings.postsPerWeek));
    const todayRows = await db.select({ id: posts.id }).from(posts).where(and(
      eq(posts.accountKey, settings.accountKey),
      eq(posts.source, "template_auto"),
      gte(posts.createdAt, tokyoDayStartSql(now)),
    ));

    if (todayRows.length >= dailyLimit) {
      await db.update(accountSettings).set({
        nextRunAt: nextScheduledRun(dailyLimit, now, settings.postingTime),
        updatedAt: now.toISOString(),
      }).where(eq(accountSettings.id, settings.id));
      continue;
    }

    try {
      const generatedPost = await generateAccountPostDetails(settings);
      const media = settings.imageMode === "auto" && settings.imageKey
        ? await loadImage(runtime.MEDIA, settings.imageKey, settings.imageContentType)
        : null;

      if (settings.reviewMode) {
        const [record] = await db.insert(posts).values({
          accountKey: settings.accountKey,
          text: generatedPost.text,
          scheduledAt: now.toISOString(),
          status: "draft",
          source: "template_auto",
          imageKey: settings.imageKey,
          imageUrl: settings.imageUrl,
        }).returning();
        generatedPosts.push(toGeneratedRecord(record, generatedPost.category));
      } else {
        const result = await publishToThreads({
          accountKey: settings.accountKey as "ai_gal_mama" | "ouchiwork_mari",
          text: generatedPost.text,
          imageUrl: media ? settings.imageUrl : null,
          imageBase64: media?.base64,
          imageContentType: media?.contentType,
        });
        const [record] = await db.insert(posts).values({
          accountKey: settings.accountKey,
          text: generatedPost.text,
          scheduledAt: now.toISOString(),
          status: "published",
          source: "template_auto",
          imageKey: media ? settings.imageKey : null,
          imageUrl: media ? settings.imageUrl : null,
          threadsPostId: result.id,
          publishedAt: now.toISOString(),
        }).returning();
        generatedPosts.push(toGeneratedRecord(record, generatedPost.category));
      }
      generated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "自動投稿の作成に失敗しました。";
      const [record] = await db.insert(posts).values({
        accountKey: settings.accountKey,
        text: "無料自動投稿の作成に失敗しました。",
        scheduledAt: now.toISOString(),
        status: "failed",
        source: "template_auto",
        error: message,
      }).returning();
      generatedPosts.push(toGeneratedRecord(record, "生成エラー"));
      generatedFailed += 1;
    } finally {
      await db.update(accountSettings).set({
        nextRunAt: nextScheduledRun(dailyLimit, new Date(Date.now() + 60_000), settings.postingTime),
        updatedAt: new Date().toISOString(),
      }).where(eq(accountSettings.id, settings.id));
    }
  }

  const due = await db.select().from(posts).where(and(
    eq(posts.status, "scheduled"),
    lte(posts.scheduledAt, new Date().toISOString()),
  )).orderBy(asc(posts.scheduledAt)).limit(20);

  let published = 0;
  let failed = 0;
  for (const post of due) {
    try {
      const media = post.imageKey ? await loadImage(runtime.MEDIA, post.imageKey, null) : null;
      const result = await publishToThreads({
        accountKey: post.accountKey as "ai_gal_mama" | "ouchiwork_mari",
        text: post.text,
        imageUrl: post.imageUrl,
        imageBase64: media?.base64,
        imageContentType: media?.contentType,
      });
      await db.update(posts).set({
        status: "published",
        threadsPostId: result.id,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
      }).where(eq(posts.id, post.id));
      published += 1;
    } catch (error) {
      await db.update(posts).set({
        status: "failed",
        error: error instanceof Error ? error.message : "投稿に失敗しました。",
        updatedAt: new Date().toISOString(),
      }).where(eq(posts.id, post.id));
      failed += 1;
    }
  }

  return Response.json({ checked: due.length, generated, generatedFailed, published, failed, generatedPosts });
}

async function syncProfiles(db: ReturnType<typeof getDb>, profiles: SheetProfile[]) {
  const current = await db.select().from(accountSettings);
  const currentByKey = new Map(current.map((row) => [row.accountKey, row]));

  for (const profile of profiles) {
    const accountKey = String(profile.accountKey ?? "").replace(/^@/, "");
    if (accountKey !== "ai_gal_mama" && accountKey !== "ouchiwork_mari") continue;

    const existing = currentByKey.get(accountKey);
    const postsPerDay = Math.min(10, Math.max(1, Number(profile.postsPerDay) || 1));
    const postingTime = /^\d{2}:\d{2}$/.test(profile.postingTime ?? "") ? profile.postingTime! : "20:30";
    const enabled = Boolean(profile.enabled);
    const nextRunAt = enabled
      ? existing?.enabled && existing.nextRunAt
        ? existing.nextRunAt
        : nextScheduledRun(postsPerDay, new Date(), postingTime)
      : null;
    const id = accountKey === "ai_gal_mama" ? 1 : 2;
    const values = {
      id,
      accountKey,
      enabled,
      theme: String(profile.theme ?? existing?.theme ?? "").trim(),
      audience: String(profile.audience ?? existing?.audience ?? "").trim(),
      tone: String(profile.tone ?? existing?.tone ?? "親しみやすく、誠実").trim(),
      rules: String(profile.rules ?? existing?.rules ?? "").trim(),
      postsPerWeek: postsPerDay,
      postingTime,
      imageMode: profile.imageMode === "none" ? "none" : "auto",
      reviewMode: profile.reviewMode !== false,
      nextRunAt,
      updatedAt: new Date().toISOString(),
    };
    await db.insert(accountSettings).values(values).onConflictDoUpdate({
      target: accountSettings.id,
      set: values,
    });
  }
}

function toGeneratedRecord(record: typeof posts.$inferSelect, category: string): GeneratedRecord {
  return {
    id: record.id,
    accountKey: record.accountKey,
    category,
    text: record.text,
    status: record.status as GeneratedRecord["status"],
    scheduledAt: record.scheduledAt,
    publishedAt: record.publishedAt,
    threadsPostId: record.threadsPostId,
    imageUrl: record.imageUrl,
    error: record.error,
  };
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
