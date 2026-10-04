import test from "node:test";
import assert from "node:assert/strict";
import {
  species,
  initialRanch,
  newAnimal,
  settleRanch,
  ranchAction,
  ranchView,
  MINUTE,
} from "../apps/api/src/games/animal-ranch/engine.js";
import { HOUR, FEED_UNIT_MS } from "../packages/contracts/src/ranch-balance.js";
function fresh() {
  const s = initialRanch(0);
  s.animals = [newAnimal("test", species[0]!, 0)];
  s.batches = [];
  s.events = [];
  return s;
}
test("牧场目录：36个独立物种、分钟至24小时、有限轮次与完整生涯收益", () => {
  assert.equal(species.length, 36);
  assert.equal(new Set(species.map((k) => k.id)).size, 36);
  assert.equal(species[0]!.growthMs, 5 * MINUTE);
  for (const k of species) {
    assert.ok(k.growthMs > 0 && k.growthMs <= 24 * HOUR);
    assert.ok(k.cycleMs > 0 && k.cycleMs <= 24 * HOUR);
    assert.ok(k.maxRounds >= 4 && k.maxRounds <= 8);
    assert.ok(k.price > 0 && k.lifetimeXp > 0);
    assert.ok(
      k.sellPrice * k.yield * k.maxRounds >
        k.price + (k.growthMs + k.cycleMs * k.maxRounds) / FEED_UNIT_MS,
      k.id,
    );
  }
});
test("牧场结算：成年、首产、最后一轮边界及无限离线不会超产", () => {
  const s = fresh(),
    k = species[0]!;
  const pre = settleRanch(s, 0, k.growthMs - 1);
  assert.equal(pre.animals[0]!.status, "juvenile");
  const adult = settleRanch(pre, pre.at, k.growthMs);
  assert.equal(adult.animals[0]!.status, "producing");
  assert.equal(adult.animals[0]!.stored, 0);
  const first = settleRanch(adult, adult.at, k.growthMs + k.cycleMs);
  assert.equal(first.animals[0]!.stored, k.yield);
  const done = settleRanch(first, first.at, 100 * HOUR);
  assert.equal(done.animals[0]!.status, "completed");
  assert.equal(done.animals[0]!.completedRounds, k.maxRounds);
  assert.equal(done.animals[0]!.stored, k.yield * k.maxRounds);
  assert.equal(done.feedMs, s.feedMs - k.growthMs - k.maxRounds * k.cycleMs);
  assert.equal(done.xp, 0);
  assert.equal(settleRanch(done, done.at, 1000 * HOUR).feedMs, done.feedMs);
});
test("牧场暂停：缺粮、满存、恢复、时钟倒退与分段时间守恒", () => {
  const s = fresh();
  s.feedMs = 6 * MINUTE;
  const idle = settleRanch(s, 0, HOUR);
  assert.equal(idle.feedMs, 0);
  assert.equal(idle.animals[0]!.cycleProgressMs, MINUTE);
  const fed = ranchAction(idle, "buyFeed", { units: 20 });
  assert.equal(
    settleRanch(fed, fed.at, fed.at + 4 * MINUTE).animals[0]!.stored,
    3,
  );
  const full = fresh();
  full.animals = [
    newAnimal(
      "cow",
      species.find((k) => k.id === "cow")!,
    ),
  ];
  full.feedMs = 1000 * FEED_UNIT_MS;
  const whole = settleRanch(full, 0, 100 * HOUR);
  let split = full;
  for (const t of [1, 999, 60_123, 3 * HOUR, 19 * HOUR, 100 * HOUR])
    split = settleRanch(split, split.at, t);
  assert.deepEqual(split, whole);
  assert.deepEqual(settleRanch(whole, whole.at, 1), whole);
  const long = fresh();
  long.animals = [
    newAnimal(
      "slow",
      species.find((k) => k.id === "elephant")!,
    ),
  ];
  long.feedMs = 1000 * FEED_UNIT_MS;
  const paused = settleRanch(long, 0, 300 * HOUR);
  assert.equal(paused.animals[0]!.completedRounds, 3);
  assert.equal(paused.animals[0]!.status, "producing");
  const got = ranchAction(paused, "harvest", {});
  assert.equal(
    settleRanch(got, got.at, got.at + 24 * HOUR).animals[0]!.completedRounds,
    4,
  );
});
test("牧场动作：名宠堂/出售/放生保留身份、礼物零返还与昵称校验", () => {
  const done = settleRanch(fresh(), 0, HOUR);
  assert.throws(
    () => ranchAction(done, "enterHall", { animalId: "test" }),
    /先收获/,
  );
  const got = ranchAction(done, "harvest", {});
  assert.equal(got.xp, species[0]!.lifetimeXp);
  const hall = ranchAction(got, "enterHall", { animalId: "test" });
  assert.equal(hall.animals[0]!.status, "hall");
  assert.equal(ranchView(hall, true).animals.length, 0);
  assert.equal(settleRanch(hall, hall.at, 100 * HOUR).feedMs, hall.feedMs);
  assert.throws(
    () => ranchAction(hall, "enterHall", { animalId: "test" }),
    /完成全部/,
  );
  const named = ranchAction(hall, "renameAnimal", {
    animalId: "test",
    nickname: "团团",
  });
  assert.equal(named.animals[0]!.nickname, "团团");
  assert.throws(
    () =>
      ranchAction(hall, "renameAnimal", {
        animalId: "test",
        nickname: "<script>",
      }),
    /最多12/,
  );
  const sold = ranchAction(named, "sellAnimal", { animalId: "test" });
  assert.equal(sold.animals[0]!.status, "sold");
  assert.throws(
    () => ranchAction(sold, "releaseAnimal", { animalId: "test" }),
    /已经离开/,
  );
  assert.equal(
    ranchAction(named, "releaseAnimal", { animalId: "test" }).coins,
    named.coins,
  );
  let gift = initialRanch(0);
  gift = ranchAction(gift, "harvest", {});
  const coins = gift.coins;
  gift = ranchAction(gift, "sellAnimal", { animalId: gift.animals[0]!.id });
  assert.equal(gift.coins, coins);
  const view = ranchView(got, false);
  for (const k of ["coins", "xp", "inventory", "log", "feed"])
    assert.equal((view as any)[k], undefined);
  assert.equal(view.animals[0]!.saleCoins, undefined);
  assert.throws(
    () => ranchAction(got, "harvest", { owner: "someone" }),
    /参数/,
  );
  assert.throws(
    () => ranchAction(got, "buyAnimal", { species: "panda" }),
    /未解锁/,
  );
});

