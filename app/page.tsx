"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Post = {
  id: number;
  text: string;
  scheduledAt: string;
  status: "draft" | "scheduled" | "published" | "failed";
  imageUrl?: string | null;
  source?: string;
};

type Settings = {
  enabled: boolean;
  theme: string;
  audience: string;
  tone: string;
  rules: string;
  postsPerWeek: number;
  postingTime: string;
  imageMode: string;
  imageUrl?: string | null;
  reviewMode: boolean;
  nextRunAt?: string | null;
};

type Connection = {
  connected: boolean;
  accountKey?: string;
  username?: string;
  error?: string;
};

type AccountKey = "ai_gal_mama" | "ouchiwork_mari";

const accountOptions: Array<{ key: AccountKey; username: string; description: string }> = [
  { key: "ai_gal_mama", username: "ai_gal_mama", description: "ギャルママ発信" },
  { key: "ouchiwork_mari", username: "ouchiwork_mari", description: "おうちワーク発信" },
];

const initial: Settings = {
  enabled: false,
  theme: "",
  audience: "",
  tone: "親しみやすく、誠実",
  rules: "",
  postsPerWeek: 1,
  postingTime: "08:00",
  imageMode: "auto",
  reviewMode: false,
};

const labels = {
  draft: "確認待ち",
  scheduled: "予約済み",
  published: "投稿済み",
  failed: "エラー",
};

