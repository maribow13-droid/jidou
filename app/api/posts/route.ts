import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { posts } from "../../../db/schema";
import { getThreadsAccount } from "../../../lib/accounts";
import { publishToThreads } from "../../../lib/threads";

type MediaEnv = { MEDIA: R2Bucket };

export async function GET(request: Request) {
  try {
    const account = getThreadsAccount(new URL(request.url).searchParams.get("account"));
    const rows = await getDb().select().from(posts).where(eq(posts.accountKey, account.key)).orderBy(desc(posts.createdAt)).limit(100);
    return Response.json({ posts: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "投稿一覧を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const account = getThreadsAccount(form.get("accountKey"));
    const text = String(form.get("text") ?? "").trim();
    const scheduledAt = String(form.get("scheduledAt") ?? "");
    const publishNow = form.get("publishNow") === "true";
    const image = form.get("image");
    if (!text || text.length > 500) return Response.json({ error: "投稿文は1〜500文字で入力してください。" }, { status: 400 });
    if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) return Response.json({ error: "正しい投稿日時を指定してください。" }, { status: 400 });

    let imageKey: string | null = null;
    let imageUrl: string | null = null;
    let imageBase64: string | null = null;
    let imageContentType: string | null = null;
    if (image instanceof File && image.size) {
      if (image.size > 10 * 1024 * 1024) return Response.json({ error: "画像は10MB以下にしてください。" }, { status: 400 });
      if (!/^image\/(jpeg|png|webp)$/.test(image.type)) return Response.json({ error: "JPG・PNG・WEBP画像を選択してください。" }, { status: 400 });
      imageKey = `posts/${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const bytes = new Uint8Array(await image.arrayBuffer());
      await (env as unknown as MediaEnv).MEDIA.put(imageKey, bytes, { httpMetadata: { contentType: image.type } });
      imageUrl = new URL(`/api/media/${encodeURIComponent(imageKey)}`, request.url).toString();
      imageBase64 = bytesToBase64(bytes);
      imageContentType = image.type;
    }

    const db = getDb();
    const [post] = await db.insert(posts).values({ accountKey: account.key, text, scheduledAt, imageKey, imageUrl, status: publishNow ? "draft" : "scheduled" }).returning();
    if (!publishNow) return Response.json({ post }, { status: 201 });

    try {
      const published = await publishToThreads({ accountKey: account.key, text, imageUrl, imageBase64, imageContentType });
      const [updated] = await db.update(posts).set({ status: "published", threadsPostId: published.id, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id)).returning();
      return Response.json({ post: updated }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Threadsへの投稿に失敗しました。";
      await db.update(posts).set({ status: "failed", error: message, updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id));
      return Response.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存に失敗しました。" }, { status: 500 });
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
