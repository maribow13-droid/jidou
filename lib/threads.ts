import { env } from "cloudflare:workers";

type ThreadsEnv = { THREADS_ACCESS_TOKEN?: string; THREADS_USER_ID?: string };

export async function publishToThreads(input: { text: string; imageUrl?: string | null }) {
  const runtime = env as unknown as ThreadsEnv;
  if (!runtime.THREADS_ACCESS_TOKEN || !runtime.THREADS_USER_ID) throw new Error("Threads APIの接続設定が未完了です。");
  const endpoint = `https://graph.threads.net/v1.0/${runtime.THREADS_USER_ID}`;
  const createBody = new URLSearchParams({ text: input.text, access_token: runtime.THREADS_ACCESS_TOKEN });
  if (input.imageUrl) { createBody.set("media_type", "IMAGE"); createBody.set("image_url", input.imageUrl); }
  else { createBody.set("media_type", "TEXT"); }
  const created = await fetch(`${endpoint}/threads`, { method: "POST", body: createBody });
  const container = await created.json() as { id?: string; error?: { message?: string } };
  if (!created.ok || !container.id) throw new Error(container.error?.message ?? "投稿データを作成できませんでした。");
  const published = await fetch(`${endpoint}/threads_publish`, { method: "POST", body: new URLSearchParams({ creation_id: container.id, access_token: runtime.THREADS_ACCESS_TOKEN }) });
  const result = await published.json() as { id?: string; error?: { message?: string } };
  if (!published.ok || !result.id) throw new Error(result.error?.message ?? "投稿を公開できませんでした。");
  return { id: result.id };
}
