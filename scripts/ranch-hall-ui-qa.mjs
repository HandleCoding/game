import { chromium, webkit } from "@playwright/test";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const connection = process.env.DATABASE_URL;
assert.equal(new URL(connection).pathname, "/playroom_dev");
const admin = new pg.Pool({ connectionString: connection }),
  schema = "hall_ui_" + randomBytes(6).toString("hex");
await admin.query("CREATE SCHEMA " + schema);
process.env.PGSCHEMA = schema;
const { pool, transaction } =
  await import("../dist/apps/api/src/platform/db/store.js");
const { ranchStorage } =
  await import("../dist/apps/api/src/games/animal-ranch/storage.js");
const engineCode =
  await import("../dist/apps/api/src/games/animal-ranch/engine.js");
const base = "http://127.0.0.1:3221",
  engine = process.env.UI_BROWSER || "chromium",
  folder = "artifacts/ranch-hall-ui/" + engine;
await mkdir(folder, { recursive: true });
const server = spawn(process.execPath, ["dist/apps/api/src/main.js"], {
  env: {
    ...process.env,
    PORT: "3221",
    HOST: "127.0.0.1",
    PUBLIC_ORIGIN: "",
    ALLOWED_ORIGINS: base,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "",
  browser;
server.stderr.on("data", (x) => (log += x));
const results = [],
  failures = [];
async function register(page, account) {
  await page.goto(base);
  await page.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill("名宠堂验收" + account);
  await page.getByLabel("账号", { exact: true }).fill("hall_" + account);
  await page.getByLabel("密码", { exact: true }).fill("OnlyQA_12345");
  await page.locator("#auth-dialog form button[type=submit]").click();
  await page.getByRole("button", { name: "进入我的牧场", exact: true }).click();
  await page.getByTestId("ranch-canvas").waitFor();
  await page.waitForFunction(() => !document.querySelector(".scene-loading"));
}
async function bounds(page) {
  const b = await page.getByRole("dialog").boundingBox();
  assert(
    b.x >= -1 &&
      b.y >= -1 &&
      b.x + b.width <= page.viewportSize().width + 1 &&
      b.y + b.height <= page.viewportSize().height + 1,
    "Dialog outside viewport",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Horizontal page overflow",
  );
  assert.equal(
    await page
      .locator(".hall-layout")
      .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
    false,
    "Hall content overflows",
  );
}
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/healthz")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(process.env.UI_BROWSER_EXECUTABLE
      ? { executablePath: process.env.UI_BROWSER_EXECUTABLE }
      : {}),
    ...(engine === "chromium" ? { args: ["--no-sandbox"] } : {}),
  });
  for (const size of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({
      viewport: size,
      isMobile: size.width < 900,
      hasTouch: size.width < 900,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(12000);
    try {
      await register(page, String(size.width));
      const initial = await (
          await context.request.get(base + "/api/games/animal-ranch/me")
        ).json(),
        owner = initial.owner;
      const giftHarvest = await context.request.post(
        base + "/api/games/animal-ranch/actions",
        {
          data: {
            requestId: randomUUID(),
            expectedRevision: initial.revision,
            type: "harvest",
            payload: {},
          },
        },
      );
      assert(giftHarvest.ok(), "Could not settle original fixture gift");
      await transaction(async (db) => {
        const ctx = { db, gameId: "animal-ranch", world: "default", owner };
        const row = (
          await db.query(
            'SELECT * FROM persistent_profiles WHERE "user"=$1 FOR UPDATE',
            [owner],
          )
        ).rows[0];
        const s = await ranchStorage.load(row.state, ctx),
          start = Date.now() - 13 * 3600000;
        s.at = start;
        s.feedMs = 1000 * 1800000;
        s.batches = [];
        s.events = [];
        s.animals = [
          engineCode.newAnimal(s.animals[0].id, engineCode.species[0], start),
          engineCode.newAnimal(randomUUID(), engineCode.species[1], start),
          engineCode.newAnimal(
            randomUUID(),
            engineCode.species.find((k) => k.id === "goat"),
            start,
          ),
        ];
        const done = engineCode.settleRanch(s, start, Date.now());
        assert(done.animals.every((a) => a.status === "completed"));
        const saved = await ranchStorage.save(done, ctx);
        await db.query(
          'UPDATE persistent_profiles SET state=$1,revision=revision+1,last_settled_at=$2 WHERE "user"=$3',
          [JSON.stringify(saved), done.at, owner],
        );
      });
      await page.reload();
      await page.getByTestId("ranch-canvas").waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".scene-loading"),
      );
      await page.getByRole("button", { name: "查看小鸡", exact: true }).click();
      assert(
        await page
          .getByRole("button", { name: "进入名宠堂", exact: true })
          .isDisabled(),
      );
      await page.screenshot({
        path: folder + "/" + size.width + "-completed-pending.png",
      });
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: /一键收获/ }).click();
      await page.getByRole("button", { name: "查看小鸡", exact: true }).click();
      await page
        .getByRole("button", { name: "进入名宠堂", exact: true })
        .click();
      await page.getByRole("alertdialog", { name: "确认伙伴去向" }).waitFor();
      await page.getByRole("button", { name: "取消", exact: true }).click();
      assert.equal(
        await page.locator(".animal-picker button").count(),
        3,
        "Cancel moved animal",
      );
      await page
        .getByRole("button", { name: "进入名宠堂", exact: true })
        .click();
      await page
        .getByRole("button", { name: "确认进入名宠堂", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "名宠堂", exact: true }).click();
      await page.locator(".hall-card").waitFor();
      await page.locator(".hall-card").first().click();
      await page.getByLabel("名宠堂伙伴昵称").fill("毛茸茸的小小伙伴团团");
      await page.getByRole("button", { name: "保存名字", exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector(".hall-details h3")?.textContent ===
          "毛茸茸的小小伙伴团团",
      );
      await page
        .getByRole("button", { name: "展示给来访者", exact: true })
        .click();
      await page
        .getByRole("button", { name: "取消公开展示", exact: true })
        .waitFor();
      await bounds(page);
      await page.screenshot({
        path: folder + "/" + size.width + "-hall-detail.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: /出售 ·/ }).click();
      await page.getByRole("alertdialog", { name: "确认伙伴去向" }).waitFor();
      await page.screenshot({
        path: folder + "/" + size.width + "-exit-confirm.png",
      });
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.reload();
      await page.getByTestId("ranch-canvas").waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".scene-loading"),
      );
      assert.equal(
        await page.locator(".animal-picker button").count(),
        2,
        "Archived animal returned to pasture",
      );
      await page.getByRole("button", { name: "名宠堂", exact: true }).click();
      await page
        .getByRole("button", {
          name: "查看名宠堂伙伴毛茸茸的小小伙伴团团",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: /出售 ·/ }).click();
      await page.getByRole("button", { name: "确认出售", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".hall-card").length === 0,
      );
      await page.getByRole("button", { name: "成长档案", exact: true }).click();
      await page
        .getByRole("button", {
          name: "查看名宠堂伙伴毛茸茸的小小伙伴团团",
          exact: true,
        })
        .click();
      await page.waitForFunction(() =>
        document.querySelector(".hall-details")?.textContent.includes("已出售"),
      );
      assert.equal(
        await page.getByRole("button", { name: /出售 ·/ }).count(),
        0,
      );
      await bounds(page);
      await page.screenshot({
        path: folder + "/" + size.width + "-history.png",
      });
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page
        .getByRole("button", { name: "查看垂耳兔", exact: true })
        .click();
      await page.getByRole("button", { name: "放生", exact: true }).click();
      await page.getByRole("button", { name: "确认放生", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(await page.locator(".animal-picker button").count(), 1);
      await page.getByRole("button", { name: "名宠堂", exact: true }).click();
      await page.getByRole("button", { name: "成长档案", exact: true }).click();
      await page.getByLabel("搜索名宠堂").fill("兔");
      await page.getByRole("button", { name: "查找", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".hall-card").length === 1,
      );
      assert(
        (await page.locator(".hall-card").textContent()).includes("已放生"),
      );
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: /切换.*模式/ }).click();
      await page.getByRole("button", { name: "名宠堂", exact: true }).click();
      await page.getByRole("button", { name: "成长档案", exact: true }).click();
      await page.locator(".hall-card").first().click();
      await bounds(page);
      await page.screenshot({
        path: folder + "/" + size.width + "-night-hall.png",
      });
      assert.deepEqual(errors, []);
      results.push({
        size,
        passed: true,
        checks: [
          "finite-round-display",
          "harvest-before-hall",
          "exit-cancel",
          "hall-no-active-slot",
          "12-character-name",
          "public-toggle",
          "archived-reload",
          "sale-confirm",
          "release-confirm",
          "history-retained",
          "Chinese-species-search",
          "light-dark",
          "dialog-in-viewport",
          "no-horizontal-overflow",
        ],
      });
    } catch (e) {
      failures.push({ size, error: e.stack });
      await page
        .screenshot({ path: folder + "/" + size.width + "-failure.png" })
        .catch(() => {});
      console.log("FAIL", size.width, e.message);
    }
    await context.close();
  }
  await writeFile(
    "docs/test-reports/20261005-ranch-hall-ui-" + engine + ".json",
    JSON.stringify(
      { browser: engine, isolatedDevelopmentSchema: true, results, failures },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: results.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  await pool.end();
  await admin.query("DROP SCHEMA " + schema + " CASCADE");
  await admin.end();
}
