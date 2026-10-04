import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  species,
  initialRanch,
  settleRanch,
  ranchAction,
  ranchView,
  MINUTE,
} from "../apps/api/src/games/animal-ranch/engine.js";
test("牧场：36 独立物种、可用资产、等级与差异化参数", () => {
  assert.equal(species.length, 36);
  assert.equal(new Set(species.map((s) => s.id)).size, 36);
  assert.deepEqual(
    new Set(species.map((s) => s.category)),
    new Set(["farm", "pets", "zoo"]),
  );
  const svg = new Set([
    "cat",
    "sheep",
    "goose",
    "fox",
    "deer",
    "alpaca",
    "peacock",
    "hedgehog",
    "turtle",
    "lion",
  ]);
  for (const s of species) {
    assert.ok(s.description.length > 8);
    assert.ok(s.growthMs > 0 && s.cycleMs > 0 && s.price > 0 && s.yield > 0);
    assert.ok(
      existsSync(
        "apps/web/public/ranch/" + s.id + (svg.has(s.id) ? ".svg" : ".png"),
      ),
    );
    assert.ok(s.sellPrice * s.yield > s.cycleMs / MINUTE);
  }
  assert.ok(new Set(species.map((s) => s.growthMs)).size > 20);
  const fresh = initialRanch(1000);
  assert.throws(
    () => ranchAction(fresh, "buyAnimal", { species: "panda" }),
    /未解锁/,
  );
  const unlock = { ...fresh, xp: 17 * 80, coins: 100000 };
  const bought = ranchAction(unlock, "buyAnimal", { species: "panda" });
  assert.equal(bought.animals.at(-1)?.species, "panda");
  assert.equal(
    bought.animals.at(-1)?.growthMs,
    species.find((s) => s.id === "panda")!.growthMs,
  );
});
test("牧场：离线、饲料耗尽、分段结算、满产物上限与时钟回拨", () => {
  const fresh = initialRanch(0);
  fresh.animals[0]!.stored = 0;
  fresh.feedMs = 5 * MINUTE;
  const whole = settleRanch(fresh, 0, 24 * 60 * MINUTE);
  assert.equal(whole.feedMs, 0);
  assert.equal(whole.animals[0]!.ageMs, fresh.animals[0]!.ageMs + 5 * MINUTE);
  assert.equal(whole.animals[0]!.stored, 3);
  const p = settleRanch(fresh, 0, 2 * MINUTE),
    split = settleRanch(p, 2 * MINUTE, 24 * 60 * MINUTE);
  assert.deepEqual(split, whole);
  assert.deepEqual(settleRanch(whole, whole.at, whole.at - 1000), whole);
  const full = initialRanch(0);
  full.feedMs = 160 * MINUTE;
  const long = settleRanch(full, 0, 80 * MINUTE);
  assert.equal(long.animals[0]!.stored, long.animals[0]!.maxStored);
  const fed = ranchAction(whole, "buyFeed", { units: 20 });
  const resumed = settleRanch(fed, fed.at, fed.at + MINUTE);
  assert.equal(resumed.animals[0]!.ageMs, whole.animals[0]!.ageMs + MINUTE);
});
test("牧场：认养收获出售扩建循环、输入校验与主人访客权限", () => {
  let s = initialRanch(0);
  s = ranchAction(s, "harvest", {});
  assert.equal(s.inventory.egg, 3);
  assert.equal(s.animals[0]!.stored, 0);
  assert.equal(s.xp, 12);
  s = ranchAction(s, "sellProducts", {});
  assert.equal(s.coins, 836);
  s = ranchAction(s, "buyAnimal", { species: "chicken" });
  assert.equal(s.coins, 716);
  assert.equal(s.animals.length, 2);
  s = ranchAction(s, "upgrade", {});
  assert.equal(s.capacity, 6);
  assert.equal(s.coins, 416);
  assert.throws(() => ranchAction(s, "buyFeed", { units: -1 }), /有效/);
  assert.throws(
    () => ranchAction(s, "buyAnimal", { species: "chicken", quantity: "1" }),
    /1–5/,
  );
  assert.throws(
    () => ranchAction(s, "buyAnimal", { species: "__proto__" }),
    /有效/,
  );
  assert.throws(() => ranchAction(s, "harvest", { owner: "other" }), /参数/);
  assert.throws(
    () => ranchAction(s, "sellProducts", { product: "fake" }),
    /不存在/,
  );
  const view = ranchView(s, false);
  for (const name of ["coins", "xp", "inventory", "log", "feed", "feedMs"])
    assert.equal((view as unknown as Record<string, unknown>)[name], undefined);
  assert.equal(view.animals.length, 2);
  assert.equal(view.species.length, 36);
});
