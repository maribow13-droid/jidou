type Profile = { theme: string; audience: string; tone: string; rules: string };

const templates = [
  (theme: string, audience: string) =>
    `「${theme}、何から始めたらいい？」\n\nそんな${audience}へ。まずは今日できることを、ひとつだけ選んでみよう。完璧より、続けられる小ささが大切です。\n\nあなたは何から始めますか？`,
  (theme: string, audience: string) =>
    `${theme}は、全部を一気に変えなくて大丈夫。\n\n今日ひとつ試して、合わなければ調整する。それだけでも前進です。\n\n${audience}の毎日に、無理なく続く形が見つかりますように。`,
  (theme: string, audience: string) =>
    `今日のテーマは「${theme}」。\n\n続けるコツは3つ。\n・小さく始める\n・できたことを記録する\n・合わなければやり方を変える\n\n${audience}のみなさんは、どれから試してみたいですか？`,
  (theme: string, audience: string) =>
    `うまくいかない日があるのも普通。\n\n${theme}は、毎日完璧にこなすことより「また戻ってこられる形」にすることが大切です。\n\n${audience}のみなさんも、今日の自分に合うペースでいこう。`,
  (theme: string, audience: string) =>
    `保存メモ📝\n\n${theme}を続けるために意識したいこと。\n・一度に増やしすぎない\n・できたことを数える\n・自分に合わない方法は手放す\n\n${audience}に届けたい、シンプルな3つです。`,
  (theme: string, audience: string) =>
    `${audience}へ。\n\n「${theme}」について、今日は結果よりも一歩進めた自分を大切に。小さな積み重ねは、あとから振り返ったときにちゃんと力になります。`,
  (theme: string, audience: string) =>
    `${theme}で迷ったときは、やることを増やすより「今はやらないこと」をひとつ決めるのもおすすめ。\n\n${audience}の毎日に、少し余白が生まれますように。`,
  (theme: string, audience: string) =>
    `今日の小さな問い。\n\n${theme}について、今の自分が無理なく続けられることは何だろう？\n\n${audience}のみなさん、一緒に小さな一歩から始めてみませんか。`,
];

export async function generateAccountPost(profile: Profile) {
  const theme = clean(profile.theme) || "毎日を少しよくする工夫";
  const audience = clean(profile.audience) || "毎日をがんばっている方";
  const seed = Date.now() + Math.floor(Math.random() * 1_000_000);
  let text = templates[seed % templates.length](theme, audience);

  if (profile.tone.includes("短く")) text = `${theme}は、小さく始めて大丈夫。\n\n今日できることをひとつだけ。${audience}のみなさん、一緒に続けていこう。`;
  if (profile.tone.includes("やさしく")) text = text.replace(/です。/g, "ですよ。");
  if (profile.tone.includes("ユーモア")) text += "\n\n三日坊主でも、四日目に戻れば大丈夫。";
  if (/絵文字なし|絵文字は使わない/.test(profile.rules)) text = text.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "");
  if (/質問なし|問いかけなし/.test(profile.rules)) text = text.replace(/\n\n[^\n]*(?:？|\?)[^\n]*$/u, "");

  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 500);
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}
