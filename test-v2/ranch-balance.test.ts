import test from "node:test";
import assert from "node:assert/strict";
import {
  initialRanch,
  settleRanch,
  ranchAction,
  ranchView,
  species,
  newAnimal,
  level,
} from "../apps/api/src/games/animal-ranch/engine.js";
import {
  FEED_UNIT_MS,
  HOUR,
  xpForLevel,
  EXPANSIONS,
} from "../packages/contracts/src/ranch-balance.js";
import { simulate } from "../scripts/ranch-balance-simulation.js";
test("平衡：逐级经验边界、邻居同一公式、极限经验速率也不能一下午解锁", () => {
  for (let l = 1; l <= 100; l++) {
    assert.equal(level(xpForLevel(l)), l);
    if (l > 1) assert.equal(level(xpForLevel(l) - 1), l - 1);
  }
  const fastest = Math.max(
    ...species.map((k) => (k.yield * k.harvestXp) / (k.cycleMs / HOUR)),
  );
  const upperBound = 12 + 16 * fastest * 6;
  assert.ok(level(upperBound) < 8);
  assert.ok((xpForLevel(20) - 12) / (16 * fastest * 24) > 24);
});
test("平衡：4只初始食槽30小时、16只满槽31小时、毫秒分段结算守恒", () => {
  const s = initialRanch(0);
  for (let i = 0; i < 3; i++)
    s.animals.push(newAnimal("extra-" + i, species[0]!));
  assert.equal(ranchView(s, true).feedMinutes, 1800);
  const whole = settleRanch(s, 0, 29 * HOUR);
  assert.equal(whole.feedMs, 4 * HOUR);
  assert.equal(ranchView(whole, true).hungry, false);
  let split = s;
  for (const end of [1, 999, 60_123, 6 * HOUR + 13, 29 * HOUR])
    split = settleRanch(split, split.at, end);
  assert.deepEqual(split, whole);
  const exhausted = settleRanch(s, 0, 31 * HOUR);
  assert.equal(exhausted.feedMs, 0);
  assert.equal(ranchView(exhausted, true).hungry, true);
  s.feedMs = 1000 * FEED_UNIT_MS;
  while (s.animals.length < 16)
    s.animals.push(newAnimal("animal-" + s.animals.length, species[0]!));
  assert.equal(ranchView(s, true).feedMinutes, 1875);
});
test("平衡：幼崽8小时成年、成年6小时首产、离线不直接增加经验", () => {
  const s = initialRanch(0);
  s.animals = [newAnimal("baby", species[0]!)];
  const before = settleRanch(s, 0, 8 * HOUR - 1);
  assert.equal(ranchView(before, true).animals[0]!.baby, true);
  const adult = settleRanch(before, before.at, 8 * HOUR);
  assert.equal(ranchView(adult, true).animals[0]!.baby, false);
  assert.equal(adult.animals[0]!.stored, 0);
  const ready = settleRanch(adult, adult.at, 14 * HOUR);
  assert.equal(ready.animals[0]!.stored, 3);
  assert.equal(ready.xp, 0);
  const long = settleRanch(ready, ready.at, 60 * HOUR);
  assert.equal(long.animals[0]!.stored, 9);
  assert.equal(long.xp, 0);
});
test("平衡：循环买卖、扩建不加经验，升级有等级金币双重门槛", () => {
  let s = initialRanch(0);
  s.coins = 1000000;
  const xp = s.xp;
  for (let i = 0; i < 200; i++) {
    s = ranchAction(s, "buyAnimal", { species: "chicken" });
    s = ranchAction(s, "sellAnimal", { animalId: s.animals.at(-1)!.id });
  }
  assert.equal(s.xp, xp);
  for (const e of EXPANSIONS) {
    s.capacity = e.capacity;
    s.xp = xpForLevel(e.level) - 1;
    assert.throws(() => ranchAction(s, "upgrade", {}), /Lv\./);
    s.xp = xpForLevel(e.level);
    s.coins = e.cost - 1;
    assert.throws(() => ranchAction(s, "upgrade", {}), /金币/);
    s.coins = e.cost;
    const u = ranchAction(s, "upgrade", {});
    assert.equal(u.capacity, e.capacity + 2);
    assert.equal(u.coins, 0);
    assert.equal(u.xp, s.xp);
  }
});
test("平衡：饲料上限、未满20份空间不能购买、所有物种饲料净收益为正", () => {
  const s = initialRanch(0);
  s.feedMs = 981 * FEED_UNIT_MS;
  assert.throws(() => ranchAction(s, "buyFeed", { units: 20 }), /1000/);
  s.feedMs = 980 * FEED_UNIT_MS;
  assert.equal(
    ranchAction(s, "buyFeed", { units: 20 }).feedMs,
    1000 * FEED_UNIT_MS,
  );
  for (const k of species) {
    const daily = (k.sellPrice * k.yield * 24) / (k.cycleMs / HOUR) - 48;
    assert.ok(daily > 0, k.id);
    if (k.id !== "chicken")
      assert.ok(daily / k.price > 0.25 && daily / k.price < 0.31, k.id);
    assert.equal(k.buyXp, 0);
    assert.ok(k.growthMs >= 8 * HOUR);
    assert.ok(k.cycleMs >= 6 * HOUR);
  }
});
test("平衡：不足饲料时暂停可恢复、旧实例周期和旧食槽单位不追溯改写", () => {
  const s = initialRanch(0);
  s.feedMs = 0;
  s.animals[0]!.stored = 0;
  const idle = settleRanch(s, 0, 100 * HOUR);
  assert.equal(idle.animals[0]!.ageMs, s.animals[0]!.ageMs);
  const fed = ranchAction(idle, "buyFeed", { units: 20 });
  const resumed = settleRanch(fed, fed.at, fed.at + 6 * HOUR);
  assert.equal(resumed.animals[0]!.stored, 3);
  const legacy = structuredClone(s) as any;
  delete legacy.feedUnitMs;
  legacy.feedMs = 60_000 * 160;
  legacy.animals[0].cycleMs = 180_000;
  const result = settleRanch(legacy, 0, HOUR);
  assert.equal(result.animals[0]!.cycleMs, 180_000);
  assert.equal(ranchView(result, true).feed, 100);
});
test("平衡：真实引擎180天模拟，首日Lv2、全解锁需数周，日常策略无缺粮死锁", () => {
  for (const [step, strategy] of [
    [0.25, "xp"],
    [12, "income"],
    [24, "income"],
  ] as const) {
    const result = simulate(step, strategy);
    assert.equal(result.hungryVisits, 0);
    assert.ok(result.milestones["2"]! <= 1);
    assert.ok(
      result.milestones["20"]! >= 30 && result.milestones["20"]! <= 100,
    );
  }
});
