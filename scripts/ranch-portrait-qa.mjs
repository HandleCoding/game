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
  schema = "portrait_" + randomBytes(8).toString("hex");
const engine = process.env.UI_BROWSER || "chromium",
  baseline = process.env.PORTRAIT_BASELINE === "1";
const base = "http://127.0.0.1:3221",
  folder = "artifacts/ranch-portrait/" + (baseline ? "baseline-" : "") + engine;
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
  await page.getByLabel("昵称", { exact: true }).fill("裁切验收");
  await page.getByLabel("账号", { exact: true }).fill("portrait_" + engine);
  await page.getByLabel("密码", { exact: true }).fill("OnlyQA_12345");
  await page.locator("#auth-dialog form button[type=submit]").click();
  await page.getByRole("button", { name: "进入我的牧场", exact: true }).click();
  await page.getByTestId("ranch-canvas").waitFor();
  await page.waitForFunction(() => !document.querySelector(".scene-loading"));
  const original = await (
    await context.request.get(base + "/api/games/animal-ranch/me")
  ).json();
  const fixture = structuredClone(original);
  fixture.state.level = 20;
  await page.route("**/api/games/animal-ranch/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    }),
  );
  await page.reload();
  await page.getByTestId("ranch-canvas").waitFor();
  await page.getByRole("button", { name: "动物图鉴", exact: true }).click();
  const cards = page.locator(".ranch-shop-animal");
  assert.equal(await cards.count(), 36);
  // Rasterize the actual mounted component at square, wide and tall ratios.
  // Only pixels in the SVG letterbox are examined: these must be transparent.
  // This reproduces the original bug independently of how clipping is implemented.
  await page.evaluate(() => {
    window.portraitSourceCache = new Map();
    window.checkSpriteLetterbox = async (selector, label) => {
      const original = document.querySelector(selector),
        svg = original.cloneNode(true),
        img = svg.querySelector("image");
      const source = new URL(img.getAttribute("href"), location.href).href;
      if (!window.portraitSourceCache.has(source)) {
        const promise = fetch(source)
          .then((r) => {
            if (!r.ok) throw Error("Missing atlas " + r.status);
            return r.blob();
          })
          .then(
            (blob) =>
              new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              }),
          );
        window.portraitSourceCache.set(source, promise);
      }
      img.setAttribute("href", await window.portraitSourceCache.get(source));

      const view = svg.getAttribute("viewBox").split(/\s+/).map(Number),
        checks = [];
      for (const [width, height] of [
        [240, 240],
        [420, 160],
        [140, 320],
      ]) {
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.removeAttribute("class");
        svg.removeAttribute("style");
        const url =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(new XMLSerializer().serializeToString(svg));
        try {
          const rendered = new Image();
          rendered.src = url;
          await Promise.race([
            rendered.decode(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(Error("SVG decode timeout for " + label)),
                10000,
              ),
            ),
          ]);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(rendered, 0, 0, width, height);
          const pixels = ctx.getImageData(0, 0, width, height).data;
          const scale = Math.min(width / view[2], height / view[3]),
            left = (width - view[2] * scale) / 2,
            top = (height - view[3] * scale) / 2;
          let leakedPixels = 0,
            paintedPixels = 0;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              if (pixels[(y * width + x) * 4 + 3] > 8) paintedPixels++;
              if (
                (x < left - 1 ||
                  x > width - left + 1 ||
                  y < top - 1 ||
                  y > height - top + 1) &&
                pixels[(y * width + x) * 4 + 3] > 8
              )
                leakedPixels++;
            }
          checks.push({ label, width, height, leakedPixels, paintedPixels });
          if (paintedPixels < 100)
            throw Error("Missing animal or tool image: " + label);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      return checks;
    };
  });
  let checkedKinds = 0;
  for (const kind of fixture.state.species) {
    await page
      .getByRole("button", { name: "查看" + kind.name + "资料", exact: true })
      .click();
    for (const baby of [false, true]) {
      await page
        .locator(".stage-switch")
        .getByRole("button", { name: baby ? "幼年" : "成年", exact: true })
        .click();
      const checked = await page.evaluate(
        (label) =>
          window.checkSpriteLetterbox(".catalog-detail .portrait", label),
        kind.id + ":" + (baby ? "baby" : "adult"),
      );
      results.push(...checked);
    }
    if (++checkedKinds % 9 === 0)
      console.log("Checked animal stages", checkedKinds, "/ 36");
  }
  // Every actual catalogue tile, not just the selected preview.
  for (let i = 0; i < 36; i++) {
    const checked = await page.evaluate(
      ({ i, label }) =>
        window.checkSpriteLetterbox(
          ".ranch-shop-animal:nth-child(" + (i + 1) + ") .portrait",
          label,
        ),
      { i, label: "tile:" + fixture.state.species[i].id },
    );
    results.push(...checked);
  }
  await page.getByRole("button", { name: "关闭牧场面板" }).click();
  const iconInfo = await page.locator(".ranch-icon").evaluateAll((ss) =>
    ss.map((s) => {
      const im = s.querySelector("image");
      return { x: im.getAttribute("x"), y: im.getAttribute("y") };
    }),
  );
  const seen = new Set();
  for (let i = 0; i < iconInfo.length; i++) {
    const key = JSON.stringify(iconInfo[i]);
    if (seen.has(key)) continue;
    seen.add(key);
    // nth-of-type is not a global element index; mark the observed instance explicitly.
    await page
      .locator(".ranch-icon")
      .nth(i)
      .evaluate((s) => s.setAttribute("data-portrait-qa", "current"));
    results.push(
      ...(await page.evaluate(
        (label) =>
          window.checkSpriteLetterbox('[data-portrait-qa="current"]', label),
        "tool:" + key,
      )),
    );
    await page
      .locator('[data-portrait-qa="current"]')
      .evaluate((s) => s.removeAttribute("data-portrait-qa"));
  }
  assert(seen.size === 9, "Not all tool atlas cells inspected");
  await page.getByRole("button", { name: /动物商店/ }).click();
  await page.getByLabel("搜索动物").fill("");
  for (const size of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    for (const [query, name] of [
      ["", "first-rows"],
      ["羊驼", "alpaca"],
    ]) {
      await page.getByLabel("搜索动物").fill(query);
      await page.screenshot({
        path: folder + "/" + size.width + "-" + name + ".png",
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "关闭牧场面板" }).click();
  await page
    .getByRole("button", { name: "查看小鸡", exact: true })
    .first()
    .click();
  await page.screenshot({
    path: folder + "/animal-detail.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  failures.push(...results.filter((r) => r.leakedPixels > 0));
  await context.close();
} catch (e) {
  failures.push({ error: e.stack || e.message });
} finally {
  await browser?.close();
  const exited = new Promise((r) => server.once("exit", r));
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await exited;
  }
  await pool.query("DROP SCHEMA " + schema + " CASCADE");
  await pool.end();
}
await writeFile(
  "docs/test-reports/20261004-ranch-portrait-" +
    (baseline ? "baseline-" : "") +
    engine +
    ".json",
  JSON.stringify(
    {
      browser: engine,
      baseline,
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
    {
      browser: engine,
      checks: results.length,
      failed: failures.length,
      samples: failures.slice(0, 4),
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
