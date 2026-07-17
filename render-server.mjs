import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { URL } from "node:url";

const port = Number(process.env.PORT || 10000);
const media = new Map();

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ThreadFlow OAuth</title><style>body{font-family:system-ui,sans-serif;background:#f7f6f3;color:#24232a;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#fff;border:1px solid #e7e4df;border-radius:18px;padding:36px;max-width:560px;box-shadow:0 12px 40px #25202a12}h1{font-family:Georgia,serif;margin-top:0}.ok{color:#4b9c6b}code{background:#f0eef9;padding:3px 6px;border-radius:5px}</style><main class="card">${body}</main></html>`);
}

function authorized(req) {
  const expected = process.env.THREADS_BRIDGE_SECRET || "";
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) throw new Error("送信できる画像は10MBまでです。");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function credentialsFor(accountKey = "ai_gal_mama") {
  const accounts = {
    ai_gal_mama: { token: process.env.THREADS_ACCESS_TOKEN, userId: process.env.THREADS_USER_ID },
    ouchiwork_mari: { token: process.env.THREADS_ACCESS_TOKEN_OUCHIWORK_MARI, userId: process.env.THREADS_USER_ID_OUCHIWORK_MARI },
  };
  const credentials = accounts[accountKey];
  if (!credentials) throw new Error("選択されたThreadsアカウントは登録されていません。");
  return credentials;
}

async function threadsMe(accountKey) {
  const { token, userId } = credentialsFor(accountKey);
  if (!token || !userId) throw new Error("Threads APIの秘密情報が未設定です。");
  const response = await fetch("https://graph.threads.net/v1.0/me?fields=id,username", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok || data.id !== userId) throw new Error(data.error?.message || "Threadsアカウントを確認できませんでした。");
  return data;
}

async function publishThreads(origin, body) {
  const accountKey = String(body.accountKey || "ai_gal_mama");
  const { token, userId } = credentialsFor(accountKey);
  const text = String(body.text || "").trim();
  if (!token || !userId) throw new Error("Threads APIの秘密情報が未設定です。");
  if (!text || text.length > 500) throw new Error("投稿文は1〜500文字で入力してください。");

  const createBody = new URLSearchParams({ text, access_token: token });
  let mediaId = null;
  if (body.imageBase64) {
    const contentType = String(body.imageContentType || "");
    if (!/^image\/(jpeg|png|webp)$/.test(contentType)) throw new Error("JPG・PNG・WEBP画像を選択してください。");
    const bytes = Buffer.from(String(body.imageBase64), "base64");
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("送信できる画像は10MBまでです。");
    mediaId = randomUUID();
    media.set(mediaId, { bytes, contentType, expiresAt: Date.now() + 10 * 60 * 1000 });
    createBody.set("media_type", "IMAGE");
    createBody.set("image_url", `${origin}/api/media/${mediaId}`);
  } else if (body.imageUrl) {
    createBody.set("media_type", "IMAGE");
    createBody.set("image_url", String(body.imageUrl));
  } else {
    createBody.set("media_type", "TEXT");
  }

  try {
    const endpoint = `https://graph.threads.net/v1.0/${userId}`;
    const created = await fetch(`${endpoint}/threads`, { method: "POST", body: createBody });
    const container = await created.json();
    if (!created.ok || !container.id) throw new Error(container.error?.message || "投稿データを作成できませんでした。");

    if (mediaId) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const statusResponse = await fetch(`https://graph.threads.net/v1.0/${container.id}?fields=status,error_message&access_token=${encodeURIComponent(token)}`);
        const status = await statusResponse.json();
        if (status.status === "FINISHED") break;
        if (status.status === "ERROR") throw new Error(status.error_message || "画像を処理できませんでした。");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const published = await fetch(`${endpoint}/threads_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    const result = await published.json();
    if (!published.ok || !result.id) throw new Error(result.error?.message || "投稿を公開できませんでした。");
    return result;
  } finally {
    if (mediaId) setTimeout(() => media.delete(mediaId), 5 * 60 * 1000).unref();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
  for (const [id, item] of media) if (item.expiresAt < Date.now()) media.delete(id);

  if (url.pathname === "/health") return json(res, 200, { status: "ok" });
  if (url.pathname === "/") return html(res, 200, "<h1>ThreadFlow</h1><p class=\"ok\">OAuth・Threads投稿サービスは正常に稼働しています。</p>");

  if (url.pathname.startsWith("/api/media/") && req.method === "GET") {
    const item = media.get(url.pathname.slice("/api/media/".length));
    if (!item || item.expiresAt < Date.now()) return json(res, 404, { error: "Not found" });
    res.writeHead(200, { "content-type": item.contentType, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" });
    return res.end(item.bytes);
  }

  if (url.pathname === "/api/threads/status" && req.method === "GET") {
    if (!authorized(req)) return json(res, 401, { connected: false, error: "Unauthorized" });
    try {
      const accountKey = url.searchParams.get("account") || "ai_gal_mama";
      const account = await threadsMe(accountKey);
      return json(res, 200, { connected: true, accountKey, username: account.username });
    } catch (error) {
      return json(res, 503, { connected: false, error: error instanceof Error ? error.message : "接続を確認できませんでした。" });
    }
  }

  if (url.pathname === "/api/threads/publish" && req.method === "POST") {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized" });
    try {
      const body = await readJson(req);
      const result = await publishThreads(url.origin, body);
      return json(res, 201, { id: result.id });
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : "Threadsへ投稿できませんでした。" });
    }
  }

  if (url.pathname === "/api/auth/threads/deauthorize") return json(res, 200, { success: true });
  if (url.pathname === "/api/auth/threads/delete/status") return json(res, 200, { status: "completed" });
  if (url.pathname === "/api/auth/threads/delete") {
    const code = randomUUID();
    return json(res, 200, { url: `${url.origin}/api/auth/threads/delete/status?code=${code}`, confirmation_code: code });
  }
  if (url.pathname === "/api/auth/threads/callback") {
    const error = url.searchParams.get("error_message") || url.searchParams.get("error");
    if (error) return html(res, 400, `<h1>連携できませんでした</h1><p>${escapeHtml(error)}</p>`);
    if (!url.searchParams.get("code")) return html(res, 200, "<h1>Threads連携</h1><p class=\"ok\">OAuthコールバックURLは正常です。</p>");
    return html(res, 200, "<h1>認証コードを受信しました</h1><p class=\"ok\">Threadsとの認証が完了しました。この画面を閉じてThreadFlowへ戻ってください。</p>");
  }
  return json(res, 404, { error: "Not found" });
});

function escapeHtml(value) {
  return String(value).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
}

server.listen(port, "0.0.0.0", () => console.log(`ThreadFlow OAuth bridge listening on ${port}`));
