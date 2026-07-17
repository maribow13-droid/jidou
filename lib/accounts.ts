export const threadsAccounts = [
  { key: "ai_gal_mama", username: "ai_gal_mama", settingsId: 1 },
  { key: "ouchiwork_mari", username: "ouchiwork_mari", settingsId: 2 },
] as const;

export type AccountKey = (typeof threadsAccounts)[number]["key"];

export function getThreadsAccount(value: unknown) {
  const key = typeof value === "string" && value ? value : "ai_gal_mama";
  const account = threadsAccounts.find((candidate) => candidate.key === key);
  if (!account) throw new Error("選択されたThreadsアカウントは登録されていません。");
  return account;
}
