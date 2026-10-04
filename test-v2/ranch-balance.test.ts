import test from "node:test";
import assert from "node:assert/strict";
import {
  initialRanch,
  newAnimal,
  settleRanch,
  ranchAction,
  ranchView,
  species,
  level,
  saleCoins,
} from "../apps/api/src/games/animal-ranch/engine.js";
import {
  HOUR,
  FEED_UNIT_MS,
  xpForLevel,
  EXPANSIONS,
} from "../packages/contracts/src/ranch-balance.js";
import { simulate } from "../scripts/ranch-balance-simulation.js";
test("平衡：等级边界和食槽覆盖一天，完成释放消耗", () => {
  for (let l = 1; l < 100; l++) {
    assert.equal(level(xpForLevel(l)), l);
    if (l > 1) assert.equal(level(xpForLevel(l) - 1), l - 1);
  }
  const s = initialRanch(0);
  s.animals = [...Array(4)].map((_, i) => newAnimal("a" + i, species[0]!));
  s.batches = [];
  s.events = [];
  assert.equal(ranchView(s, true).feedMinutes, 1800);
  const done = settleRanch(s, 0, 30 * HOUR);
  assert.ok(done.feedMs > 0);
  assert.equal(ranchView(done, true).feedingAnimals, 0);
  assert.equal(ranchView(done, true).hungry, false);
});
test("平衡：重复买卖不刷XP、扩建双门槛、食槽上限", () => {
  let s = initialRanch(0);
  s.coins = 1000000;
  for (let i = 0; i < 100; i++) {
    s = ranchAction(s, "buyAnimal", { species: "chicken" });
    s = ranchAction(s, "sellAnimal", { animalId: s.animals.at(-1)!.id });
  }
  assert.equal(s.xp, 0);
  for (const e of EXPANSIONS) {
    s.capacity = e.capacity;
    s.xp = xpForLevel(e.level) - 1;
    assert.throws(() => ranchAction(s, "upgrade", {}), /Lv\./);
    s.xp = xpForLevel(e.level);
    s.coins = e.cost - 1;
    assert.throws(() => ranchAction(s, "upgrade", {}), /金币/);
    s.coins = e.cost;
    assert.equal(ranchAction(s, "upgrade", {}).capacity, e.capacity + 2);
  }
  s.feedMs = 981 * FEED_UNIT_MS;
  assert.throws(() => ranchAction(s, "buyFeed", { units: 20 }), /1000/);
});
test("平衡：完整生涯入堂也能回本，经验分摊不凭空增发", () => {
  for (const k of species) {
    const a = newAnimal("a", k),
      T = (k.growthMs + k.maxRounds * k.cycleMs) / HOUR;
    assert.ok(k.maxRounds * k.yield * k.sellPrice - k.price - 2 * T > 0, k.id);
    assert.ok(saleCoins(a) < a.paid);
    let xp = 0;
    for (let n = 1; n <= k.maxRounds; n++)
      xp +=
        Math.floor((n * k.lifetimeXp) / k.maxRounds) -
        Math.floor(((n - 1) * k.lifetimeXp) / k.maxRounds);
    assert.equal(xp, k.lifetimeXp);
  }
});
test("平衡：真实引擎模拟，首日不超过Lv5，不会一下午全解锁", () => {
  const fast = simulate(1 / 12, "xp", 30);
  assert.ok(
    (fast.snapshots[1] as any).level <= 5,
    JSON.stringify(fast.snapshots[1]),
  );
  assert.ok(fast.milestones["20"] === undefined || fast.milestones["20"] >= 7);
  const low = simulate(1 / 12, "low", 7);
  assert.ok(fast.finalLevel > low.finalLevel);
  const hall = simulate(4, "income", 30, "enterHall");
  assert.ok((hall.snapshots[30] as any).coins > 0);
  assert.equal(hall.hungryVisits, 0);
});
