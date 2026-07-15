import { env } from "cloudflare:workers";

type AiEnv = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };
type Profile = { theme: string; audience: string; tone: string; rules: string };

export async function generateAccountPost(profile: Profile) {
  const runtime = env as unknown as AiEnv;
  if (!runtime.OPENAI_API_KEY) throw new Error("AI文章生成の接続設定が未完了です。");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${runtime.OPENAI_API_KEY}` }, body: JSON.stringify({ model: runtime.OPENAI_MODEL ?? "gpt-5-mini", instructions: "Threadsの日本語投稿を1件だけ作成してください。500文字以内。毎回違う切り口にし、誇張や根拠のない断定を避けます。説明や引用符は不要です。", input: `アカウントテーマ: ${profile.theme}\n届けたい相手: ${profile.audience}\n口調: ${profile.tone}\n守るルール: ${profile.rules || "特になし"}` }) });
  const data = await response.json() as { output_text?: string; error?: { message?: string } };
  if (!response.ok || !data.output_text) throw new Error(data.error?.message ?? "投稿を生成できませんでした。");
  return data.output_text.slice(0, 500);
}
