import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { accountSettings } from "../../../db/schema";

const defaults = { id: 1, enabled: false, theme: "", audience: "", tone: "親しみやすく、誠実", rules: "", postsPerWeek: 1, postingTime: "08:00", imageMode: "auto", reviewMode: false, nextRunAt: null };

export async function GET() {
  const [settings] = await getDb().select().from(accountSettings).where(eq(accountSettings.id, 1));
  return Response.json({ settings: settings ?? defaults });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<typeof defaults>;
    if (!body.theme?.trim()) return Response.json({ error: "アカウントのテーマを入力してください。" }, { status: 400 });
    if (!body.audience?.trim()) return Response.json({ error: "届けたい相手を入力してください。" }, { status: 400 });
    const postsPerWeek = Math.min(10, Math.max(1, Number(body.postsPerWeek) || 1));
    const nextRunAt = body.enabled ? nextRun(body.postingTime ?? "08:00") : null;
    const values = { id: 1, enabled: !!body.enabled, theme: body.theme.trim(), audience: body.audience.trim(), tone: body.tone?.trim() || defaults.tone, rules: body.rules?.trim() || "", postsPerWeek, postingTime: body.postingTime ?? "08:00", imageMode: body.imageMode === "none" ? "none" : "auto", reviewMode: !!body.reviewMode, nextRunAt, updatedAt: new Date().toISOString() };
    const [settings] = await getDb().insert(accountSettings).values(values).onConflictDoUpdate({ target: accountSettings.id, set: values }).returning();
    return Response.json({ settings });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "設定を保存できませんでした。" }, { status: 500 }); }
}

function nextRun(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const now = new Date();
  const tokyo = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  tokyo.setHours(hour || 8, minute || 0, 0, 0);
  if (tokyo <= new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }))) tokyo.setDate(tokyo.getDate() + 1);
  return new Date(tokyo.getTime() - 9 * 60 * 60 * 1000).toISOString();
}