export default function Home() {
  const [accountKey, setAccountKey] = useState<AccountKey>("ai_gal_mama");
  const [settings, setSettings] = useState(initial);
  const [posts, setPosts] = useState<Post[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [testText, setTestText] = useState("");
  const [testImage, setTestImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const activeAccount = accountOptions.find((account) => account.key === accountKey) ?? accountOptions[0];

  async function refreshPosts(key: AccountKey = accountKey) {
    const response = await fetch(`/api/posts?account=${encodeURIComponent(key)}`);
    const data = await response.json();
    if (data.posts) setPosts(data.posts);
  }

  useEffect(() => {
    let active = true;
    setSettings(initial);
    setPosts([]);
    setConnection(null);
    setNotice("");
    Promise.all([
      fetch(`/api/settings?account=${encodeURIComponent(accountKey)}`).then((response) => response.json()),
      fetch(`/api/posts?account=${encodeURIComponent(accountKey)}`).then((response) => response.json()),
      fetch(`/api/threads/status?account=${encodeURIComponent(accountKey)}`).then((response) => response.json()),
    ])
      .then(([settingsData, postsData, connectionData]) => {
        if (!active) return;
        if (settingsData.settings) setSettings(settingsData.settings);
        if (postsData.posts) setPosts(postsData.posts);
        setConnection(connectionData);
      })
      .catch(() => {
        if (active) setConnection({ connected: false, error: "接続状態を確認できませんでした。" });
      });
    return () => { active = false; };
  }, [accountKey]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const counts = useMemo(
    () => ({
      published: posts.filter((post) => post.status === "published").length,
      drafts: posts.filter((post) => post.status === "draft").length,
      failed: posts.filter((post) => post.status === "failed").length,
    }),
    [posts],
  );

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setTestImage(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function save(enabled = settings.enabled) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/settings?account=${encodeURIComponent(accountKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSettings(data.settings);
      setNotice(enabled ? "無料の自動運転を開始しました。次の投稿から料金なしで文章を作成します。" : "設定を保存しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function publishTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!testText.trim()) {
      setNotice("テスト投稿の文章を入力してください。");
      return;
    }
    setTestBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("text", testText.trim());
      form.set("scheduledAt", new Date().toISOString());
      form.set("publishNow", "true");
      form.set("accountKey", accountKey);
      if (testImage) form.set("image", testImage);

      const response = await fetch("/api/posts", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "投稿できませんでした。");
      setTestText("");
      setTestImage(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setNotice("Threadsへのテスト投稿が完了しました。");
      await refreshPosts(accountKey);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "投稿できませんでした。");
    } finally {
      setTestBusy(false);
    }
  }

  async function uploadAutoImage(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0];
    if (!image) return;
    setImageBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("accountKey", accountKey);
      form.set("image", image);
      const response = await fetch("/api/settings/image", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "画像を登録できませんでした。");
      setSettings(data.settings);
      setNotice("自動投稿で使う画像を登録しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "画像を登録できませんでした。");
    } finally {
      setImageBusy(false);
      event.target.value = "";
    }
  }

  async function removeAutoImage() {
    setImageBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/settings/image?account=${encodeURIComponent(accountKey)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "画像を削除できませんでした。");
      setSettings(data.settings);
      setNotice("自動投稿の登録画像を削除しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "画像を削除できませんでした。");
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>ThreadFlow</span></div>
        <nav aria-label="メニュー">
          <a className="active" href="#automation"><span>✦</span>無料自動運転</a>
          <a href="#test-post"><span>↗</span>テスト投稿</a>
          <a href="#history"><span>◷</span>投稿履歴</a>
          <a href="#settings"><span>⚙</span>連携設定</a>
        </nav>
        <div className="account-card">
          <span className="avatar">TF</span>
          <div>
            <strong>{connection?.username ? `@${connection.username}` : `@${activeAccount.username}`}</strong>
            <small className={connection?.connected ? "connected" : "disconnected"}><i />{connection === null ? "確認中" : connection.connected ? "接続済み" : "未接続"}</small>
          </div>
        </div>
      </aside>

      <section className="content" id="automation">
        <header>
          <div>
            <p className="eyebrow">FREE AUTOPILOT</p>
            <h1>追加料金なしで、自動投稿。</h1>
            <p>テーマと口調をもとに、無料テンプレートが文章を組み立てて投稿します。</p>
          </div>
          <div className={`autopilot-state ${settings.enabled ? "on" : ""}`}><i /><span>{settings.enabled ? "自動運転中" : "停止中"}</span></div>
        </header>

        <section className="account-switcher" aria-label="操作するThreadsアカウント">
          <div>
            <p className="eyebrow">THREADS ACCOUNTS</p>
            <strong>操作するアカウント</strong>
          </div>
          <div className="account-switcher-options">
            {accountOptions.map((account) => (
              <button
                className={account.key === accountKey ? "selected" : ""}
                key={account.key}
                onClick={() => setAccountKey(account.key)}
                type="button"
              >
                <span className="account-dot" />
                <span><strong>@{account.username}</strong><small>{account.description}</small></span>
                {account.key === accountKey && <em>選択中</em>}
              </button>
            ))}
          </div>
        </section>

        {notice && <div className="notice" role="status">{notice}<button aria-label="お知らせを閉じる" onClick={() => setNotice("")}>×</button></div>}

        <section className={`connection-banner ${connection?.connected ? "is-connected" : ""}`} id="settings">
          <div className="connection-icon">{connection?.connected ? "✓" : "…"}</div>
          <div>
            <strong>{connection === null ? `@${activeAccount.username} の接続を確認しています` : connection.connected ? `@${connection.username ?? activeAccount.username} と連携済み` : `@${activeAccount.username} の接続設定が必要です`}</strong>
            <small>{connection?.connected ? "管理画面から投稿と自動運転を利用できます。" : connection?.error ?? "秘密情報を設定すると投稿できるようになります。"}</small>
          </div>
          <span className="api-chip">Threads API</span>
        </section>

        <section className="panel test-panel" id="test-post">
          <div className="panel-title">
            <div><p className="eyebrow">CONNECTION TEST</p><h2>@{activeAccount.username} へテスト投稿</h2><p>文章だけでも、画像付きでも投稿できます。選択中のアカウントに投稿されます。</p></div>
            <span className="step-badge">TEST</span>
          </div>
          <form className="test-composer" onSubmit={publishTest}>
            <label className="test-copy">
              <span>投稿内容 <small>{testText.length}/500</small></span>
              <textarea maxLength={500} value={testText} onChange={(event) => setTestText(event.target.value)} placeholder="例：ThreadFlowからのテスト投稿です。今日から発信を少しずつ続けていきます。" />
            </label>
            <label className={`test-upload ${previewUrl ? "has-preview" : ""}`}>
              {previewUrl ? <img src={previewUrl} alt="投稿画像のプレビュー" /> : <><b>＋</b><strong>画像を追加</strong><small>JPG・PNG・WEBP／10MBまで</small></>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
            </label>
            <div className="test-actions">
              {testImage && <button className="remove-image" type="button" onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setTestImage(null); }}>画像を外す</button>}
              <button className="primary test-publish" disabled={testBusy || !connection?.connected} type="submit">{testBusy ? "投稿しています…" : "Threadsへ今すぐ投稿 →"}</button>
            </div>
          </form>
        </section>

        <div className="autopilot-grid">
          <section className="panel profile-panel">
            <div className="panel-title"><div><p className="eyebrow">ACCOUNT PROFILE</p><h2>発信の設計図</h2><p>無料テンプレートに、アカウントの軸を教えてください。</p></div><span className="step-badge">STEP 1</span></div>
            <div className="form-grid">
              <label className="wide"><span>アカウントのテーマ</span><textarea value={settings.theme} onChange={(event) => update("theme", event.target.value)} placeholder="例：40代からの無理をしない健康習慣。食事・睡眠・軽い運動を、実体験を交えて発信する。" /></label>
              <label><span>届けたい相手</span><input value={settings.audience} onChange={(event) => update("audience", event.target.value)} placeholder="例：忙しくて健康が後回しの40〜50代" /></label>
              <label><span>口調・キャラクター</span><select value={settings.tone} onChange={(event) => update("tone", event.target.value)}><option>親しみやすく、誠実</option><option>専門家らしく、わかりやすい</option><option>短く、テンポよく</option><option>やさしく、背中を押す</option><option>ユーモアを少し入れる</option></select></label>
              <label className="wide"><span>必ず守るルール・避けたい表現</span><input value={settings.rules} onChange={(event) => update("rules", event.target.value)} placeholder="例：断定しない、煽らない、絵文字は1つまで、売り込み感を出さない" /></label>
            </div>
          </section>
          <aside className="panel voice-preview">
            <p className="eyebrow">VOICE PREVIEW</p><h2>自動投稿に反映する内容</h2>
            <div className="quote"><span>“</span><p>{settings.theme || "テーマを入力すると、無料テンプレートが発信内容に反映します。"}</p></div>
            <dl><div><dt>読者</dt><dd>{settings.audience || "未設定"}</dd></div><div><dt>話し方</dt><dd>{settings.tone}</dd></div></dl>
            <button className="secondary" onClick={() => save(false)} disabled={busy}>設計図を保存</button>
          </aside>
        </div>

        <section className="panel schedule-panel">
          <div className="panel-title"><div><p className="eyebrow">AUTOMATION</p><h2>投稿ペースを決める</h2></div><span className="step-badge">STEP 2</span></div>
          <div className="automation-options">
            <label><span>1日の投稿数（最大10件）</span><select value={settings.postsPerWeek} onChange={(event) => update("postsPerWeek", Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>1日 {index + 1} 投稿</option>)}</select></label>
            <label><span>最初の投稿時間</span><input type="time" value={settings.postingTime} onChange={(event) => update("postingTime", event.target.value)} /></label>
            <label><span>画像</span><select value={settings.imageMode} onChange={(event) => update("imageMode", event.target.value)}><option value="auto">登録画像を毎回使う</option><option value="none">画像なし</option></select></label>
            <label className="review-toggle"><span>投稿前の確認</span><button className={settings.reviewMode ? "selected" : ""} onClick={() => update("reviewMode", !settings.reviewMode)} type="button"><i />{settings.reviewMode ? "確認してから投稿" : "完全自動で投稿"}</button></label>
          </div>
          {settings.imageMode === "auto" && (
            <div className="auto-image-box">
              {settings.imageUrl ? <img src={settings.imageUrl} alt="自動投稿で使用する登録画像" /> : <div><span>＋</span><strong>自動投稿用の画像を1枚登録</strong><small>同じ画像を繰り返し使います。あとで差し替えできます。</small></div>}
              <div className="auto-image-actions">
                <label className="secondary">{imageBusy ? "処理中…" : settings.imageUrl ? "画像を差し替える" : "画像を選ぶ"}<input disabled={imageBusy} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAutoImage} /></label>
                {settings.imageUrl && <button className="remove-image" disabled={imageBusy} type="button" onClick={removeAutoImage}>画像を削除</button>}
              </div>
            </div>
          )}
          <div className="launch-row">
            <div><strong>{settings.enabled ? `1日${settings.postsPerWeek}件のペースで無料自動発信中` : "準備ができたら、無料自動運転を開始"}</strong><small>{settings.reviewMode ? "無料テンプレートが下書きを作り、あなたの確認後に投稿します。" : `無料テンプレートが文章を作り、約${Math.max(1, Math.floor(24 / settings.postsPerWeek))}時間おきにThreadsへ投稿します。`}</small></div>
            <button className={settings.enabled ? "stop-button" : "primary launch"} onClick={() => save(!settings.enabled)} disabled={busy || !connection?.connected}>{busy ? "設定中…" : settings.enabled ? "自動運転を停止" : "無料自動運転を開始 →"}</button>
          </div>
        </section>

        <div className="stats">
          <article><span className="stat-icon mint">✓</span><div><small>自動投稿済み</small><strong>{counts.published}</strong><em>件</em></div></article>
          <article><span className="stat-icon violet">◷</span><div><small>確認待ち</small><strong>{counts.drafts}</strong><em>件</em></div></article>
          <article><span className="stat-icon coral">!</span><div><small>要確認</small><strong>{counts.failed}</strong><em>件</em></div></article>
        </div>

        <section className="panel history-panel" id="history">
          <div className="panel-title"><div><p className="eyebrow">RECENT POSTS</p><h2>自動作成した投稿</h2></div></div>
          <div className="post-table">
            {posts.slice(0, 6).map((post) => <article key={post.id}><span className={`status ${post.status}`}>{labels[post.status]}</span><p>{post.text}</p><time>{new Date(post.scheduledAt).toLocaleString("ja-JP")}</time></article>)}
            {!posts.length && <div className="empty"><span>✦</span><p>テスト投稿や自動運転を始めると、ここに投稿が並びます。</p></div>}
          </div>
        </section>
        <footer><span><i /> Threads API 接続管理</span><span>タイムゾーン：Asia/Tokyo</span></footer>
      </section>
    </main>
  );
}