test("统一规则转换：旧动物切换新周期与价格，保留比例和既有资产，二次执行无变化", async () => {
  const old = await import("./ranch-v1-fixture.js");
  const { upgradeRanchRules } =
    await import("../apps/api/src/games/animal-ranch/migration.js");
  const s = old.initialRanch(0);
  s.coins = 3456;
  s.xp = 321;
  s.inventory = { egg: 12 };
  s.animals[0]!.paid = 120;
  s.animals[0]!.ageMs = s.animals[0]!.growthMs + s.animals[0]!.cycleMs / 2;
  const result = upgradeRanchRules(s, 72 * HOUR),
    a = result.state.animals[0]!;
  assert.equal(result.changed, 1);
  assert.equal(result.state.coins, 3456);
  assert.equal(result.state.xp, 321);
  assert.equal(result.state.feedMs, s.feedMs);
  assert.equal(a.growthMs, species[0]!.growthMs);
  assert.equal(a.cycleMs, species[0]!.cycleMs);
  assert.equal(a.cycleProgressMs, species[0]!.cycleMs / 2);
  assert.equal(a.paid, species[0]!.price);
  assert.equal(a.legacy, false);
  assert.equal(a.stored, 3);
  assert.equal(result.state.lots[0]!.quantity, 12);
  assert.equal(a.completedRounds, 0);
  assert.equal(upgradeRanchRules(result.state, 100 * HOUR).changed, 0);
  const v2 = structuredClone(result.state);
  v2.animals[0]!.legacy = true;
  v2.animals[0]!.cycleMs = 10 * HOUR;
  v2.animals[0]!.cycleProgressMs = 5 * HOUR;
  assert.equal(
    upgradeRanchRules(v2, 100 * HOUR).state.animals[0]!.cycleProgressMs,
    species[0]!.cycleMs / 2,
  );
});
