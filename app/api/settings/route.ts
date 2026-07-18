import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { accountSettings } from "../../../db/schema";
import { getThreadsAccount } from "../../../lib/accounts";
import { nextScheduledRun } from "../../../lib/schedule";

const defaults = { enabled: false, theme: "", audience: "", tone: "親しみやすく、誠実", rules: "", postsPerWeek: 1, postingTime: "08:00", imageMode: "auto", imageUrl: null as string | null, reviewMode: false, nextRunAt: null };

export async function GET(request: Request) {
  try {
    const account = getThreadsAccount(new URL(request.url).searchParams.get("account"));
    const [settings] = await getDb().select().from(accountSettings).where(eq(accountSettings.id, account.settingsId));
    return Response.json({ settings: settings ?? { ...defaults, id: account.settingsId, accountKey: account.key } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "設定を取得できませんでした。" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const account = getThreadsAccount(new URL(request.url).searchParams.get("account"));
    const body = await request.json() as Partial<typeof defaults>;
    if (!body.theme?.trim()) return Response.json({ error: "アカウントのテーマを入力してください。" }, { status: 400 });
    if (!body.audience?.trim()) return Response.json({ error: "届けたい相手を入力してください。" }, { status: 400 });
    const postsPerWeek = Math.min(10, Math.max(1, Number(body.postsPerWeek) || 1));
    const nextRunAt = body.enabled ? nextScheduledRun(postsPerWeek, new Date(), body.postingTime ?? "20:30") : null;
    const values = { id: account.settingsId, accountKey: account.key, enabled: !!body.enabled, theme: body.theme.trim(), audience: body.audience.trim(), tone: body.tone?.trim() || defaults.tone, rules: body.rules?.trim() || "", postsPerWeek, postingTime: body.postingTime ?? "08:00", imageMode: body.imageMode === "none" ? "none" : "auto", reviewMode: !!body.reviewMode, nextRunAt, updatedAt: new Date().toISOString() };
    const [settings] = await getDb().insert(accountSettings).values(values).onConflictDoUpdate({ target: accountSettings.id, set: values }).returning();
    return Response.json({ settings });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "設定を保存できませんでした。" }, { status: 500 }); }
}
