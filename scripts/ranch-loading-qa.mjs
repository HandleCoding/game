import { chromium, webkit } from "@playwright/test";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const connection = process.env.DATABASE_URL;
assert(
  connection && new URL(connection).pathname.endsWith("/playroom_dev"),
  "Requires isolated development DB",
);
const pool = new pg.Pool({ connectionString: connection }),
  schema = "loading_" + randomBytes(8).toString("hex");
const engine = process.env.UI_BROWSER || "chromium",
  baseline = false;
const base = "http://127.0.0.1:3221",
  folder =
    "artifacts/ranch-loading-fix/" + (baseline ? "baseline-" : "") + engine;
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
let serverLog = "",
  browser;
server.stderr.on("data", (b) => (serverLog += b));
const results = [],
  failures = [];
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
    executablePath: process.env.UI_BROWSER_EXECUTABLE,
    ...(engine === "chromium" ? { args: ["--no-sandbox"] } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill("加载验收");
  await page.getByLabel("账号", { exact: true }).fill("loadingfix_" + engine);
  await page.getByLabel("密码", { exact: true }).fill("OnlyQA_12345");
  await page.locator("#auth-dialog form button[type=submit]").click();

  const check = (name, value) => {
    assert(value, name);
    results.push({ name, passed: true });
  };
  let backgroundMode = "hold";
  let releaseBackground;
  let backgroundGate = new Promise((r) => {
    releaseBackground = r;
  });
  let releaseProfile;
  const profileGate = new Promise((r) => {
    releaseProfile = r;
  });
  let holdProfile = true;
  const requests = new Map();
  await page.route("**/api/games/animal-ranch/me", async (route) => {
    if (holdProfile) await profileGate;
    await route.continue();
  });
  await page.route("**/ranch/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().resourceType() === "fetch")
      requests.set(path, (requests.get(path) || 0) + 1);
    if (path === "/ranch/scene/pasture-v1.webp") {
      if (backgroundMode === "hold") await backgroundGate;
      else if (backgroundMode === "fail") {
        backgroundMode = "normal";
        return route.abort();
      } else if (backgroundMode === "invalid") {
        backgroundMode = "normal";
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: "invalid-image",
        });
      }
    }
    await route.continue();
  });
  const enter = async () =>
    page.getByRole("button", { name: "进入我的牧场", exact: true }).click();
  const loader = page.getByTestId("ranch-loading");
  const waitReady = async () => {
    await loader.waitFor({ state: "hidden", timeout: 15000 });
    await page.locator(".ranch-toolbelt").waitFor({ state: "visible" });
  };
  await enter();
  await page.getByRole("progressbar", { name: "正在读取牧场存档" }).waitFor();
  check("存档读取阶段显示不确定进度", await loader.isVisible());
  holdProfile = false;
  releaseProfile();
  await page.getByRole("progressbar", { name: "牧场资源加载进度" }).waitFor();
  await page.waitForFunction(() => {
    const p = document.querySelector(".ranch-entry progress");
    return p && p.value > 0 && p.value < p.max;
  });
  const progress = await page
    .locator(".ranch-entry progress")
    .evaluate((p) => ({ value: p.value, max: p.max }));
  check(
    "背景未完成时资源进度真实介于0和100",
    progress.value > 0 && progress.value < progress.max,
  );
  check(
    "加载时隐藏工具栏及HUD",
    !(await page.locator(".ranch-toolbelt").isVisible()) &&
      !(await page.locator(".game-profile").isVisible()),
  );
  check(
    "首屏仅加载必要动物资源",
    Number(
      (await page.locator(".entry-count").textContent()).match(/\/\s*(\d+)/)[1],
    ) < 11,
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const bounds = await page.locator(".entry-card").boundingBox();
    check(
      "加载面板适配" + viewport.width,
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width + 1 &&
        bounds.y + bounds.height <= viewport.height + 1,
    );
    await page.screenshot({
      path: folder + "/" + viewport.width + "-progress.png",
      fullPage: true,
    });
  }
  backgroundMode = "normal";
  releaseBackground();
  await waitReady();
  check(
    "完成后自动进入并显示工具栏",
    await page.locator(".ranch-toolbelt").isVisible(),
  );
  const painted = await page.getByTestId("ranch-canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    return (
      ctx.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
      ).data[3] > 0
    );
  });
  check("隐藏加载页前首帧已经绘制", painted);
  // Each reload uses the same real account in an isolated schema, no production writes.
  for (const mode of ["fail", "invalid"]) {
    await page
      .getByRole("button", { name: "返回游戏大厅", exact: true })
      .click();
    backgroundMode = mode;
    await page.reload({ waitUntil: "domcontentloaded" });
    await enter();
    await page.getByRole("button", { name: "重新加载", exact: true }).waitFor();
    check(mode + "显示失败与重试", await loader.isVisible());
    check(
      mode + "失败时不露出空白游戏工具",
      !(await page.locator(".ranch-toolbelt").isVisible()),
    );
    const before = new Map(requests);
    await page.screenshot({
      path: folder + "/" + mode + ".png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "重新加载", exact: true }).click();
    await waitReady();
    check(mode + "原地重试恢复", !(await loader.isVisible()));
    check(
      mode + "重试保留成功资源",
      [...before].every(
        ([path, n]) =>
          path === "/ranch/scene/pasture-v1.webp" || requests.get(path) === n,
      ),
    );
  }
  // An unresolved resource expires rather than hanging indefinitely.
  if (engine === "chromium") {
    await page
      .getByRole("button", { name: "返回游戏大厅", exact: true })
      .click();
    backgroundMode = "hold";
    backgroundGate = new Promise((r) => {
      releaseBackground = r;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await enter();
    await page
      .getByRole("button", { name: "重新加载", exact: true })
      .waitFor({ timeout: 55000 });
    check("45秒未响应资源超时提供重试", await loader.isVisible());
    backgroundMode = "normal";
    releaseBackground();
    await page.getByRole("button", { name: "重新加载", exact: true }).click();
    await waitReady();
    check("资源超时后重试恢复", !(await loader.isVisible()));
  }
  await page.getByRole("button", { name: "返回游戏大厅", exact: true }).click();
  backgroundMode = "hold";
  backgroundGate = new Promise((r) => {
    releaseBackground = r;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await enter();
  await page.getByRole("progressbar", { name: "牧场资源加载进度" }).waitFor();
  await page.getByRole("button", { name: "返回大厅", exact: true }).click();
  backgroundMode = "normal";
  releaseBackground();
  check(
    "加载中可以回大厅",
    await page
      .getByRole("button", { name: "进入我的牧场", exact: true })
      .isVisible(),
  );
  await enter();
  await waitReady();
  check("退出后重新进入不会被旧加载覆盖", !(await loader.isVisible()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: folder + "/390-ready.png", fullPage: true });
  check("没有未捕获浏览器错误", errors.length === 0);
  await context.close();
} catch (e) {
  failures.push({ error: e.stack || e.message });
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await exited;
  }
  await pool.query("DROP SCHEMA " + schema + " CASCADE");
  await pool.end();
}
await writeFile(
  "docs/test-reports/20261004-ranch-loading-fix-" + engine + ".json",
  JSON.stringify(
    {
      browser: engine,
      isolatedDevelopmentSchema: true,
      checks: results.length,
      failures,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    { browser: engine, checks: results.length, failures },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
