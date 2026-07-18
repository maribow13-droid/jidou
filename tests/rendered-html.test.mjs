import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the ThreadFlow dashboard instead of starter content", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  assert.match(page, /ThreadFlow/);
  assert.match(page, /無料自動運転/);
  assert.match(page, /ai_gal_mama/);
  assert.match(page, /ouchiwork_mari/);
  assert.match(layout, /ThreadFlow \| Threads予約投稿/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("keeps the free scheduler and daily safety limit", async () => {
  const [schedule, cron, gas] = await Promise.all([
    readFile(new URL("lib/schedule.ts", root), "utf8"),
    readFile(new URL("app/api/cron/publish/route.ts", root), "utf8"),
    readFile(new URL("gas/Code.gs", root), "utf8"),
  ]);

  assert.match(schedule, /Math\.min\(10/);
  assert.match(cron, /todayRows\.length >= dailyLimit/);
  assert.match(cron, /generatedPosts/);
  assert.match(gas, /everyMinutes\(15\)/);
  assert.match(gas, /投稿キュー/);
  assert.match(gas, /投稿ネタ/);
});
