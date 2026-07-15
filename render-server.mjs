import http from "node:http";
import { URL } from "node:url";

const port = Number(process.env.PORT || 10000);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ThreadFlow OAuth</title><style>body{font-family:system-ui,sans-serif;background:#f7f6f3;color:#24232a;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#fff;border:1px solid #e7e4df;border-radius:18px;padding:36px;max-width:560px;box-shadow:0 12px 40px #25202a12}h1{font-family:Georgia,serif;margin-top:0}.ok{color:#4b9c6b}code{background:#f0eef9;padding:3px 6px;border-radius:5px}</style><main class="card">${body}</main></html>`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health") return json(res, 200, { status: "ok" });
  if (url.pathname === "/") return html(res, 200, "<h1>ThreadFlow</h1><p class=\"ok\">OAuth受け口は正常に稼働しています。</p>");
  if (url.pathname === "/api/auth/threads/deauthorize") return json(res, 200, { success: true });
  if (url.pathname === "/api/auth/threads/delete/status") return json(res, 200, { status: "completed" });
  if (url.pathname === "/api/auth/threads/delete") {
    const code = crypto.randomUUID();
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

function escapeHtml(value) { return String(value).replace(/[&<>\"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;" })[c]); }
server.listen(port, "0.0.0.0", () => console.log(`ThreadFlow OAuth bridge listening on ${port}`));
