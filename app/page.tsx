"use client";

import { useEffect, useMemo, useState } from "react";

type Post = {
  id: number;
  text: string;
  scheduledAt: string;
  status: "draft" | "scheduled" | "published" | "failed";
  imageUrl?: string | null;
  publishedAt?: string | null;
  error?: string | null;
};

const seed: Post[] = [
  { id: 1, text: "朝の10分で、今日いちばん大切なことを一つだけ決める。小さな習慣が、大きな前進をつくります。", scheduledAt: "2026-07-16T08:00", status: "scheduled", imageUrl: null },
  { id: 2, text: "新しい制作ノートを公開しました。試行錯誤の過程も、少しずつ共有していきます。", scheduledAt: "2026-07-15T18:30", status: "draft", imageUrl: null },
];

const statusLabel = { draft: "下書き", scheduled: "予約済み", published: "投稿済み", failed: "エラー" };

export default function Home() {
  const [posts, setPosts] = useState<Post[]>(seed);
  const [text, setText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [tone, setTone] = useState("親しみやすい");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/posts").then((r) => r.ok ? r.json() : null).then((data) => {
      if (data?.posts?.length) setPosts(data.posts);
    }).catch(() => {});
  }, []);

  const counts = useMemo(() => ({
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
    failed: posts.filter((p) => p.status === "failed").length,
  }), [posts]);

  function pickImage(file?: File) {
    if (!file) return;
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function generate() {
    if (!topic.trim()) return setNotice("AIに伝えるテーマを入力してください。");
    setBusy("generate"); setNotice("");
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, tone }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setText(data.text);
      setNotice("投稿案を作成しました。内容を確認して予約してください。");
    } catch (e) { setNotice(e instanceof Error ? e.message : "生成に失敗しました。"); }
    finally { setBusy(""); }
  }

  async function savePost(publishNow = false) {
    if (!text.trim()) return setNotice("投稿文を入力してください。");
    if (!publishNow && !scheduledAt) return setNotice("投稿日時を選択してください。");
    setBusy(publishNow ? "publish" : "save"); setNotice("");
    try {
      const form = new FormData();
      form.set("text", text.trim());
      form.set("scheduledAt", publishNow ? new Date().toISOString() : new Date(scheduledAt).toISOString());
      form.set("publishNow", String(publishNow));
      if (image) form.set("image", image);
      const res = await fetch("/api/posts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPosts((current) => [data.post, ...current]);
      setText(""); setScheduledAt(""); setImage(null); setImagePreview("");
      setNotice(publishNow ? "Threadsへ投稿しました。" : "予約投稿を保存しました。");
    } catch (e) { setNotice(e instanceof Error ? e.message : "保存に失敗しました。"); }
    finally { setBusy(""); }
  }

  async function syncSheet() {
    setBusy("sheet"); setNotice("");
    try {
      const res = await fetch("/api/sheets", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPosts(data.posts);
      setNotice(`${data.imported}件をスプレッドシートから取り込みました。`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "同期に失敗しました。"); }
    finally { setBusy(""); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>ThreadFlow</span></div>
        <nav aria-label="メインメニュー">
          <a className="active" href="#dashboard"><span>⌂</span>ダッシュボード</a>
          <a href="#compose"><span>＋</span>新規投稿</a>
          <a href="#schedule"><span>◷</span>予約一覧</a>
          <a href="#history"><span>✓</span>投稿履歴</a>
          <a href="#settings"><span>⚙</span>連携設定</a>
        </nav>
        <div className="account-card"><span className="avatar">TF</span><div><strong>Threadsアカウント</strong><small><i /> 接続済み</small></div></div>
      </aside>

      <section className="content" id="dashboard">
        <header><div><p className="eyebrow">CONTENT STUDIO</p><h1>おかえりなさい</h1><p>次の投稿を、無理なく整えて届けましょう。</p></div><button className="ghost" onClick={syncSheet} disabled={busy === "sheet"}>↻ {busy === "sheet" ? "同期中…" : "Sheetsと同期"}</button></header>

        <div className="stats">
          <article><span className="stat-icon violet">◷</span><div><small>予約中</small><strong>{counts.scheduled}</strong><em>件</em></div></article>
          <article><span className="stat-icon mint">✓</span><div><small>今月の投稿</small><strong>{counts.published}</strong><em>件</em></div></article>
          <article><span className="stat-icon coral">!</span><div><small>要確認</small><strong>{counts.failed}</strong><em>件</em></div></article>
        </div>

        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="閉じる">×</button></div>}

        <div className="workspace-grid" id="compose">
          <section className="panel composer">
            <div className="panel-title"><div><p className="eyebrow">NEW POST</p><h2>新しい投稿をつくる</h2></div><span className="threads-chip">@ Threads</span></div>

            <div className="ai-box">
              <div className="spark">✦</div><div className="ai-fields"><label>AIで投稿案をつくる</label><div className="ai-row"><input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例：朝の習慣について、前向きな投稿" /><select value={tone} onChange={(e) => setTone(e.target.value)}><option>親しみやすい</option><option>専門的</option><option>簡潔</option><option>熱意のある</option></select><button onClick={generate} disabled={busy === "generate"}>{busy === "generate" ? "生成中…" : "生成"}</button></div></div>
            </div>

            <label className="field-label" htmlFor="postText">投稿内容 <span>{text.length} / 500</span></label>
            <textarea id="postText" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="伝えたいことを書いてください…" />

            <div className="media-schedule">
              <label className={`upload ${imagePreview ? "has-image" : ""}`}>
                {imagePreview ? <img src={imagePreview} alt="投稿画像のプレビュー" /> : <><span>▧</span><strong>画像を追加</strong><small>JPG・PNG・WEBP（最大10MB）</small></>}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pickImage(e.target.files?.[0])} />
              </label>
              <div className="schedule-field"><label htmlFor="scheduleAt">投稿日時</label><input id="scheduleAt" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /><small>タイムゾーン：Asia/Tokyo</small></div>
            </div>

            <div className="actions"><button className="secondary" onClick={() => savePost(true)} disabled={!!busy}>{busy === "publish" ? "投稿中…" : "今すぐ投稿"}</button><button className="primary" onClick={() => savePost(false)} disabled={!!busy}>{busy === "save" ? "保存中…" : "予約する →"}</button></div>
          </section>

          <aside className="panel upcoming" id="schedule">
            <div className="panel-title"><div><p className="eyebrow">QUEUE</p><h2>次の予約</h2></div><button aria-label="その他">•••</button></div>
            <div className="queue-list">
              {posts.slice(0, 5).map((post) => <article key={post.id}><div className="queue-meta"><span className={`status ${post.status}`}>{statusLabel[post.status]}</span><time>{new Date(post.scheduledAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><p>{post.text}</p>{post.imageUrl && <span className="image-badge">▧ 画像付き</span>}</article>)}
              {!posts.length && <div className="empty"><span>◷</span><p>予約投稿はまだありません</p></div>}
            </div>
            <a className="view-all" href="#history">すべての投稿を見る →</a>
          </aside>
        </div>

        <footer id="settings"><span><i /> Threads API 接続済み</span><span>最終同期：たった今</span></footer>
      </section>
    </main>
  );
}
