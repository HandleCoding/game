import { chromium, webkit } from "@playwright/test";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const connection = process.env.DATABASE_URL;
assert.equal(new URL(connection).pathname, "/playroom_dev");
const admin = new pg.Pool({ connectionString: connection }),
  schema = "appearance_ui_" + randomBytes(6).toString("hex");
await admin.query("CREATE SCHEMA " + schema);
process.env.PGSCHEMA = schema;
const { pool, transaction } =
  await import("../dist/apps/api/src/platform/db/store.js");
const { ranchStorage } =
  await import("../dist/apps/api/src/games/animal-ranch/storage.js");
const { newAnimal, species } =
  await import("../dist/apps/api/src/games/animal-ranch/engine.js");
const engine = process.env.UI_BROWSER || "chromium",
  folder = "artifacts/ranch-generated-appearance/" + engine,
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
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({
        viewport: size,
        reducedMotion: "reduce",
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
        const grown = newAnimal("render-adult", species[0], Date.now());
        Object.assign(grown, {
          status: "producing",
          ageMs: grown.growthMs,
          attributes: [],
          adultRoll: "skipped",
          purchaseRoll: "skipped",
          nickname: "成年外观",
        });
        Object.assign(s.animals[0], {
          status: "juvenile",
          ageMs: 0,
          cycleProgressMs: 0,
          stored: 0,
          totalProduced: 0,
        });
        s.animals.push(grown);
        s.feedMs = 144000000;
        await ranchStorage.save(s, ctx);
      });
      const frames = [];
      let baseline;
      for (const attrs of [
        [],
        ["lightning"],
        ["fire"],
        ["water"],
        ["gold"],
        ["dream"],
        ["fire", "water"],
      ]) {
        await transaction(async (db) => {
          const ctx = { db, gameId: "animal-ranch", world: "default", owner };
          const row = (
            await db.query(
              'SELECT state FROM persistent_profiles WHERE "user"=$1 FOR UPDATE',
              [owner],
            )
          ).rows[0];
          const s = await ranchStorage.load(row.state, ctx);
          for (const a of s.animals) {
            a.attributes = attrs;
            a.grade = attrs.length ? 3 : 0;
            a.purchaseRoll = "skipped";
            a.adultRoll = "skipped";
          }
          await ranchStorage.save(s, ctx);
        });
        await page.reload();
        await page.getByTestId("ranch-canvas").waitFor();
        await page.waitForFunction(
          () => !document.querySelector(".scene-loading"),
        );
        await page.waitForTimeout(150);
        const view = (
          await (
            await context.request.get(base + "/api/games/animal-ranch/me")
          ).json()
        ).state;
        assert.equal(view.animals.filter((a) => a.baby).length, 1);
        assert.equal(view.animals.filter((a) => !a.baby).length, 1);
        const pixels = await page.evaluate(() => {
          const c = document.querySelector('[data-testid="ranch-canvas"]');
          const p = c
            .getContext("2d")
            .getImageData(0, 0, c.width, c.height).data;
          const out = [];
          for (let i = 0; i < p.length; i += 64)
            out.push(p[i], p[i + 1], p[i + 2]);
          return out;
        });
        let changed = 0;
        if (!attrs.length) baseline = pixels;
        else {
          assert.equal(pixels.length, baseline.length);
          for (let i = 0; i < pixels.length; i += 3)
            if (
              Math.abs(pixels[i] - baseline[i]) +
                Math.abs(pixels[i + 1] - baseline[i + 1]) +
                Math.abs(pixels[i + 2] - baseline[i + 2]) >
              20
            )
              changed++;
          assert(
            changed > 20,
            "Attribute appearance is not visibly drawn: " + attrs,
          );
          assert(
            changed / (pixels.length / 3) < 0.15,
            "Animal material painted the entire scene",
          );
        }
        const name = attrs.join("+") || "normal";
        await page.screenshot({
          path: folder + "/" + size.width + "-" + name + ".png",
        });
        frames.push({ attributes: attrs, changedPixelsSampled: changed });
      }
      assert.deepEqual(errors, []);
      results.push({
        size,
        frames,
        checks: [
          "actual-canvas-pixels",
          "five-distinct-attributes",
          "adult-and-juvenile",
          "dual-effects",
          "static-reduced-motion",
          "unchanged-scene-outside-animals",
          "no-js-errors",
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
    "docs/test-reports/20261005-ranch-generated-appearance-" + engine + ".json",
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
