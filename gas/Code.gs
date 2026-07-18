const THREADFLOW = {
  settingsSheet: "アカウント設定",
  profileSheet: "投稿プロフィール",
  queueSheet: "投稿キュー",
  ideasSheet: "投稿ネタ",
  defaultSiteUrl: "https://threadflow-jp-studio.maaaton.chatgpt.site",
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("ThreadFlow")
    .addItem("接続設定", "configureThreadFlow")
    .addItem("今すぐ同期・実行", "runThreadFlow")
    .addSeparator()
    .addItem("15分ごとの自動実行を開始", "installThreadFlowTrigger")
    .addItem("自動実行を停止", "removeThreadFlowTriggers")
    .addToUi();
}

function configureThreadFlow() {
  const ui = SpreadsheetApp.getUi();
  const properties = PropertiesService.getScriptProperties();
  const currentUrl = properties.getProperty("THREADFLOW_SITE_URL") || THREADFLOW.defaultSiteUrl;
  const urlPrompt = ui.prompt("ThreadFlowの接続先", `管理画面URLを入力してください。\n${currentUrl}`, ui.ButtonSet.OK_CANCEL);
  if (urlPrompt.getSelectedButton() !== ui.Button.OK) return;
  const siteUrl = (urlPrompt.getResponseText() || currentUrl).replace(/\/$/, "");
  const secretPrompt = ui.prompt("自動実行キー", "管理画面と同じ自動実行キーを入力してください。", ui.ButtonSet.OK_CANCEL);
  if (secretPrompt.getSelectedButton() !== ui.Button.OK || !secretPrompt.getResponseText().trim()) return;
  properties.setProperties({
    THREADFLOW_SITE_URL: siteUrl,
    THREADFLOW_CRON_SECRET: secretPrompt.getResponseText().trim(),
  });
  ui.alert("接続設定を保存しました。キーはシートのセルには保存されません。");
}

function installThreadFlowTrigger() {
  removeThreadFlowTriggers();
  ScriptApp.newTrigger("runThreadFlow").timeBased().everyMinutes(15).create();
  SpreadsheetApp.getUi().alert("15分ごとの自動実行を開始しました。");
}

