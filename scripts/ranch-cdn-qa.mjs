import { chromium, webkit } from "@playwright/test";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const connection = process.env.DATABASE_URL;
assert(connection && new URL(connection).pathname.endsWith("/playroom_dev"));
const pool = new pg.Pool({ connectionString: connection });
const schema = "cdn_" + randomBytes(8).toString("hex");
const origin = "https://game.aicoding.ltd",
  base = "http://127.0.0.1:3221";
const cdn = "https://static.aicoding.ltd";
const engine = process.env.UI_BROWSER || "chromium";
const folder = "artifacts/ranch-cdn/" + engine;
await mkdir(folder, { recursive: true });
await pool.query("CREATE SCHEMA " + schema);
const server = spawn(process.execPath, ["dist/apps/api/src/main.js"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "3221",
    PGSCHEMA: schema,
    PUBLIC_ORIGIN: origin,
    ALLOWED_ORIGINS: base,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser,
  serverLog = "";
server.stderr.on("data", (b) => (serverLog += b));
const results = [];
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
  const cases = process.env.CDN_IDLE
    ? [{ name: "cdn-idle", width: 390, height: 844, mode: "idle" }]
    : [
        { name: "live-phone", width: 390, height: 844, mode: "live" },
        { name: "live-landscape", width: 844, height: 390, mode: "live" },
        { name: "live-desktop", width: 1440, height: 1000, mode: "live" },
        { name: "cdn-unavailable", width: 390, height: 844, mode: "abort" },
        { name: "cdn-corrupt", width: 1440, height: 1000, mode: "corrupt" },
        { name: "svg-error", width: 390, height: 844, mode: "svg" },
      ];
  for (const [index, c] of cases.entries()) {
    const context = await browser.newContext({
      viewport: { width: c.width, height: c.height },
      isMobile: c.width < 900,
      hasTouch: c.width < 900,
      locale: "zh-CN",
    });
    const page = await context.newPage(),
      errors = [],
      requests = [],
      responses = [],
      networkErrors = [],
      warnings = [];
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) => {
      if (r.url().includes("/ranch/"))
        networkErrors.push({ url: r.url(), error: r.failure()?.errorText });
    });
    page.on("console", (m) => {
      if (m.type() === "warning" || m.type() === "error")
        warnings.push(m.text());
    });
    page.on("request", (r) => {
      if (r.url().includes("/ranch/"))
        requests.push({ url: r.url(), type: r.resourceType() });
    });
    page.on("response", (r) => {
      if (r.url().startsWith(cdn))
        responses.push({
          url: r.url(),
          status: r.status(),
          headers: r.headers(),
        });
    });
    // Virtual public hostname routes ONLY to the isolated development service, never production APIs.
    await context.route(origin + "/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/events") return route.abort(); // SSE presence is covered by platform tests.
      const cookies = await context.cookies(origin);
      const response = await route.fetch({
        url: base + path + new URL(route.request().url()).search,
        headers: {
          ...route.request().headers(),
          cookie: cookies.map((c) => c.name + "=" + c.value).join("; "),
        },
      });
      // Explicit relay of test cookies: WebKit URL-rewrite interception does not
      // consistently apply Secure cookies from an HTTP upstream to a virtual HTTPS URL.
      const session = response
        .headers()
        ["set-cookie"]?.match(/pair_session=([^;]+)/);
      if (session?.[1])
        await context.addCookies([
          {
            name: "pair_session",
            value: session[1],
            url: origin,
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
          },
        ]);
      await route.fulfill({ response });
    });
    if (c.mode !== "live")
      await context.route(cdn + "/**", async (route) => {
        if (c.mode === "abort") return route.abort();
        if (
          c.mode === "idle" &&
          new URL(route.request().url()).pathname ===
            "/ranch/scene/pasture-v1.webp"
        ) {
          await new Promise((r) => setTimeout(r, 46000));
          await route.abort().catch(() => {});
          return;
        }
        if (c.mode === "corrupt")
          return route.fulfill({
            status: 200,
            contentType: "image/webp",
            headers: { "Access-Control-Allow-Origin": origin },
            body: "broken-webp",
          });
        if (
          c.mode === "svg" &&
          new URL(route.request().url()).pathname.endsWith(
            "/rabbit-stages-v1.webp",
          )
        )
          return route.abort();
        const path = new URL(route.request().url()).pathname;
        const body = await readFile("web-dist" + path);
        return route.fulfill({
          status: 200,
          contentType: "image/webp",
          headers: {
            "Access-Control-Allow-Origin": origin,
            "Content-Length": String(body.length),
          },
          body,
        });
      });
    try {
      await page.goto(origin, { waitUntil: "networkidle" });
      await page
        .getByRole("button", { name: "登录 / 注册", exact: true })
        .click();
      await page.getByRole("button", { name: "创建账号", exact: true }).click();
      await page.getByLabel("昵称", { exact: true }).fill("CDN验收" + index);
      await page
        .getByLabel("账号", { exact: true })
        .fill("cdn_" + engine + "_" + index);
      await page.getByLabel("密码", { exact: true }).fill("OnlyQA_12345");
      await page.locator("#auth-dialog form button[type=submit]").click();
      await page
        .getByRole("button", { name: "进入我的牧场", exact: true })
        .click();
      await page.getByTestId("ranch-canvas").waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".scene-loading"),
        {},
        { timeout: 90000 },
      );
      assert.equal(await page.locator(".ranch-toolbelt").count(), 1);
      assert(!(await page.locator(".ranch-loading-error").count()));
      assert(requests.some((r) => r.url.startsWith(cdn) && r.type === "fetch"));
      if (c.mode === "live") {
        assert(
          !requests.some(
            (r) =>
              r.url.startsWith(origin + "/ranch/scene/") ||
              r.url.startsWith(origin + "/ranch/ui/"),
          ),
          "Unexpected origin fallback",
        );
        assert(
          responses.some(
            (r) => r.headers["access-control-allow-origin"] === origin,
          ),
          "CORS absent",
        );
      } else if (c.mode !== "svg" && c.mode !== "idle") {
        for (const path of [
          "/ranch/scene/pasture-v1.webp",
          "/ranch/ui/ranch-tools-v1.webp",
          "/ranch/scene/soft/adult-0-v1.webp",
        ])
          assert(
            requests.some((r) => r.url === origin + path && r.type === "fetch"),
            "Fallback absent: " + path,
          );
      }
      if (c.mode === "idle")
        assert(
          requests.some(
            (r) =>
              r.url === origin + "/ranch/scene/pasture-v1.webp" &&
              r.type === "fetch",
          ),
          "Idle timeout did not fall back",
        );
      await page.screenshot({
        path: folder + "/" + c.name + "-scene.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "动物商店", exact: true }).click();
      await page.locator(".ranch-shop-animal").first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(
        () =>
          [
            ...document.querySelectorAll(".portrait image,.ranch-icon image"),
          ].every((n) => n.getAttribute("href")?.startsWith("data:image/")),
        {},
        { timeout: 60000 },
      );
      if (c.mode === "svg")
        assert(
          requests.some(
            (r) =>
              r.url === origin + "/ranch/scene/soft/rabbit-stages-v1.webp" &&
              r.type === "fetch",
          ),
          "Portrait fallback absent",
        );
      const painted = await page.evaluate(async () => {
        const nodes = [...document.querySelectorAll(".portrait")];
        nodes.push(document.querySelector(".ranch-icon"));
        const selected = [
          nodes[0],
          nodes[Math.min(2, nodes.length - 1)],
          nodes[nodes.length - 1],
        ];
        const pixels = [];
        for (const node of selected) {
          const copy = node.cloneNode(true);
          copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          copy.setAttribute("width", "96");
          copy.setAttribute("height", "96");
          const img = new Image();
          img.src =
            "data:image/svg+xml;charset=utf-8," +
            encodeURIComponent(copy.outerHTML);
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 96;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, 96, 96);
          const data = ctx.getImageData(0, 0, 96, 96).data;
          let visible = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 20) visible++;
          pixels.push(visible);
        }
        return pixels;
      });
      assert(
        painted.every((n) => n > 100),
        "Blank SVG artwork: " + painted.join(","),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: folder + "/" + c.name + ".png",
        fullPage: true,
      });
      results.push({
        ...c,
        passed: true,
        cdnRequests: requests.filter((r) => r.url.startsWith(cdn)).length,
        originRequests: requests.filter((r) =>
          r.url.startsWith(origin + "/ranch/"),
        ).length,
      });
      console.log("PASS", engine, c.name);
    } catch (e) {
      console.log(
        JSON.stringify({ requests, responses, networkErrors, warnings }),
      );
      await page.screenshot({
        path: folder + "/" + c.name + "-failure.png",
        fullPage: true,
      });
      throw e;
    } finally {
      await context.close();
    }
  }
  await writeFile(
    "docs/test-reports/20261004-ranch-cdn-" +
      (process.env.CDN_IDLE ? "idle-" : "") +
      engine +
      ".json",
    JSON.stringify(
      {
        browser: engine,
        isolatedDevelopmentSchema: true,
        publicHostnameIntercepted: true,
        liveCdnForSuccessCases: true,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  const stopped = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await stopped;
  await pool.query("DROP SCHEMA " + schema + " CASCADE");
  await pool.end();
}
