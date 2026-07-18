import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { accountSettings } from "../../../../db/schema";
import { getThreadsAccount } from "../../../../lib/accounts";

type MediaEnv = { MEDIA: R2Bucket };

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const account = getThreadsAccount(form.get("accountKey"));
    const image = form.get("image");
    if (!(image instanceof File) || !image.size) return Response.json({ error: "画像を選択してください。" }, { status: 400 });
    if (image.size > 10 * 1024 * 1024) return Response.json({ error: "画像は10MB以下にしてください。" }, { status: 400 });
    if (!/^image\/(jpeg|png|webp)$/.test(image.type)) return Response.json({ error: "JPG・PNG・WEBP画像を選択してください。" }, { status: 400 });

    const db = getDb();
    const bucket = (env as unknown as MediaEnv).MEDIA;
    const [current] = await db.select().from(accountSettings).where(eq(accountSettings.id, account.settingsId));
    if (current?.imageKey) await bucket.delete(current.imageKey);

    const imageKey = `account-images/${account.key}/${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await bucket.put(imageKey, new Uint8Array(await image.arrayBuffer()), { httpMetadata: { contentType: image.type } });
    const imageUrl = new URL(`/api/media/${encodeURIComponent(imageKey)}`, request.url).toString();
    const values = { id: account.settingsId, accountKey: account.key, imageKey, imageUrl, imageContentType: image.type, updatedAt: new Date().toISOString() };
    const [settings] = await db.insert(accountSettings).values(values).onConflictDoUpdate({ target: accountSettings.id, set: values }).returning();
    return Response.json({ settings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "画像を登録できませんでした。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const account = getThreadsAccount(new URL(request.url).searchParams.get("account"));
    const db = getDb();
    const [current] = await db.select().from(accountSettings).where(eq(accountSettings.id, account.settingsId));
    if (current?.imageKey) await (env as unknown as MediaEnv).MEDIA.delete(current.imageKey);
    const [settings] = await db.update(accountSettings).set({ imageKey: null, imageUrl: null, imageContentType: null, updatedAt: new Date().toISOString() }).where(eq(accountSettings.id, account.settingsId)).returning();
    return Response.json({ settings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "画像を削除できませんでした。" }, { status: 500 });
  }
}
