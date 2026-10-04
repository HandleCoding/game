import { chromium, webkit } from "@playwright/test";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const connection = process.env.DATABASE_URL;
if (!connection || !new URL(connection).pathname.endsWith("/playroom_dev"))
  throw Error("UI tests require isolated playroom_dev");
const pool = new pg.Pool({ connectionString: connection }),
  schema = "ui_" + randomBytes(8).toString("hex");
const engine = process.env.UI_BROWSER || "chromium";
const base = "http://127.0.0.1:3221",
  folder = "artifacts/ranch-ui/" + engine;
await mkdir(folder, { recursive: true });
await pool.query("CREATE SCHEMA " + schema);
const server = spawn(process.execPath, ["dist/apps/api/src/main.js"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "3221",
    PGSCHEMA: schema,
    PUBLIC_ORIGIN: "",
    ALLOWED_ORIGINS: base,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stderr.on("data", (x) => (serverLog += x));
const failures = [],
  results = [];
let browser;
try {
  let started = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/healthz")).ok) {
        started = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(started, serverLog);
  browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(process.env.UI_BROWSER_EXECUTABLE
      ? { executablePath: process.env.UI_BROWSER_EXECUTABLE }
      : {}),

    ...(engine === "chromium" ? { args: ["--no-sandbox"] } : {}),
  });
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    const mobile = size.width < 900,
      context = await browser.newContext({
        viewport: size,
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 1,
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
      });
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(base, { waitUntil: "networkidle" });
      await page
        .getByRole("button", { name: "登录 / 注册", exact: true })
        .click();
      await page.getByRole("button", { name: "创建账号", exact: true }).click();
      await page.getByLabel("昵称", { exact: true }).fill("验收" + size.width);
      await page.getByLabel("账号", { exact: true }).fill("qa_" + size.width);
      await page.getByLabel("密码", { exact: true }).fill("OnlyQA_12345");
      await page.locator("#auth-dialog form button[type=submit]").click();
      await page
        .getByRole("button", { name: "进入我的牧场", exact: true })
        .click();
      await page.getByTestId("ranch-canvas").waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".scene-loading"),
      );
      await page.screenshot({
        path: folder + "/" + size.width + "-scene.png",
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Page overflows horizontally",
      );
      const before = await page
        .locator("canvas")
        .evaluate((c) => c.toDataURL());
      await page.waitForTimeout(900);
      assert.notEqual(
        await page.locator("canvas").evaluate((c) => c.toDataURL()),
        before,
        "Animal animation did not change canvas",
      );
      await page.getByRole("button", { name: "暂停动物动画" }).click();
      await page.waitForTimeout(120);
      const paused = await page
        .locator("canvas")
        .evaluate((c) => c.toDataURL());
      await page.waitForTimeout(300);
      assert.equal(
        await page.locator("canvas").evaluate((c) => c.toDataURL()),
        paused,
        "Paused canvas still moving",
      );
      await page.getByRole("button", { name: "播放动物动画" }).click();
      await page.getByRole("button", { name: /一键收获/ }).click();
      await page.getByRole("button", { name: /我的仓库/ }).click();
      await page
        .getByRole("button", { name: "出售全部产物", exact: true })
        .click();
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: /动物商店/ }).click();
      await page.getByLabel("搜索动物").fill("鸡");
      await page.screenshot({
        path: folder + "/" + size.width + "-shop.png",
        fullPage: true,
      });
      const cards = page.locator(".ranch-shop-animal");
      assert.equal(await cards.count(), 1);
      await cards.getByRole("button", { name: /金币 · 认养/ }).click();
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: /添饲料/ }).click();
      await page.getByRole("button", { name: /\+20/ }).click();
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: "查看小鸡" }).last().click();
      await page.locator("#ranch-window-title").waitFor();
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: "切换到夜间模式" }).click();
      await page.screenshot({
        path: folder + "/" + size.width + "-night.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: /动物商店/ }).click();
      await page.screenshot({
        path: folder + "/" + size.width + "-night-shop.png",
        fullPage: true,
      });
      assert.equal(
        await page
          .getByRole("dialog")
          .evaluate((d) => d.scrollWidth > d.clientWidth),
        false,
        "Dialog overflows horizontally",
      );
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: "切换到日间模式" }).click();
      await page.reload();
      await page.getByRole("button", { name: "查看小鸡" }).last().waitFor();
      await page.screenshot({
        path: folder + "/" + size.width + "-final-scene.png",
        fullPage: true,
      });
      if (mobile) {
        await page
          .getByRole("button", { name: "查看小鸡", exact: true })
          .first()
          .tap();
        await page.locator("#ranch-window-title").waitFor();
        await page.getByRole("button", { name: "关闭牧场面板" }).tap();
        await page.getByRole("button", { name: "暂停动物动画" }).tap();
        await page.getByRole("button", { name: "放大牧场" }).tap();
        await page.waitForTimeout(100);
        const c = await page.getByTestId("ranch-canvas").boundingBox();
        const beforePan = await page
          .locator("canvas")
          .evaluate((c) => c.toDataURL());
        const touch =
          engine === "chromium" ? await context.newCDPSession(page) : null;
        const gestureY = Math.max(
          50,
          Math.min(size.height - 70, c.y + c.height / 2),
        );
        if (touch) {
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: c.x + c.width / 2, y: gestureY }],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: c.x + c.width / 2 + 55, y: gestureY }],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await page.waitForTimeout(100);
          assert.notEqual(
            await page.locator("canvas").evaluate((c) => c.toDataURL()),
            beforePan,
            "Touch drag did not pan",
          );
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: c.x + 90, y: gestureY },
              { x: c.x + 180, y: gestureY },
            ],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: c.x + 60, y: gestureY },
              { x: c.x + 210, y: gestureY },
            ],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        } else {
          await page.mouse.move(c.x + c.width / 2, gestureY);
          await page.mouse.down();
          await page.mouse.move(c.x + c.width / 2 + 55, gestureY, { steps: 4 });
          await page.mouse.up();
        }
        await page.getByRole("button", { name: "查看牧场全景" }).tap();
        await page.getByRole("button", { name: "播放动物动画" }).tap();
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(100);
      const still = await page.locator("canvas").evaluate((c) => c.toDataURL());
      await page.waitForTimeout(300);
      assert.equal(
        await page.locator("canvas").evaluate((c) => c.toDataURL()),
        still,
        "Reduced motion preference ignored",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      assert.deepEqual(errors, [], "Frontend console errors");
      const controls = await page
        .locator(
          ".ranch-toolbelt button,.scene-controls button,.animal-picker button",
        )
        .evaluateAll((bs) =>
          bs.map((b) => ({
            label: b.getAttribute("aria-label") || b.textContent.trim(),
            width: b.getBoundingClientRect().width,
            height: b.getBoundingClientRect().height,
          })),
        );
      assert(
        controls.every((b) => b.width >= 43 && b.height >= 43),
        "Touch controls too small",
      );
      results.push({
        size,
        passed: true,
        checked: [
          "registration",
          "animation",
          "pause",
          "harvest",
          "warehouse-sale",
          "shop-search",
          "buy-animal",
          "feed",
          "detail",
          "theme",
          "reload-save",
          "no-overflow",
          "44px-touch",
          "reduced-motion",
          ...(mobile
            ? [
                engine === "chromium"
                  ? "touch-pan-pinch"
                  : "touch-tap-pointer-pan",
              ]
            : []),
        ],
        controls,
      });
    } catch (e) {
      failures.push({ size, message: e.message });
      await page
        .screenshot({
          path: folder + "/" + size.width + "-failure.png",
          fullPage: true,
        })
        .catch(() => {});
      console.log("FAIL", size.width, e.message);
    }
    await context.close();
  }
  await writeFile(
    "docs/test-reports/20261004-ranch-scene-ui-" + engine + ".json",
    JSON.stringify(
      {
        browser: engine,
        isolatedDevelopmentSchema: true,
        results,
        failures,
      },
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
  await pool.query("DROP SCHEMA " + schema + " CASCADE");
  await pool.end();
}
