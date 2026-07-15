import { desc } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { posts } from "../../../db/schema";

type SheetEnv = { GOOGLE_SHEETS_CSV_URL?: string };

function parseCsv(csv: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"' && quoted && csv[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && csv[i + 1] === "\n") i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row); return rows;
}

export async function POST() {
  try {
    const runtime = env as unknown as SheetEnv;
    if (!runtime.GOOGLE_SHEETS_CSV_URL) return Response.json({ error: "Google Sheetsの公開CSV URLが未設定です。" }, { status: 503 });
    const res = await fetch(runtime.GOOGLE_SHEETS_CSV_URL);
    if (!res.ok) throw new Error("スプレッドシートを読み込めませんでした。");
    const [header, ...body] = parseCsv(await res.text());
    const textIndex = header.findIndex((x) => /^(text|投稿文)$/i.test(x.trim()));
    const dateIndex = header.findIndex((x) => /^(scheduled_at|投稿日時)$/i.test(x.trim()));
    if (textIndex < 0 || dateIndex < 0) throw new Error("シートに「投稿文」と「投稿日時」の列が必要です。");
    const values = body.map((r) => ({ text: r[textIndex]?.trim(), scheduledAt: new Date(r[dateIndex]).toISOString(), status: "scheduled" as const, source: "google_sheets" })).filter((v) => v.text && !Number.isNaN(Date.parse(v.scheduledAt)));
    if (values.length) await getDb().insert(posts).values(values);
    const all = await getDb().select().from(posts).orderBy(desc(posts.createdAt)).limit(100);
    return Response.json({ imported: values.length, posts: all });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "同期に失敗しました。" }, { status: 500 });
  }
}
