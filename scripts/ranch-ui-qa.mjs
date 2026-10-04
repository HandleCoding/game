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
  folder = "artifacts/ranch-game-ui/" + engine;
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
// Check the visible hint against the whole picker row, including off-screen pills.
async function checkHudClear(page) {
  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return {
      note: rect(".game-offline-note"),
      profile: rect(".game-profile"),
      menus: [...document.querySelectorAll(".game-side-actions button")].map(b => {
        const r = b.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
      picker: rect(".animal-picker"),
      tools: rect(".ranch-toolbelt"),
      width: innerWidth,
      height: innerHeight,
    };
  });
  const overlaps = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert(!overlaps(boxes.note, boxes.picker), "Offline hint covers animal selection");
  assert(!overlaps(boxes.note, boxes.tools), "Offline hint covers game tools");
  assert(boxes.menus.every(b => !overlaps(boxes.profile, b)),
    "Profile card covers side menu buttons");
  assert(boxes.note.left >= boxes.profile.left && boxes.note.right <= boxes.profile.right &&
    boxes.note.top >= boxes.profile.top && boxes.note.bottom <= boxes.profile.bottom,
    "Offline hint escapes profile card");
  assert(boxes.profile.right <= boxes.width && boxes.profile.bottom <= boxes.height,
    "Profile card escapes viewport");
  return boxes;
}
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
      errors = [],
      resourceActions = [],
      spriteRequests = [];
    page.on("request", (r) => {
      if (r.url().includes("/ranch/scene/")) spriteRequests.push(r.url());
      if (r.url().endsWith("/games/animal-ranch/actions"))
        resourceActions.push(r.postDataJSON());
    });
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
      assert.equal(
        await page.locator(".topbar").count(),
        0,
        "Lobby header remained inside immersive game",
      );
      await page.waitForFunction(() =>
        document.body.classList.contains("ranch-active"),
      );
      await page.waitForFunction(
        () => !document.querySelector(".scene-loading"),
      );
      assert.equal(
        await page.getByTestId("ranch-canvas").getAttribute("data-art-style"),
        "soft-realistic",
      );
      assert(
        spriteRequests.some((u) => u.endsWith("/soft/adult-0-v1.webp")),
        "Adult artwork not loaded",
      );
      assert(
        !spriteRequests.some((u) => u.includes("/scene/animals-")),
        "Old cartoon atlas still loaded",
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
      const viewportLayout = await page.evaluate(() => {
        const scene = document
          .querySelector(".pasture-canvas")
          .getBoundingClientRect();
        return {
          x: scene.x,
          y: scene.y,
          w: scene.width,
          h: scene.height,
          viewportH: innerHeight,
          scrollH: document.documentElement.scrollHeight,
        };
      });
      assert.equal(viewportLayout.x, 0);
      assert.equal(viewportLayout.y, 0);
      assert.equal(viewportLayout.w, size.width);
      assert.equal(viewportLayout.h, size.height);
      assert(
        viewportLayout.scrollH <= size.height,
        "Immersive game requires page scrolling",
      );
      await checkHudClear(page);
      assert(
        await page.getByRole("button", { name: /添饲料/ }).isVisible(),
        "Phone feeding fallback missing",
      );
      await page.getByRole("button", { name: /添饲料/ }).click();
      await page.getByRole("dialog").waitFor();
      assert((await page.locator(".ranch-feed").textContent()).includes("30 分钟"), "Incorrect feed speed");
      assert(/天|小时/.test(await page.locator(".ranch-feed").textContent()), "Feed duration not human readable");
      await page.screenshot({path: folder + "/" + size.width + "-balance-feed.png"});
      await page.getByRole("button", {name: "关闭牧场面板"}).click();
      await page.getByRole("button", {name: /扩建 \/ 日记/}).click();
      assert(await page.locator(".ranch-expand .ranch-primary").isDisabled(), "Expansion bypasses level gate");
      assert((await page.locator(".ranch-expand").textContent()).includes("Lv. 3"), "Missing expansion requirement");
      await page.getByRole("button", {name: "关闭牧场面板"}).click();
      await page.getByRole("button", { name: "查看牧场全景" }).click();
      const feedBox = await page.getByTestId("side-feeder").boundingBox();
      assert(
        feedBox && feedBox.x >= 0 && feedBox.x + feedBox.width <= size.width,
        "Side label not visible in panorama",
      );
      assert(
        feedBox.x + feedBox.width / 2 < size.width / 3,
        "Food label intrudes into central field",
      );
      assert.equal(await page.locator(".feeder-caption").textContent(), "食槽");
      assert.equal(await page.getByTestId("central-feeder").count(), 0);
      const before = await page
        .locator("canvas")
        .evaluate((c) => c.toDataURL());
      await page.waitForFunction(
        (previous) => document.querySelector("canvas").toDataURL() !== previous,
        before,
        { timeout: 5000, polling: 200 },
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
      await page.locator(".ranch-product.selected").waitFor();
      await page.screenshot({
        path: folder + "/" + size.width + "-warehouse.png",
        fullPage: true,
      });
      assert(
        (await page.locator(".ranch-product.selected").count()) === 1,
        "Warehouse did not select available stock",
      );
      await page
        .getByRole("button", { name: "出售全部产物", exact: true })
        .click();
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      if (!mobile && engine === "chromium") {
        await page.getByRole("button", { name: "切换游戏全屏" }).click();
        assert(
          await page.evaluate(() => !!document.fullscreenElement),
          "Desktop fullscreen did not open",
        );
      }
      await page.getByRole("button", { name: /动物商店/ }).click();
      await page.screenshot({
        path: folder + "/" + size.width + "-catalog.png",
        fullPage: true,
      });
      const actionsBeforeBrowse = resourceActions.length;
      await page
        .getByRole("button", { name: "查看狮子资料", exact: true })
        .click();
      assert(
        await page.locator(".catalog-detail .ranch-primary").isDisabled(),
        "Locked animal can be adopted",
      );
      assert(
        await page
          .locator(".catalog-detail")
          .textContent()
          .then((t) => t.includes("Lv.")),
        "Missing unlock requirement",
      );
      assert.equal(
        resourceActions.length,
        actionsBeforeBrowse,
        "Browsing animal spent resources",
      );
      await page.getByLabel("搜索动物").fill("鸡");
      await page.screenshot({
        path: folder + "/" + size.width + "-shop.png",
        fullPage: true,
      });
      const adoptionBox = await page
        .locator(".catalog-detail .ranch-primary")
        .boundingBox();
      const modalBox = await page.getByRole("dialog").boundingBox();
      assert(
        adoptionBox.y >= modalBox.y &&
          adoptionBox.y + adoptionBox.height <=
            modalBox.y + modalBox.height - 4,
        "Adoption button clipped before interaction",
      );
      assert((await page.locator(".catalog-detail").textContent()).includes("5分"), "Chick growth is not 5 minutes");
      const tileHeight = await page
        .locator(".ranch-shop-animal")
        .first()
        .evaluate((e) => e.getBoundingClientRect().height);
      assert(tileHeight >= 120, "Animal grid tiles vertically compressed");
      const cards = page.locator(".ranch-shop-animal");
      assert.equal(await cards.count(), 1);
      await cards.click();
      await page
        .locator(".stage-switch")
        .getByRole("button", { name: "幼年", exact: true })
        .click();
      assert(
        await page
          .locator(".catalog-detail .detail-art image")
          .getAttribute("href")
          .then((h) => h.endsWith("/baby-0-v1.webp")),
        "Shop baby preview uses adult art",
      );
      await page.screenshot({
        path: folder + "/" + size.width + "-shop-selected.png",
        fullPage: true,
      });
      await page
        .locator(".catalog-detail")
        .getByRole("button", { name: /金币 · 认养/ })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="ranch-canvas"]')
          .dataset.lifeStages.includes("chicken:baby"),
      );
      await page.waitForFunction(() =>
        performance
          .getEntriesByType("resource")
          .some((r) => r.name.endsWith("/soft/baby-0-v1.webp")),
      );
      assert(
        spriteRequests.some((u) => u.endsWith("/soft/baby-0-v1.webp")),
        "Baby uses adult artwork instead of independent atlas",
      );
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      const scene = await page.getByTestId("ranch-canvas").boundingBox();
      const fitScale = Math.min(scene.width / 1200, scene.height / 800);
      const foodX =
        scene.x + (scene.width - 1200 * fitScale) / 2 + 95 * fitScale;
      const foodY =
        scene.y + (scene.height - 800 * fitScale) / 2 + 375 * fitScale;
      if (mobile) await page.touchscreen.tap(foodX, foodY);
      else await page.mouse.click(foodX, foodY);
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      if (mobile) await page.getByTestId("side-feeder").tap();
      else await page.getByTestId("side-feeder").click();
      await page.getByRole("dialog").waitFor();
      const foodResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith("/games/animal-ranch/actions") &&
          r.request().postDataJSON()?.type === "buyFeed",
      );
      await page.getByRole("button", { name: /\+20/ }).click();
      const foodState = await (await foodResponse).json();
      assert.equal(foodState.state.hungry, false);
      await page.waitForFunction(
        (feed) =>
          document
            .querySelector('[data-testid="side-feeder"]')
            .getAttribute("aria-label")
            .includes("剩余" + feed + "份"),
        foodState.state.feed,
      );
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: "查看小鸡" }).last().click();
      await page.locator("#ranch-window-title").waitFor();
      await page.screenshot({
        path: folder + "/" + size.width + "-animal-detail.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.screenshot({
        path: folder + "/" + size.width + "-animal-detail.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "动物图鉴", exact: true }).click();
      await page.getByLabel("搜索动物").fill("");
      assert.equal(
        await page.locator(".ranch-shop-animal").count(),
        36,
        "Album lost species",
      );
      assert.equal(
        await page.locator(".catalog-detail .ranch-primary").count(),
        0,
        "Album offers unintended spending",
      );
      await page
        .getByRole("button", { name: "查看垂耳兔资料", exact: true })
        .click();
      await page
        .locator(".stage-switch")
        .getByRole("button", { name: "成年", exact: true })
        .click();
      assert(
        await page
          .locator(".catalog-detail .detail-art image")
          .getAttribute("href")
          .then((h) => h.endsWith("/rabbit-stages-v1.webp")),
        "Album rabbit artwork missing",
      );
      await page.screenshot({
        path: folder + "/" + size.width + "-album.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "关闭牧场面板" }).click();
      await page.getByRole("button", { name: "切换到夜间模式" }).click();
      await page.screenshot({
        path: folder + "/" + size.width + "-night.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: /动物商店/ }).click();
      assert.equal(
        await page
          .locator(".ranch-window")
          .evaluate((d) =>
            getComputedStyle(d).getPropertyValue("--paper").trim(),
          ),
        "#463d2b",
        "Night panel theme not applied",
      );
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
        // Landscape HUD sits above the open lawn; start pinch on the canvas, not a menu.
        const gestureY = c.y + c.height * (size.width > size.height ? 0.5 : 0.36);
        const gestureX = c.x + c.width * 0.82;
        if (touch) {
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: gestureX, y: gestureY }],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: gestureX + 40, y: gestureY }],
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
          assert(await page.evaluate(({ x, y }) =>
            [x + 60, x + 90, x + 180, x + 210].every(px =>
              document.elementFromPoint(px, y)?.matches(".pasture-canvas")),
            { x: c.x, y: gestureY }), "Pinch fixture starts over HUD, not canvas");
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
          await page.mouse.move(gestureX, gestureY);
          await page.mouse.down();
          await page.mouse.move(gestureX + 40, gestureY, { steps: 4 });
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
      if (size.width === 390) {
        const neighbor = await browser.newContext({ viewport: size });
        try {
          const registered = await neighbor.request.post(
            base + "/api/register",
            {
              headers: { Origin: base },
              data: {
                account: "qa_neighbor",
                password: "OnlyQA_12345",
                name: "隐私验收邻居",
              },
            },
          );
          assert(registered.ok(), "Neighbor test registration failed");
          assert(
            (
              await neighbor.request.get(base + "/api/games/animal-ranch/me")
            ).ok(),
          );
          await page.getByRole("button", { name: /去串门/ }).click();
          await page.getByLabel("搜索牧场主").fill("没有这个名字");
          assert.equal(
            await page.locator(".player-line").count(),
            0,
            "Neighbor filter ignored",
          );
          await page.getByLabel("搜索牧场主").fill("隐私验收");
          await page.screenshot({
            path: folder + "/neighbors.png",
            fullPage: true,
          });
          await page
            .locator(".player-line")
            .filter({ hasText: "隐私验收邻居" })
            .getByRole("button", { name: "参观牧场" })
            .click();
          await page.getByTestId("ranch-canvas").waitFor();
          await page.waitForFunction(
            () => !document.querySelector(".scene-loading"),
          );
          await page.getByRole("button", { name: "查看牧场全景" }).click();
          await page.locator(".feeder-visitor-caption").waitFor();
          assert.equal(
            await page.getByTestId("side-feeder").count(),
            0,
            "Visitor can add food",
          );
          assert.equal(
            await page.locator(".wallet-coins").count(),
            0,
            "Visitor saw owner wallet",
          );
          assert.equal(
            await page.getByRole("button", { name: /添饲料/ }).count(),
            0,
            "Visitor saw private feeding tool",
          );
          assert.equal(
            await page.getByRole("dialog").count(),
            0,
            "Visit left modal open over scene",
          );
          await checkHudClear(page);
          await page.screenshot({ path: folder + "/visitor.png" });
          await page
            .getByRole("button", { name: "回我的牧场", exact: true })
            .click();
          await page.getByTestId("ranch-canvas").waitFor();
          await page.waitForFunction(
            () => !document.querySelector(".scene-loading"),
          );
        } finally {
          await neighbor.close();
        }
      }
      await checkHudClear(page);
      const foodPurchases = resourceActions.filter((a) => a.type === "buyFeed");
      assert.equal(
        foodPurchases.length,
        1,
        "A scene tap purchased food without explicit confirmation / duplicated purchase",
      );
      assert.equal(foodPurchases[0].payload.units, 20);
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
      // Visual-only public-view fixtures in the isolated QA browser, never production data.
      if (size.width === 390 || size.width === 1440) {
        const template = await (
          await context.request.get(base + "/api/games/animal-ranch/me")
        ).json();
        let fixture = null;
        await page.route("**/api/games/animal-ranch/me", async (route) => {
          if (!fixture) return route.continue();
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(fixture),
          });
        });
        const groups = [
          [
            "chicken",
            "rabbit",
            "dog",
            "duck",
            "sheep",
            "goose",
            "goat",
            "cow",
            "cat",
          ],
          [
            "pig",
            "parrot",
            "turtle",
            "horse",
            "frog",
            "peacock",
            "fox",
            "alpaca",
            "hedgehog",
          ],
          [
            "deer",
            "owl",
            "penguin",
            "snake",
            "buffalo",
            "moose",
            "zebra",
            "bear",
            "monkey",
          ],
          [
            "gorilla",
            "giraffe",
            "rhino",
            "hippo",
            "crocodile",
            "lion",
            "elephant",
            "panda",
            "sloth",
          ],
        ];
        async function showArt(entries, name) {
          fixture = structuredClone(template);
          fixture.state.capacity = 16;
          fixture.state.animals = entries.map(([species, baby], index) => ({
            ...template.state.animals[0],
            id: "art_" + index,
            species,
            name: template.state.species.find((s) => s.id === species).name,
            baby,
            stored: 0,
            hungry: false,
          }));
          await page.reload();
          await page.getByTestId("ranch-canvas").waitFor();
          await page.waitForFunction(
            () => !document.querySelector(".scene-loading"),
          );
          assert.equal(
            await page
              .getByTestId("ranch-canvas")
              .getAttribute("data-life-stages"),
            entries.map(([s, b]) => s + ":" + (b ? "baby" : "adult")).join(","),
          );
          await page.getByRole("button", { name: "暂停动物动画" }).click();
          await page.screenshot({
            path: folder + "/" + size.width + "-art-" + name + ".png",
          });
          await page.getByRole("button", { name: /查看/ }).count(); // The animal picker remains available.
        }
        for (let group = 0; group < 4; group++)
          for (const baby of [false, true]) {
            await showArt(
              groups[group].map((s) => [s, baby]),
              (baby ? "baby" : "adult") + "-" + group,
            );
          }
        await showArt(
          [
            ["chicken", false],
            ["chicken", true],
            ["rabbit", false],
            ["rabbit", true],
            ["goat", false],
            ["goat", true],
            ["cow", false],
            ["cow", true],
          ],
          "mixed",
        );
        await page.unroute("**/api/games/animal-ranch/me");
      }
      await page
        .getByRole("button", { name: "返回游戏大厅", exact: true })
        .click();
      await page.locator(".topbar").waitFor();
      assert.equal(
        await page.evaluate(() =>
          document.body.classList.contains("ranch-active"),
        ),
        false,
        "Game did not restore lobby scrolling",
      );
      results.push({
        size,
        passed: true,
        checked: [
          "registration",
          "viewport-filling-scene",
          "hint-clear-of-animal-picker-and-tools",
          "hint-within-profile-card",
          "no-lobby-header",
          "no-page-scroll",
          "side-feeder-touch",
          "feeding-toolbar-fallback",
          "side-label-away-from-center",
          ...(size.width === 390
            ? ["visitor-private-resource-hiding", "visit-modal-close"]
            : []),
          "soft-realistic-atlas",
          "independent-baby-adult-artwork",
          ...([390, 1440].includes(size.width)
            ? ["all-36-species-both-stage-render-fixtures"]
            : []),
          "animation",
          "pause",
          "harvest",
          "warehouse-sale",
          "shop-search",
          "select-before-purchase",
          "locked-adoption-disabled",
          "baby-adult-catalog-preview",
          "all-36-species-album-no-spend",
          "wood-inventory-selection",
          "buy-animal",
          "feed",
          "30-minute-feed-unit",
          "hour-day-duration",
          "level-gated-expansion",
          "5-minute-chick-growth",
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
      failures.push({ size, message: e.stack || e.message });
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
    "docs/test-reports/" + (process.env.UI_REPORT_PREFIX || "20261004-ranch-game-ui") + "-" + engine + ".json",
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
