import { chromium, webkit } from "@playwright/test";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const connection = process.env.DATABASE_URL;
assert.equal(new URL(connection).pathname, "/playroom_dev");
const admin = new pg.Pool({ connectionString: connection }),
  schema = "mutation_ui_" + randomBytes(6).toString("hex");
await admin.query("CREATE SCHEMA " + schema);
process.env.PGSCHEMA = schema;
const { pool, transaction } =
  await import("../dist/apps/api/src/platform/db/store.js");
const { ranchStorage } =
  await import("../dist/apps/api/src/games/animal-ranch/storage.js");
const { newAnimal, species } =
  await import("../dist/apps/api/src/games/animal-ranch/engine.js");
const engine = process.env.UI_BROWSER || "chromium",
  folder = "artifacts/ranch-generated-ui/" + engine,
  base = "http://127.0.0.1:3221";
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
async function bounds(page) {
  const d = page.getByRole("dialog");
  const b = await d.boundingBox();
  assert(
    b.x >= -1 &&
      b.y >= -1 &&
      b.x + b.width <= page.viewportSize().width + 1 &&
      b.y + b.height <= page.viewportSize().height + 1,
    "dialog outside viewport",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "page overflow",
  );
  assert.equal(
    await d.evaluate((e) => e.scrollWidth > e.clientWidth + 1),
    false,
    "dialog overflow",
  );
}
async function close(page) {
  await page.getByRole("button", { name: "关闭牧场面板" }).click();
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
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    try {
      await page.goto(base);
      await page
        .getByRole("button", { name: "登录 / 注册", exact: true })
        .click();
      await page.getByRole("button", { name: "创建账号", exact: true }).click();
      await page
        .getByLabel("昵称", { exact: true })
        .fill("变异验收" + size.width);
      await page
        .getByLabel("账号", { exact: true })
        .fill("mutation_" + size.width);
      await page.getByLabel("密码", { exact: true }).fill("OnlyQA_12345");
      await page.locator("#auth-dialog form button[type=submit]").click();
      await page
        .getByRole("button", { name: "进入我的牧场", exact: true })
        .click();
      await page.getByTestId("ranch-canvas").waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".scene-loading"),
      );
      const profile = await (
          await context.request.get(base + "/api/games/animal-ranch/me")
        ).json(),
        owner = profile.owner;
      await transaction(async (db) => {
        const ctx = { db, gameId: "animal-ranch", world: "default", owner };
        const row = (
          await db.query(
            'SELECT state FROM persistent_profiles WHERE "user"=$1 FOR UPDATE',
            [owner],
          )
        ).rows[0];
        const s = await ranchStorage.load(row.state, ctx);
        s.coins = 10000;
        s.features.dew = 100;
        for (const [id, attrs] of [
          ["a", ["fire", "water"]],
          ["b", ["dream"]],
          ["c", ["lightning"]],
        ]) {
          const a = newAnimal(id, species[0], Date.now());
          Object.assign(a, {
            status: "hall",
            completedRounds: a.maxRounds,
            completedAt: s.at,
            stored: 0,
            grade: 0,
            attributes: attrs,
            nickname: "融合" + id,
          });
          s.animals.push(a);
        }
        s.lots.push({
          id: "test-lot",
          animalId: null,
          batchId: null,
          product: "egg",
          quantity: 10,
          price: 1,
          priceMilli: 1250,
          grade: 1,
          attributes: ["dream"],
          locked: false,
          at: Date.now(),
        });
        s.inventory.egg = 10;
        await ranchStorage.save(s, ctx);
        await db.query(
          'UPDATE persistent_profiles SET revision=revision+1 WHERE "user"=$1',
          [owner],
        );
      });
      await page.reload();
      await page.getByTestId("ranch-canvas").waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".scene-loading"),
      );
      await page.getByRole("button", { name: "动物图鉴", exact: true }).click();
      await page.getByText("已发现 1 / 36 种", { exact: true }).waitFor();
      await bounds(page);
      assert((await page.locator(".unknown-species").count()) > 0);
      await page.screenshot({ path: folder + "/" + size.width + "-codex.png" });
      await close(page);
      await page.getByRole("button", { name: "收藏目标", exact: true }).click();
      await page
        .getByRole("button", { name: "追踪目标", exact: true })
        .first()
        .click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.goal-card button[aria-pressed="true"]')
            .length === 3,
      );
      await bounds(page);
      await close(page);
      await page.getByRole("button", { name: /我的仓库/ }).click();
      await page.getByLabel("出售产物数量").fill("2");
      await page
        .getByRole("button", { name: "出售 2 份 · 2.5 金币", exact: true })
        .click();
      await page.getByRole("button", { name: "确认出售", exact: true }).click();
      await page.getByText("库存 8 份", { exact: false }).waitFor();
      await page
        .getByRole("button", { name: "锁定这批产物", exact: true })
        .click();
      await page
        .getByRole("button", { name: "解除锁定", exact: true })
        .waitFor();
      assert(
        await page.getByRole("button", { name: /出售 1 份/ }).isDisabled(),
      );
      await bounds(page);
      await page.screenshot({
        path: folder + "/" + size.width + "-warehouse.png",
      });
      await close(page);
      await page.getByRole("button", { name: "名宠堂", exact: true }).click();
      await page.getByRole("button", { name: "名宠融合", exact: true }).click();
      await page.locator(".fusion-card").filter({ hasText: "融合a" }).click();
      await page.locator(".fusion-card").filter({ hasText: "融合b" }).click();
      await page.getByLabel("融合属性方式").selectOption("random");
      await page.getByLabel("保留的属性").selectOption("water");
      await page
        .getByRole("button", { name: "确认材料与消耗", exact: true })
        .waitFor();
      await bounds(page);
      await page.screenshot({
        path: folder + "/" + size.width + "-fusion-preview.png",
      });
      await page
        .getByRole("button", { name: "确认材料与消耗", exact: true })
        .click();
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/games/animal-ranch/actions") &&
          r.request().postDataJSON()?.type === "fuseAnimals",
      );
      await page.getByRole("button", { name: "确认融合", exact: true }).click();
      assert((await response).ok());
      await page.waitForFunction(
        () => document.querySelectorAll(".fusion-card").length === 2,
      );
      const record = await (
        await context.request.get(base + "/api/games/animal-ranch/me/animals/a")
      ).json();
      assert.equal(record.animal.grade, 1);
      assert.equal(record.animal.attributes.length, 2);
      assert(record.animal.attributes.includes("water"));
      assert.equal(
        (
          await (
            await context.request.get(
              base + "/api/games/animal-ranch/me/animals/b",
            )
          ).json()
        ).animal.status,
        "fused",
      );
      await close(page);
      await page.getByRole("button", { name: "切换到夜间模式" }).click();
      await page.getByRole("button", { name: "动物图鉴", exact: true }).click();
      await bounds(page);
      await page.screenshot({
        path: folder + "/" + size.width + "-dark-codex.png",
      });
      await close(page);
      await page.getByRole("button", { name: "切换到日间模式" }).click();
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "light",
      );
      await page.waitForTimeout(250);
      await page.screenshot({ path: folder + "/" + size.width + "-scene.png" });
      // The server commits, but the client receives 503: retry must replay the same receipt.
      const beforeBuy = await (
          await context.request.get(base + "/api/games/animal-ranch/me")
        ).json(),
        buyRequests = [];
      const pattern = "**/api/games/animal-ranch/actions";
      const handler = async (route) => {
        const body = route.request().postDataJSON();
        if (body.type === "buyAnimal") {
          buyRequests.push(body);
          await route.fetch();
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "QA：提交后响应中断" }),
          });
        } else await route.continue();
      };
      await page.route(pattern, handler);
      await page.getByRole("button", { name: /动物商店/ }).click();
      await page.locator(".catalog-detail .ranch-primary").click();
      await page
        .getByRole("button", { name: "重试上次操作", exact: true })
        .waitFor();
      await close(page);
      await page.unroute(pattern, handler);
      page.on("request", (r) => {
        if (
          r.url().endsWith("/api/games/animal-ranch/actions") &&
          r.postDataJSON()?.type === "buyAnimal"
        )
          buyRequests.push(r.postDataJSON());
      });
      const replay = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/games/animal-ranch/actions") &&
          r.request().postDataJSON()?.type === "buyAnimal",
      );
      await page
        .getByRole("button", { name: "重试上次操作", exact: true })
        .click();
      assert((await replay).ok());
      const afterBuy = await (
        await context.request.get(base + "/api/games/animal-ranch/me")
      ).json();
      assert.equal(afterBuy.state.coins, beforeBuy.state.coins - 13);
      assert.equal(
        afterBuy.state.animals.length,
        beforeBuy.state.animals.length + 1,
      );
      assert.equal(buyRequests.length, 2);
      assert.equal(buyRequests[0].requestId, buyRequests[1].requestId);
      assert.deepEqual(errors, []);
      results.push({
        size,
        checks: [
          "true-codex",
          "three-goals",
          "fractional-sale",
          "lock-inventory",
          "fusion-preview",
          "dual-random",
          "consumed-history",
          "light-dark",
          "in-viewport",
          "no-overflow",
          "no-js-errors",
          "post-commit-retry-same-requestId",
        ],
      });
      console.log("PASS", size.width);
    } catch (e) {
      failures.push({ size, error: e.stack });
      console.log("FAIL", size.width, e.message);
      await page
        .screenshot({ path: folder + "/" + size.width + "-failure.png" })
        .catch(() => {});
    }
    await context.close();
  }
  await writeFile(
    "docs/test-reports/20261005-ranch-generated-ui-" + engine + ".json",
    JSON.stringify(
      { engine, isolatedDevelopmentSchema: true, results, failures },
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
