"use client";

import { useEffect, useMemo, useState } from "react";

type Post = { id:number; text:string; scheduledAt:string; status:"draft"|"scheduled"|"published"|"failed"; imageUrl?:string|null; source?:string };
type Settings = { enabled:boolean; theme:string; audience:string; tone:string; rules:string; postsPerWeek:number; postingTime:string; imageMode:string; reviewMode:boolean; nextRunAt?:string|null };
const initial: Settings = { enabled:false, theme:"", audience:"", tone:"親しみやすく、誠実", rules:"", postsPerWeek:1, postingTime:"08:00", imageMode:"auto", reviewMode:false };
const labels = { draft:"確認待ち", scheduled:"予約済み", published:"投稿済み", failed:"エラー" };

export default function Home() {
  const [settings,setSettings]=useState(initial); const [posts,setPosts]=useState<Post[]>([]); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState("");
  useEffect(()=>{ Promise.all([fetch("/api/settings").then(r=>r.json()),fetch("/api/posts").then(r=>r.json())]).then(([s,p])=>{if(s.settings)setSettings(s.settings);if(p.posts)setPosts(p.posts)}).catch(()=>{}) },[]);
  const counts=useMemo(()=>({published:posts.filter(p=>p.status==="published").length,drafts:posts.filter(p=>p.status==="draft").length,failed:posts.filter(p=>p.status==="failed").length}),[posts]);
  function update<K extends keyof Settings>(key:K,value:Settings[K]){setSettings(s=>({...s,[key]:value}))}
  async function save(enabled=settings.enabled){setBusy(true);setNotice("");try{const res=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...settings,enabled})});const data=await res.json();if(!res.ok)throw new Error(data.error);setSettings(data.settings);setNotice(enabled?"自動運転を開始しました。次の投稿からAIにおまかせできます。":"設定を保存しました。") }catch(e){setNotice(e instanceof Error?e.message:"保存できませんでした。")}finally{setBusy(false)}}

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">S</span><span>ThreadFlow</span></div><nav aria-label="メニュー"><a className="active" href="#automation"><span>✦</span>AI自動運転</a><a href="#history"><span>◷</span>投稿履歴</a><a href="#settings"><span>⚙</span>連携設定</a></nav><div className="account-card"><span className="avatar">TF</span><div><strong>Threadsアカウント</strong><small><i /> 接続設定</small></div></div></aside>
    <section className="content" id="automation">
      <header><div><p className="eyebrow">AI AUTOPILOT</p><h1>あなたらしい発信を、AIにまかせる。</h1><p>テーマと口調を一度決めれば、企画・作成・投稿まで自動で続きます。</p></div><div className={`autopilot-state ${settings.enabled?"on":""}`}><i/><span>{settings.enabled?"自動運転中":"停止中"}</span></div></header>
      {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
      <div className="autopilot-grid">
        <section className="panel profile-panel">
          <div className="panel-title"><div><p className="eyebrow">ACCOUNT PROFILE</p><h2>発信の設計図</h2><p>AIが迷わないように、アカウントの軸を教えてください。</p></div><span className="step-badge">STEP 1</span></div>
          <div className="form-grid">
            <label className="wide"><span>アカウントのテーマ</span><textarea value={settings.theme} onChange={e=>update("theme",e.target.value)} placeholder="例：40代からの無理をしない健康習慣。食事・睡眠・軽い運動を、実体験を交えて発信する。"/></label>
            <label><span>届けたい相手</span><input value={settings.audience} onChange={e=>update("audience",e.target.value)} placeholder="例：忙しくて健康が後回しの40〜50代"/></label>
            <label><span>口調・キャラクター</span><select value={settings.tone} onChange={e=>update("tone",e.target.value)}><option>親しみやすく、誠実</option><option>専門家らしく、わかりやすい</option><option>短く、テンポよく</option><option>やさしく、背中を押す</option><option>ユーモアを少し入れる</option></select></label>
            <label className="wide"><span>必ず守るルール・避けたい表現</span><input value={settings.rules} onChange={e=>update("rules",e.target.value)} placeholder="例：断定しない、煽らない、絵文字は1つまで、売り込み感を出さない"/></label>
          </div>
        </section>
        <aside className="panel voice-preview"><p className="eyebrow">VOICE PREVIEW</p><h2>AIが理解しているあなた</h2><div className="quote"><span>“</span><p>{settings.theme||"テーマを入力すると、AIがここに発信方針をまとめます。"}</p></div><dl><div><dt>読者</dt><dd>{settings.audience||"未設定"}</dd></div><div><dt>話し方</dt><dd>{settings.tone}</dd></div></dl><button className="secondary" onClick={()=>save(false)} disabled={busy}>設計図を保存</button></aside>
      </div>

      <section className="panel schedule-panel">
        <div className="panel-title"><div><p className="eyebrow">AUTOMATION</p><h2>投稿ペースを決める</h2></div><span className="step-badge">STEP 2</span></div>
        <div className="automation-options">
          <label><span>1日の投稿数（最大10件）</span><select value={settings.postsPerWeek} onChange={e=>update("postsPerWeek",Number(e.target.value))}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>1日 {i+1} 投稿</option>)}</select></label>
          <label><span>投稿時間</span><input type="time" value={settings.postingTime} onChange={e=>update("postingTime",e.target.value)}/></label>
          <label><span>画像</span><select value={settings.imageMode} onChange={e=>update("imageMode",e.target.value)}><option value="auto">AIが必要な時だけ作成</option><option value="none">画像なし</option></select></label>
          <label className="review-toggle"><span>投稿前の確認</span><button className={settings.reviewMode?"selected":""} onClick={()=>update("reviewMode",!settings.reviewMode)} type="button"><i/>{settings.reviewMode?"確認してから投稿":"完全自動で投稿"}</button></label>
        </div>
        <div className="launch-row"><div><strong>{settings.enabled?`1日${settings.postsPerWeek}件のペースで自動発信中`:"準備ができたら、自動運転を開始"}</strong><small>{settings.reviewMode?"AIが下書きを作り、あなたの確認後に投稿します。":`AIが内容を考え、約${Math.max(1,Math.floor(24/settings.postsPerWeek))}時間おきにThreadsへ投稿します。`}</small></div><button className={settings.enabled?"stop-button":"primary launch"} onClick={()=>save(!settings.enabled)} disabled={busy}>{busy?"設定中…":settings.enabled?"自動運転を停止":"AI自動運転を開始 →"}</button></div>
      </section>

      <div className="stats"><article><span className="stat-icon mint">✓</span><div><small>自動投稿済み</small><strong>{counts.published}</strong><em>件</em></div></article><article><span className="stat-icon violet">◷</span><div><small>確認待ち</small><strong>{counts.drafts}</strong><em>件</em></div></article><article><span className="stat-icon coral">!</span><div><small>要確認</small><strong>{counts.failed}</strong><em>件</em></div></article></div>
      <section className="panel history-panel" id="history"><div className="panel-title"><div><p className="eyebrow">RECENT POSTS</p><h2>AIが作成した投稿</h2></div></div><div className="post-table">{posts.slice(0,6).map(p=><article key={p.id}><span className={`status ${p.status}`}>{labels[p.status]}</span><p>{p.text}</p><time>{new Date(p.scheduledAt).toLocaleString("ja-JP")}</time></article>)}{!posts.length&&<div className="empty"><span>✦</span><p>自動運転を始めると、ここに投稿が並びます。</p></div>}</div></section>
      <footer id="settings"><span><i/> Threads API 接続設定</span><span>タイムゾーン：Asia/Tokyo</span></footer>
    </section>
  </main>
}
