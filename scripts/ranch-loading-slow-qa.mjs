import http from "node:http";
import { readFile } from "node:fs/promises";
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
  schema = "slow_" + randomBytes(8).toString("hex");
const engine = process.env.UI_BROWSER || "chromium",
  baseline = false;
const base = "http://127.0.0.1:3222",
  folder =
    "artifacts/ranch-loading-slow/" + (baseline ? "baseline-" : "") + engine;
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
let activeAssets = 0,
  maxAssets = 0;
const proxy = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path.startsWith("/ranch/") && path.endsWith(".webp")) {
    activeAssets++;
    maxAssets = Math.max(maxAssets, activeAssets);
    let closed = false;
    res.on("close", () => {
      if (!closed) {
        closed = true;
        activeAssets--;
      }
    });
    try {
      const body = await readFile("web-dist" + path);
      res.writeHead(200, {
        "Content-Type": "image/webp",
        "Content-Length": body.length,
        "Cache-Control": "public,max-age=31536000,immutable",
      });
      if (path.endsWith("/pasture-v1.webp")) {
        const step = Math.ceil(body.length / 36);
        for (let i = 0; i < body.length && !res.destroyed; i += step) {
          res.write(body.subarray(i, Math.min(i + step, body.length)));
          await new Promise((r) => setTimeout(r, 900));
        }
        res.end();
      } else res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: 3221,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
});
await new Promise((r) => proxy.listen(3222, "127.0.0.1", r));

const results = [],
  failures = [];
try {
  let started = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3221/healthz")).ok) {
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
  await page.getByLabel("账号", { exact: true }).fill("slowfix_" + engine);
  await page.getByLabel("密码", { exact: true }).fill("OnlyQA_12345");
  await page.locator("#auth-dialog form button[type=submit]").click();

  await page
    .getByRole("button", { name: "进入我的牧场", exact: true })
    .waitFor();
  await page.locator("#auth-dialog").waitFor({ state: "hidden" });
  // Public-view fixture in this isolated browser only. No fabricated production progress.
  const original = await (
    await context.request.get(base + "/api/games/animal-ranch/me")
  ).json();
  assert(
    original.state,
    "Fixture read failed: " +
      JSON.stringify({ error: original.error, message: original.message }),
  );
  const fixture = structuredClone(original);
  fixture.state.animals = ["chicken", "horse", "monkey", "sloth"].map(
    (species, i) => ({
      ...original.state.animals[0],
      id: "slow-fixture-" + i,
      species,
      name: species,
      baby: false,
    }),
  );
  await page.route("**/api/games/animal-ranch/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    }),
  );
  await page.getByRole("button", { name: "进入我的牧场", exact: true }).click();
  const loader = page.getByTestId("ranch-loading");
  await loader.waitFor();
  await page.waitForFunction(() => {
    const p = document.querySelector(".ranch-entry progress");
    return p && p.value > 0 && p.value < 100;
  });
  const transferStarted = Date.now();
  await page.waitForTimeout(27000);
  assert(
    await loader.isVisible(),
    "Slow asset should still be actively transferring after 25s",
  );
  assert.equal(
    await page.getByRole("button", { name: "重新加载", exact: true }).count(),
    0,
    "Active transfer must not time out",
  );
  const progress = await page
    .locator(".ranch-entry progress")
    .evaluate((p) => p.value);
  assert(
    progress > 0 && progress < 100,
    "Progress must change during download",
  );
  assert(
    (await page.locator(".entry-count").textContent()).includes("/ 6"),
    "Reproduce six-resource pasture",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: folder + "/390-slow.png", fullPage: true });
  await loader.waitFor({ state: "hidden", timeout: 25000 });
  assert(await page.locator(".ranch-toolbelt").isVisible());
  assert(maxAssets <= 2, "Only two required asset transfers run concurrently");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: folder + "/390-ready.png", fullPage: true });
  results.push({
    name: "六资源正常下载超过25秒仍能完成",
    passed: true,
    elapsedMs: Date.now() - transferStarted,
    progressAt27s: progress,
    maxConcurrentAssets: maxAssets,
  });
  console.log("Slow transfer passed", engine);
  await context.close();
} catch (e) {
  failures.push({ error: e.stack || e.message });
} finally {
  await browser?.close();
  await new Promise((r) => proxy.close(r));
  if (server.exitCode === null) {
    const exited = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await exited;
  }
  await pool.query("DROP SCHEMA " + schema + " CASCADE");
  await pool.end();
}
await writeFile(
  "docs/test-reports/20261004-ranch-loading-slow-" + engine + ".json",
  JSON.stringify(
    { browser: engine, isolatedDevelopmentSchema: true, results, failures },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ browser: engine, results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
