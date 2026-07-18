import { generateAccountPost } from "../../../lib/generate-post";

export async function POST(request: Request) {
  try {
    const { topic, tone } = await request.json() as { topic?: string; tone?: string };
    if (!topic?.trim()) return Response.json({ error: "テーマを入力してください。" }, { status: 400 });
    const text = await generateAccountPost({
      theme: topic.trim(),
      audience: "Threadsで情報を探している方",
      tone: tone ?? "親しみやすく、誠実",
      rules: "",
    });
    return Response.json({ text });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "作成に失敗しました。" }, { status: 500 });
  }
}
