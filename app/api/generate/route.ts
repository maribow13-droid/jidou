import { env } from "cloudflare:workers";

type AiEnv = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };

export async function POST(request: Request) {
  try {
    const { topic, tone } = await request.json() as { topic?: string; tone?: string };
    if (!topic?.trim()) return Response.json({ error: "テーマを入力してください。" }, { status: 400 });
    const runtime = env as unknown as AiEnv;
    if (!runtime.OPENAI_API_KEY) return Response.json({ error: "AI文章生成の接続設定が未完了です。" }, { status: 503 });
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${runtime.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: runtime.OPENAI_MODEL ?? "gpt-5-mini",
        instructions: "あなたは日本語SNS編集者です。Threads向けに、自然で誠実な500文字以内の投稿を1案だけ作ってください。ハッシュタグは最大2つ。説明や引用符は不要です。",
        input: `テーマ: ${topic.trim()}\nトーン: ${tone ?? "親しみやすい"}`,
      }),
    });
    const data = await res.json() as { output_text?: string; error?: { message?: string } };
    if (!res.ok || !data.output_text) throw new Error(data.error?.message ?? "投稿案を生成できませんでした。");
    return Response.json({ text: data.output_text.slice(0, 500) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "生成に失敗しました。" }, { status: 500 });
  }
}