function removeThreadFlowTriggers() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "runThreadFlow")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function runThreadFlow() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = spreadsheet.getSheetByName(THREADFLOW.settingsSheet);
  if (!settingsSheet) throw new Error("アカウント設定シートが見つかりません。");

  const properties = PropertiesService.getScriptProperties();
  const siteUrl = (properties.getProperty("THREADFLOW_SITE_URL") || THREADFLOW.defaultSiteUrl).replace(/\/$/, "");
  const secret = properties.getProperty("THREADFLOW_CRON_SECRET");
  if (!secret) throw new Error("ThreadFlowメニューの「接続設定」から自動実行キーを保存してください。");

  const profileMap = readProfileMap_(spreadsheet);
  const table = readTable_(settingsSheet);
  const profiles = table.rows
    .filter((row) => String(row[table.index["アカウントID"]] || "").trim())
    .map((row) => {
      const accountKey = String(row[table.index["アカウントID"]]).replace(/^@/, "").trim();
      const details = profileMap[accountKey] || {};
      const timeText = String(row[table.index["投稿時間帯"]] || "");
      const firstTime = (timeText.match(/\b\d{2}:\d{2}\b/) || ["20:30"])[0];
      return {
        accountKey,
        enabled: toBoolean_(row[table.index["自動投稿"]]),
        theme: details["アカウントテーマ"] || String(row[table.index["テーマ"]] || ""),
        audience: details["届けたい相手"] || "",
        tone: details["口調"] || String(row[table.index["口調"]] || ""),
        rules: details["投稿必須ルール"] || String(row[table.index["メモ"]] || ""),
        postsPerDay: Math.min(10, Math.max(1, Number(row[table.index["1日最大投稿数"]]) || 1)),
        postingTime: firstTime,
        imageMode: toBoolean_(row[table.index["画像付き投稿"]]) ? "auto" : "none",
        reviewMode: table.index["確認モード"] == null ? true : toBoolean_(row[table.index["確認モード"]]),
      };
    });

  let result;
  try {
    const response = UrlFetchApp.fetch(`${siteUrl}/api/cron/publish`, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${secret}` },
      payload: JSON.stringify({ profiles }),
      muteHttpExceptions: true,
    });
    result = JSON.parse(response.getContentText() || "{}");
    if (response.getResponseCode() >= 400) throw new Error(result.error || `接続エラー（${response.getResponseCode()}）`);
    appendGeneratedPosts_(spreadsheet, result.generatedPosts || [], profileMap);
    writeSyncStatus_(settingsSheet, table, `同期完了：生成${result.generated || 0}件／投稿${result.published || 0}件／エラー${(result.generatedFailed || 0) + (result.failed || 0)}件`);
  } catch (error) {
    writeSyncStatus_(settingsSheet, table, `エラー：${error.message || error}`);
    throw error;
  }
  return result;
}

function readProfileMap_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(THREADFLOW.profileSheet);
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  const result = {};
  values.slice(1).forEach((row) => {
    const accountKey = String(row[0] || "").replace(/^@/, "").trim();
    const section = String(row[1] || "").trim();
    if (!accountKey || !section) return;
    if (!result[accountKey]) result[accountKey] = {};
    result[accountKey][section] = String(row[2] || "").trim();
  });
  return result;
}

function readTable_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const index = {};
  headers.forEach((header, column) => { index[String(header).trim()] = column; });
  return { headers, index, rows: values.slice(1) };
}

function appendGeneratedPosts_(spreadsheet, posts, profileMap) {
  if (!posts.length) return;
  const queue = spreadsheet.getSheetByName(THREADFLOW.queueSheet);
  const ideas = spreadsheet.getSheetByName(THREADFLOW.ideasSheet);
  if (!queue || !ideas) throw new Error("投稿キューまたは投稿ネタシートが見つかりません。");

  const knownIds = new Set(queue.getLastRow() > 1 ? queue.getRange(2, 1, queue.getLastRow() - 1, 1).getDisplayValues().flat() : []);
  const queueRows = [];
  const ideaRows = [];
  posts.forEach((post) => {
    const managementId = `site-${post.id}`;
    if (knownIds.has(managementId)) return;
    const details = profileMap[post.accountKey] || {};
    const scheduled = new Date(post.scheduledAt);
    const published = post.publishedAt ? new Date(post.publishedAt) : "";
    const status = post.status === "published" ? "投稿済み" : post.status === "draft" ? "承認待ち" : "エラー";
    queueRows.push([
      managementId,
      `@${post.accountKey}`,
      String(details["アカウントテーマ"] || "").slice(0, 120),
      post.category || "自動生成",
      String(details["口調"] || "").slice(0, 100),
      post.text || "",
      post.imageUrl || "",
      scheduled,
      scheduled,
      status,
      published,
      post.threadsPostId || "",
      post.error || "",
    ]);
    const firstLine = String(post.text || "").split("\n")[0];
    ideaRows.push([
      `auto-${post.id}`,
      `@${post.accountKey}`,
      post.category || "自動生成",
      firstLine,
      "時間帯とアカウント設計に合わせた無料テンプレート",
      post.imageUrl ? "登録画像を使用" : "",
      true,
      scheduled,
      "自動生成・投稿キュー連携",
      true,
    ]);
  });

  if (queueRows.length) queue.getRange(queue.getLastRow() + 1, 1, queueRows.length, queueRows[0].length).setValues(queueRows);
  if (ideaRows.length) ideas.getRange(ideas.getLastRow() + 1, 1, ideaRows.length, ideaRows[0].length).setValues(ideaRows);
}

function writeSyncStatus_(sheet, table, message) {
  const now = new Date();
  const lastSyncColumn = table.index["最終同期"] == null ? 10 : table.index["最終同期"];
  const resultColumn = table.index["同期結果"] == null ? 11 : table.index["同期結果"];
  const rowCount = Math.max(1, table.rows.filter((row) => String(row[0] || "").trim()).length);
  sheet.getRange(2, lastSyncColumn + 1, rowCount, 1).setValues(Array.from({ length: rowCount }, () => [now]));
  sheet.getRange(2, resultColumn + 1, rowCount, 1).setValues(Array.from({ length: rowCount }, () => [message]));
}

function toBoolean_(value) {
  return value === true || String(value).toUpperCase() === "TRUE" || String(value) === "1";
}
