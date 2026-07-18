const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

const slotMap: Record<number, string[]> = {
  1: ["20:30"],
  2: ["08:00", "20:30"],
  3: ["08:00", "15:30", "20:30"],
  4: ["08:00", "12:30", "16:30", "20:30"],
  5: ["08:00", "11:30", "15:30", "20:30", "23:30"],
  6: ["08:00", "11:30", "15:30", "16:30", "20:30", "23:30"],
  7: ["08:00", "11:30", "12:30", "15:30", "16:30", "20:30", "23:30"],
  8: ["08:00", "08:45", "11:30", "12:30", "15:30", "16:30", "20:30", "23:30"],
  9: ["00:30", "08:00", "08:45", "11:30", "12:30", "15:30", "16:30", "20:30", "23:30"],
  10: ["00:30", "08:00", "08:45", "11:30", "12:30", "15:30", "16:30", "20:30", "21:30", "23:30"],
};

export function dailySlots(postsPerDay: number, preferredTime = "20:30") {
  const count = Math.min(10, Math.max(1, Math.floor(postsPerDay || 1)));
  if (count === 1 && /^\d{2}:\d{2}$/.test(preferredTime)) return [preferredTime];
  return slotMap[count];
}

export function nextScheduledRun(postsPerDay: number, from = new Date(), preferredTime = "20:30") {
  const slots = dailySlots(postsPerDay, preferredTime);
  const tokyoNow = new Date(from.getTime() + TOKYO_OFFSET_MS);
  const year = tokyoNow.getUTCFullYear();
  const month = tokyoNow.getUTCMonth();
  const day = tokyoNow.getUTCDate();

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    for (const slot of slots) {
      const [hour, minute] = slot.split(":").map(Number);
      const candidate = new Date(Date.UTC(year, month, day + dayOffset, hour - 9, minute, 0, 0));
      if (candidate.getTime() > from.getTime() + 30_000) return candidate.toISOString();
    }
  }

  throw new Error("次回投稿時刻を計算できませんでした。");
}

export function tokyoDayStartSql(from = new Date()) {
  const tokyo = new Date(from.getTime() + TOKYO_OFFSET_MS);
  const utc = new Date(Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate(), -9, 0, 0, 0));
  return utc.toISOString().slice(0, 19).replace("T", " ");
}

export function tokyoHour(from = new Date()) {
  return new Date(from.getTime() + TOKYO_OFFSET_MS).getUTCHours();
}
