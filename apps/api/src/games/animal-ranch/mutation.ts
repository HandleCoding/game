import { randomInt, randomUUID } from "node:crypto";
import { check } from "../../platform/errors.js";
import { ranchCatalog } from "../../../../../packages/contracts/src/ranch-catalog.js";
import type { Animal, RanchState } from "./engine.js";
export const ATTRS = ["lightning", "fire", "water", "gold", "dream"] as const;
export const ATTRIBUTE_NAMES = ["雷", "火", "水", "黄金", "梦幻"];
export const GRADES = ["普通", "优秀", "史诗", "传奇", "无双"];
export const RARITIES = ["common", "uncommon", "epic", "legendary", "supreme"];
export type Roll = () => number;
export const secureRoll: Roll = () => randomInt(1000000000) / 1000000000;
export interface CodexEntry {
  key: string;
  species: string;
  attributes: string[];
  grade: number;
  firstAt: number | null;
  source: string;
  seen: boolean;
}
export interface RanchFeatures {
  epoch: number;
  dew: number;
  remainder: number;
  fusionCount?: number;
  codex: Record<string, CodexEntry>;
  completedSpecies: string[];
  claims: Record<string, { count: number; animals: string[] }>;
  tracked: string[];
  goals: Record<string, number>;
  fusions: Record<string, unknown>[];
}
export const GOALS = [
  {
    id: "first-variant",
    name: "发现第一位变异伙伴",
    kind: "variant",
    target: 1,
  },
  { id: "five-variants", name: "发现5种变异组合", kind: "variant", target: 5 },
  { id: "dual", name: "发现双属性伙伴", kind: "dual", target: 1 },
  { id: "six-species", name: "完成6种动物的养殖", kind: "species", target: 6 },
  { id: "legendary", name: "收藏一位传奇或无双", kind: "grade", target: 3 },
  { id: "first-fusion", name: "完成一次名宠融合", kind: "fusion", target: 1 },
];
export function prepareFeatures(s: RanchState, now = s.at) {
  s.features ??= {
    epoch: now,
    dew: 0,
    remainder: 0,
    codex: {},
    completedSpecies: [],
    claims: {},
    tracked: ["first-variant", "six-species"],
    goals: {},
    fusions: [],
  };
  for (const a of s.animals) {
    a.grade ??= 0;
    a.attributes ??= [];
    a.protected ??= false;
    a.purchaseRoll ??= "skipped";
    a.adultRoll ??= a.status === "juvenile" ? "pending" : "skipped";
    discover(s, a, "legacy", a.createdAt);
  }
  for (const [id, v] of Object.entries(s.collection ?? {}))
    if (v?.completed && !s.features.completedSpecies.includes(id))
      s.features.completedSpecies.push(id);
  updateGoals(s);
  return s.features;
}
const threshold = (n: number, steps: number[]) =>
  steps.filter((k) => n >= k).length * 200;
