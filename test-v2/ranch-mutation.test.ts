import test from "node:test";
import assert from "node:assert/strict";
import {
  initialRanch,
  newAnimal,
  ranchAction,
  settleRanch,
  species,
  ranchView,
  type RanchState,
} from "../apps/api/src/games/animal-ranch/engine.js";
import {
  prepareFeatures,
  rollMutation,
  mutationProbability,
  priceMilli,
  grantDew,
  fusionPreview,
  fuse,
  discover,
} from "../apps/api/src/games/animal-ranch/mutation.js";
const fail = () => 0.999999;
function rolls(values: number[]) {
  let i = 0;
  return () => {
    assert(i < values.length, "unexpected random roll");
    return values[i++]!;
  };
}
function fresh() {
  const s = initialRanch(0);
  s.animals = [];
  s.batches = [];
  s.events = [];
  s.coins = 100000;
  s.feedMs = 1000 * 1800000;
  return s;
}
function hall(s: RanchState, id: string, grade = 0, attributes: string[] = []) {
  const a = newAnimal(id, species[0]!, 0);
  a.status = "hall";
  a.completedRounds = a.maxRounds;
  a.completedAt = 1;
  a.stored = 0;
  a.grade = grade;
  a.attributes = attributes;
  a.nickname = "伙伴" + id;
  s.animals.push(a);
  s.hallCount++;
  prepareFeatures(s);
  return a;
}
test("变异：购买与成年独立一次，重复结算不重抽，双属性不重复且品质只升不降", () => {
  const base = fresh();
  const bought = ranchAction(
    base,
    "buyAnimal",
    { species: "chicken" },
    rolls([0, 0, 0.99]),
  );
  const a = bought.animals[0]!;
  assert.equal(a.purchaseRoll, "success");
  assert.equal(a.grade, 3);
  assert.deepEqual(a.attributes, ["lightning"]);
  const adult = settleRanch(bought, 0, a.growthMs, rolls([0, 0, 0]));
  assert.equal(adult.animals[0]!.adultRoll, "success");
  assert.equal(adult.animals[0]!.grade, 3);
  assert.deepEqual(adult.animals[0]!.attributes, ["fire", "lightning"]);
  const repeated = settleRanch(adult, adult.at, adult.at + 1, () => {
    throw Error("rerolled");
  });
  assert.equal(repeated.events.filter((e) => e.type === "mutation").length, 2);
  assert.equal(base.animals.length, 0, "engine must not mutate input");
});
test("概率：实际图鉴组合和完成物种里程碑，10%至30%，重复与预览不增长", () => {
  const s = fresh();
  assert.equal(mutationProbability(s), 1000);
  for (const k of species.slice(0, 30)) {
    s.features!.completedSpecies.push(k.id);
    for (const attrs of [
      [],
      ["fire"],
      ["water"],
      ["gold"],
      ["dream"],
      ["lightning"],
    ]) {
      const a = newAnimal(k.id + attrs.join(""), k);
      a.attributes = attrs;
      discover(s, a, "fixture", 0);
      discover(s, a, "fixture", 0);
    }
  }
  assert.equal(
    Object.values(s.features!.codex).filter((e) => e.attributes.length).length,
    150,
  );
  assert.equal(mutationProbability(s), 3000);
  const legacy = fresh();
  legacy.animals = [newAnimal("legacy", species[0]!, 0)];
  legacy.features!.epoch = 3600000;
  prepareFeatures(legacy);
  rollMutation(legacy, legacy.animals[0]!, "adult", 300000, () => {
    throw Error("old event rerolled");
  });
  assert.equal(legacy.animals[0]!.adultRoll, "skipped");
});
test("产物：冻结属性售价，分批与整批出售定点守恒，锁定跳过，旧库存不重新定价", () => {
  const s = fresh();
  const a = newAnimal("a", species[0]!, 0);
  a.grade = 4;
  a.attributes = ["gold", "dream"];
  assert.equal(priceMilli(a), 2200);
  s.lots = [
    {
      id: "lot",
      animalId: null,
      product: "egg",
      quantity: 7,
      price: 1,
      priceMilli: 1050,
      grade: 0,
      attributes: ["water"],
      locked: false,
      at: 0,
    },
  ];
  const one = ranchAction(s, "sellProducts", { lotIds: ["lot"], quantity: 7 });
  let split = s;
  for (let i = 0; i < 7; i++)
    split = ranchAction(split, "sellProducts", {
      lotIds: ["lot"],
      quantity: 1,
    });
  assert.equal(one.coins, split.coins);
  assert.equal(one.features!.remainder, 350);
  assert.equal(split.features!.remainder, 350);
  const locked = ranchAction(s, "setInventoryLock", {
    lotIds: ["lot"],
    locked: true,
  });
  assert.throws(() => ranchAction(locked, "sellProducts", {}), /没有可出售/);
  assert.throws(
    () => ranchAction(s, "sellProducts", { quantity: 8 }),
    /数量不足/,
  );
  s.lots[0]!.priceMilli = undefined;
  assert.equal(ranchAction(s, "sellProducts", {}).coins - s.coins, 7);
});
test("晶露：按上海产出日，每动物每日1枚，全牧场每日3枚，赠送和启用前不发", () => {
  const s = fresh();
  s.features!.epoch = 1;
  const day = Date.UTC(2026, 9, 5, 15, 59);
  for (let i = 0; i < 4; i++) {
    const a = newAnimal("a" + i, species[0]!);
    grantDew(s, a, { at: day, round: 1 });
    grantDew(s, a, { at: day, round: 2 });
  }
  assert.equal(s.features!.dew, 3);
  grantDew(s, newAnimal("a0", species[0]!), { at: day + 120000, round: 3 });
  assert.equal(s.features!.dew, 4);
  grantDew(s, newAnimal("gift", species[0]!), { at: day, round: 0 });
  grantDew(s, newAnimal("old", species[0]!), { at: 0, round: 1 });
  assert.equal(s.features!.dew, 4);
});
test("融合：2/2/3/3阶梯，稳定主身份、成本、终身档案，珍藏拒绝，不恢复生产", () => {
  for (let grade = 0; grade < 4; grade++) {
    const s = fresh();
    s.features!.dew = 100;
    const n = grade >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) hall(s, "a" + i, grade, ["fire"]);
    const p = {
      recipeVersion: 1,
      animalIds: s.animals.map((a) => a.id),
      mainAnimalId: "a0",
      mode: "inherit",
    };
    const v = fusionPreview(s, p),
      coins = s.coins;
    assert.equal(v.dew, [0, 3, 12, 48][grade]);
    fuse(s, p, () => {
      throw Error("inherit rerolled");
    });
    assert.equal(s.animals[0]!.id, "a0");
    assert.equal(s.animals[0]!.nickname, "伙伴a0");
    assert.equal(s.animals[0]!.grade, grade + 1);
    assert.equal(s.animals[0]!.status, "hall");
    assert.equal(s.coins, coins - v.coins);
    assert.equal(s.animals.filter((a) => a.status === "fused").length, n - 1);
    assert.equal(s.hallCount, 1);
    assert.throws(() => fuse(s, p), /材料|需要/);
  }
  const s = fresh();
  hall(s, "a");
  hall(s, "b");
  s.animals[1]!.protected = true;
  assert.throws(
    () =>
      fusionPreview(s, {
        recipeVersion: 1,
        animalIds: ["a", "b"],
        mainAnimalId: "a",
        mode: "inherit",
      }),
    /珍藏/,
  );
});
test("随机融合：单属性可重新随机，双属性保留一个，不增加槽，预览无随机无写入", () => {
  const s = fresh();
  s.features!.dew = 99;
  hall(s, "a", 0, ["fire", "water"]);
  hall(s, "b", 0, ["dream"]);
  const p = {
    recipeVersion: 1,
    animalIds: ["a", "b"],
    mainAnimalId: "a",
    mode: "random",
    retainedAttribute: "water",
  };
  const before = structuredClone(s);
  const v = fusionPreview(s, p);
  assert.deepEqual(s, before);
  assert.equal(v.dew, 1);
  fuse(s, p, () => 0);
  assert.deepEqual(s.animals[0]!.attributes, ["lightning", "water"]);
  assert.equal(s.features!.dew, 98);
  const single = fresh();
  single.features!.dew = 1;
  hall(single, "a", 0, ["fire"]);
  hall(single, "b");
  fuse(single, { ...p, retainedAttribute: undefined }, () => 0.99);
  assert.deepEqual(single.animals[0]!.attributes, ["dream"]);
});
test("隐私、追踪与珍藏：访客隐藏概率/库存/材料/判定，目标最多3项且不发资源", () => {
  const s = fresh();
  hall(s, "a");
  const view = ranchView(s, false);
  assert.equal(view.mutation, undefined);
  assert.equal(view.animals[0]?.purchaseRoll, undefined);
  let t = ranchAction(s, "trackCollectionGoal", {
    goalId: "dual",
    tracked: true,
  });
  assert.equal(t.features!.tracked.length, 3);
  assert.throws(
    () =>
      ranchAction(t, "trackCollectionGoal", {
        goalId: "legendary",
        tracked: true,
      }),
    /最多/,
  );
  assert.equal(t.coins, s.coins);
  t = ranchAction(t, "setAnimalProtected", { animalId: "a", protected: true });
  assert.throws(() => ranchAction(t, "sellAnimal", { animalId: "a" }), /珍藏/);
  assert.throws(
    () => ranchAction(t, "releaseAnimal", { animalId: "a" }),
    /珍藏/,
  );
});
test("离线等价：按相同随机序列整体和分段得到相同属性、批次及完成时间", () => {
  const s = fresh();
  s.animals = [newAnimal("a", species[0]!), newAnimal("b", species[1]!)];
  prepareFeatures(s);
  const whole = settleRanch(s, 0, 4200000, rolls([0, 0, 0.5, 0, 0.8, 0.9]));
  let split = s;
  const rng = rolls([0, 0, 0.5, 0, 0.8, 0.9]);
  for (const t of [1000, 300000, 600000, 1300000, 4200000])
    split = settleRanch(split, split.at, t, rng);
  assert.deepEqual(split, whole);
  assert.deepEqual(whole.features!.completedSpecies, ["chicken", "rabbit"]);
  assert.equal(whole.features!.goals["first-variant"], 300000);
});
test("稳定收集：重抽失败不会降级或删除既有发现，最高品质可以更新同组合", () => {
  const s = fresh();
  const a = newAnimal("a", species[0]!);
  a.grade = 2;
  a.attributes = ["fire"];
  a.adultRoll = "pending";
  s.animals = [a];
  prepareFeatures(s);
  rollMutation(s, a, "adult", 300000, fail);
  assert.equal(a.grade, 2);
  assert.deepEqual(a.attributes, ["fire"]);
  a.grade = 4;
  discover(s, a, "fusion", 500000);
  assert.equal(s.features!.codex["chicken:fire"]!.grade, 4);
});
