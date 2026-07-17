import { env } from "cloudflare:workers";

type ThreadsEnv = {
  THREADS_ACCESS_TOKEN?: string;
  THREADS_USER_ID?: string;
  THREADS_BRIDGE_URL?: string;
  THREADS_BRIDGE_SECRET?: string;
};

export async function GET() {
  const runtime = env as unknown as ThreadsEnv;

  if (runtime.THREADS_BRIDGE_URL && runtime.THREADS_BRIDGE_SECRET) {
    try {
      const response = await fetch(`${runtime.THREADS_BRIDGE_URL.replace(/\/$/, "")}/api/threads/status`, {
        headers: { Authorization: `Bearer ${runtime.THREADS_BRIDGE_SECRET}` },
      });
      const data = await response.json();
      return Response.json(data, { status: response.ok ? 200 : 503 });
    } catch {
      return Response.json({ connected: false, error: "投稿サービスに接続できませんでした。" });
    }
  }

  if (!runtime.THREADS_ACCESS_TOKEN || !runtime.THREADS_USER_ID) {
    return Response.json({ connected: false, error: "Threadsの秘密情報がまだ設定されていません。" });
  }

  try {
    const response = await fetch("https://graph.threads.net/v1.0/me?fields=id,username", {
      headers: { Authorization: `Bearer ${runtime.THREADS_ACCESS_TOKEN}` },
    });
    const data = await response.json() as { id?: string; username?: string; error?: { message?: string } };
    const connected = response.ok && data.id === runtime.THREADS_USER_ID;
    return Response.json({ connected, username: connected ? data.username : undefined, error: connected ? undefined : data.error?.message ?? "Threadsアカウントを確認できませんでした。" });
  } catch {
    return Response.json({ connected: false, error: "Threads APIに接続できませんでした。" });
  }
}