export function mutationProbability(s: RanchState) {
  const f = s.features!;
  return Math.min(
    3000,
    1000 +
      threshold(f.completedSpecies.length, [6, 12, 18, 24, 30]) +
      threshold(
        Object.values(f.codex).filter((e) => e.attributes.length).length,
        [10, 30, 60, 100, 150],
      ),
  );
}
export function discover(
  s: RanchState,
  a: Animal,
  source: string,
  at: number | null,
) {
  const attributes = [...(a.attributes ?? [])].sort();
  const key = a.species + ":" + attributes.join("+");
  const prior = s.features!.codex[key];
  if (!prior)
    s.features!.codex[key] = {
      key,
      species: a.species,
      attributes,
      grade: a.grade ?? 0,
      firstAt: at,
      source,
      seen: source === "legacy",
    };
  else prior.grade = Math.max(prior.grade, a.grade ?? 0);
  updateGoals(s, at ?? s.at);
}
export function updateGoals(s: RanchState, at = s.at) {
  const f = s.features!;
  const entries = Object.values(f.codex);
  for (const g of GOALS) {
    const n =
      g.kind === "variant"
        ? entries.filter((e) => e.attributes.length).length
        : g.kind === "dual"
          ? entries.filter((e) => e.attributes.length === 2).length
          : g.kind === "species"
            ? f.completedSpecies.length
            : g.kind === "grade"
              ? Math.max(0, ...entries.map((e) => e.grade))
              : (f.fusionCount ?? 0);
    if (n >= g.target && f.goals[g.id] === undefined) f.goals[g.id] = at;
  }
}
function pick(weights: number[], rng: Roll) {
  let n = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    n -= weights[i]!;
    if (n < 0) return i;
  }
  return weights.length - 1;
}
export function rollMutation(
  s: RanchState,
  a: Animal,
  stage: "purchase" | "adult",
  at: number,
  rng: Roll = secureRoll,
) {
  const field = stage === "purchase" ? "purchaseRoll" : "adultRoll";
  if (a[field] !== "pending") return;
  if (at < s.features!.epoch) {
    a[field] = "skipped";
    return;
  }
  const probability = mutationProbability(s);
  a[field] = "failed";
  a.mutationRulesVersion = 1;
  if (rng() * 10000 < probability) {
    const weights = [25, 25, 25, 15, 10].map((w, i) =>
      a.attributes!.includes(ATTRS[i]!) ? 0 : w,
    );
    a.attributes!.push(ATTRS[pick(weights, rng)]!);
    a.attributes!.sort();
    const hours = (a.growthMs + a.maxRounds * a.cycleMs) / 3600000;
    const quality =
      hours <= 2
        ? [4000, 4200, 1500, 290, 10]
        : hours <= 24
          ? [3600, 4200, 1700, 450, 50]
          : hours <= 72
            ? [3200, 4200, 1800, 700, 100]
            : [2800, 4000, 2000, 800, 400];
    a.grade = Math.max(a.grade ?? 0, pick(quality, rng));
    a[field] = "success";
    a.rarityId = RARITIES[a.grade]!;
    a.variantId = a.attributes!.join("+");
    discover(s, a, stage, at);
  }
  s.events.push({
    id: a.id + ":mutation:" + stage,
    animalId: a.id,
    at,
    type: "mutation",
    message:
      (stage === "purchase" ? "认养" : "成年") +
      "变异判定 " +
      probability / 100 +
      "% · " +
      (a[field] === "success"
        ? GRADES[a.grade!] +
          " " +
          a
            .attributes!.map((k) => ATTRIBUTE_NAMES[ATTRS.indexOf(k as any)])
            .join("＋")
        : "未触发变异"),
  });
}
export function priceMilli(a: Animal) {
  const quality = [0, 1000, 2500, 5000, 10000][a.grade ?? 0]!;
  const attrs = Math.min(
    2000,
    (a.attributes ?? []).reduce(
      (n, k) => n + (k === "gold" ? 1000 : k === "dream" ? 1500 : 500),
      0,
    ),
  );
  return Number(
    (BigInt(a.sellPrice) * 1000n * BigInt(10000 + quality + attrs)) / 10000n,
  );
}
export function grantDew(
  s: RanchState,
  a: Animal,
  b: { at: number; round: number },
) {
  const f = s.features!;
  if (!b.round || b.at < f.epoch) return;
  const day = String(Math.floor((b.at + 8 * 3600000) / 86400000));
  const row = (f.claims[day] ??= { count: 0, animals: [] });
  if (row.count >= 3 || row.animals.includes(a.id)) return;
  row.count++;
  row.animals.push(a.id);
  f.dew++;
  s.events.push({
    id: a.id + ":dew:" + day,
    animalId: a.id,
    at: s.at,
    type: "material",
    message:
      "领取融合晶露1枚（产出日 " +
      new Date(b.at + 8 * 3600000).toISOString().slice(0, 10) +
      "）",
  });
}
export function fusionPreview(s: RanchState, p: Record<string, unknown>) {
  check(p.recipeVersion === 1, "配方版本已变化，请更新预览", 409);
  check(
    Array.isArray(p.animalIds) &&
      p.animalIds.length >= 2 &&
      p.animalIds.length <= 3 &&
      p.animalIds.every((x) => typeof x === "string") &&
      new Set(p.animalIds).size === p.animalIds.length,
    "请选择不同的材料伙伴",
  );
  const animals = p.animalIds.map((id) => s.animals.find((a) => a.id === id));
  check(animals.every(Boolean), "材料不存在或已变化", 409);
  const material = animals as Animal[];
  const main = material.find((a) => a.id === p.mainAnimalId);
  check(main, "请选择主伙伴");
  const grade = main.grade ?? 0;
  const required = grade >= 2 ? 3 : 2;
  check(
    grade < 4 && material.length === required,
    "需要" + required + "位同物种同品质伙伴",
  );
  check(
    material.every(
      (a) =>
        a.status === "hall" &&
        a.species === main.species &&
        (a.grade ?? 0) === grade &&
        !a.protected &&
        !a.stored,
    ),
    "材料已珍藏、已消耗或品质物种不同",
  );
  check(p.mode === "inherit" || p.mode === "random", "属性方式无效");
  if (p.mode === "random" && main.attributes!.length === 2)
    check(
      main.attributes!.includes(p.retainedAttribute as string),
      "请选择保留的属性",
    );
  const target = grade + 1;
  const dew =
    [0, 0, 3, 12, 48][target]! +
    (p.mode === "random" ? [0, 1, 2, 4, 8][target]! : 0);
  const coins = Math.ceil(
    ranchCatalog.find((k) => k.id === main.species)!.price *
      [0, 0.1, 0.25, 0.5, 1][target]!,
  );
  return {
    recipeVersion: 1,
    targetGrade: target,
    dew,
    coins,
    affordable: s.features!.dew >= dew && s.coins >= coins,
    attributes: [...main.attributes!],
    main,
    material,
  };
}
export function fuse(
  s: RanchState,
  p: Record<string, unknown>,
  rng: Roll = secureRoll,
) {
  const v = fusionPreview(s, p);
  check(v.affordable, "金币或融合晶露不足");
  const id = randomUUID();
  const before = v.material.map((a) => structuredClone(a));
  let attrs = [...v.main.attributes!];
  if (p.mode === "random") {
    const retained = attrs.length === 2 ? [p.retainedAttribute as string] : [];
    const weights = [25, 25, 25, 15, 10].map((w, i) =>
      retained.includes(ATTRS[i]!) ? 0 : w,
    );
    attrs = [...retained, ATTRS[pick(weights, rng)]!].sort();
  }
  s.coins -= v.coins;
  s.features!.dew -= v.dew;
  for (const a of v.material)
    if (a !== v.main) {
      a.status = "fused";
      a.display = false;
      a.exitAt = s.at;
      s.hallCount--;
      s.events.push({
        id: id + ":" + a.id,
        animalId: a.id,
        at: s.at,
        type: "fusion",
        message:
          "融合为「" +
          (v.main.nickname || v.main.species) +
          "」 · " +
          v.main.id,
      });
    }
  v.main.grade = v.targetGrade;
  v.main.attributes = attrs;
  v.main.rarityId = RARITIES[v.targetGrade]!;
  v.main.variantId = attrs.join("+");
  s.features!.fusionCount = (s.features!.fusionCount ?? 0) + 1;
  s.features!.fusions.push({
    id,
    at: s.at,
    mainId: v.main.id,
    before,
    after: structuredClone(v.main),
    coins: v.coins,
    dew: v.dew,
    mode: p.mode,
  });
  s.events.push({
    id: id + ":main",
    animalId: v.main.id,
    at: s.at,
    type: "fusion",
    message:
      "融合成为" +
      GRADES[v.targetGrade] +
      " · 消耗" +
      v.coins +
      "金币/" +
      v.dew +
      "晶露",
  });
  discover(s, v.main, "fusion", s.at);
}
