import { randomUUID } from "node:crypto";
import { check } from "../../platform/errors.js";
import type {
  RanchSpecies,
  RanchSpeciesInfo,
  RanchView,
} from "../../../../../packages/contracts/src/ranch.js";
import {
  FEED_UNIT_MS,
  FEED_CAPACITY,
  INITIAL_FEED,
  expansionFor,
  ranchLevel,
  xpForLevel,
} from "../../../../../packages/contracts/src/ranch-balance.js";
export const MINUTE = 60_000;
export { ranchCatalog as species } from "../../../../../packages/contracts/src/ranch-catalog.js";
import { ranchCatalog as species } from "../../../../../packages/contracts/src/ranch-catalog.js";
export interface Animal {
  id: string;
  species: RanchSpecies;
  ageMs: number;
  stored: number;
  growthMs: number;
  cycleMs: number;
  yield: number;
  product: string;
  maxStored: number;
  harvestXp: number;
  paid: number;
}
export interface RanchState extends Record<string, unknown> {
  version: 1;
  feedUnitMs: number;
  at: number;
  coins: number;
  xp: number;
  feedMs: number;
  capacity: number;
  nextAnimal: number;
  animals: Animal[];
  inventory: Record<string, number>;
  log: { id: string; at: number; message: string; coins: number }[];
}
export const level = ranchLevel;
const feedUnit = (s: RanchState) => s.feedUnitMs ?? MINUTE;
export function newAnimal(id: string, kind: RanchSpeciesInfo): Animal {
  return {
    id,
    species: kind.id,
    ageMs: 0,
    stored: 0,
    growthMs: kind.growthMs,
    cycleMs: kind.cycleMs,
    yield: kind.yield,
    product: kind.product,
    maxStored: kind.yield * 3,
    harvestXp: kind.harvestXp,
    paid: kind.price,
  };
}
export function initialRanch(at = Date.now()): RanchState {
  const first = newAnimal("animal-1", species[0]!);
  first.ageMs = first.growthMs;
  first.stored = 3;
  return {
    version: 1,
    feedUnitMs: FEED_UNIT_MS,
    at,
    coins: 800,
    xp: 0,
    feedMs: INITIAL_FEED * FEED_UNIT_MS,
    capacity: 4,
    nextAnimal: 2,
    animals: [first],
    inventory: {},
    log: [],
  };
}
export function settleRanch(
  raw: Record<string, unknown>,
  last: number,
  now: number,
): RanchState {
  const s = structuredClone(raw) as RanchState;
  check(s.version === 1, "牧场存档版本不支持");
  const start = Math.max(last, s.at),
    end = Math.max(start, now),
    elapsed = end - start;
  if (s.animals.length && elapsed > 0) {
    const fed = Math.min(elapsed, Math.floor(s.feedMs / s.animals.length));
    s.feedMs -= fed * s.animals.length;
    for (const a of s.animals) {
      const before = Math.floor(Math.max(0, a.ageMs - a.growthMs) / a.cycleMs);
      a.ageMs += fed;
      const after = Math.floor(Math.max(0, a.ageMs - a.growthMs) / a.cycleMs);
      a.stored = Math.min(a.maxStored, a.stored + (after - before) * a.yield);
    }
  }
  s.at = end;
  return s;
}
function log(s: RanchState, message: string, coins = 0) {
  s.log.unshift({ id: randomUUID(), at: s.at, message, coins });
  s.log = s.log.slice(0, 20);
}
function keys(p: Record<string, unknown>, allowed: string[]) {
  check(
    Object.keys(p).every((k) => allowed.includes(k)),
    "操作参数不正确",
  );
}
export function ranchAction(
  raw: Record<string, unknown>,
  type: string,
  p: Record<string, unknown>,
): RanchState {
  const s = structuredClone(raw) as RanchState;
  switch (type) {
    case "buyAnimal": {
      keys(p, ["species", "quantity"]);
      const kind = species.find((k) => k.id === p.species);
      check(kind, "请选择有效的动物");
      const quantity = p.quantity ?? 1;
      check(
        typeof quantity === "number" &&
          Number.isInteger(quantity) &&
          quantity >= 1 &&
          quantity <= 5,
        "一次可购买 1–5 只",
      );
      check(level(s.xp) >= kind.unlockLevel, "牧场等级还未解锁这只动物");
      check(
        s.animals.length + quantity <= s.capacity,
        "牧场满了，先扩建或出售动物",
      );
      check(s.coins >= kind.price * quantity, "金币不足");
      const cost = kind.price * quantity;
      s.coins -= cost;
      // Buying / selling animals must never manufacture experience.
      for (let i = 0; i < quantity; i++)
        s.animals.push(newAnimal("animal-" + s.nextAnimal++, kind));
      log(s, "迎来了 " + quantity + " 只" + kind.name, -cost);
      break;
    }
    case "buyFeed": {
      keys(p, ["units"]);
      const units = p.units;
      check(
        typeof units === "number" && [20, 100, 300].includes(units),
        "请选择有效的饲料包",
      );
      check(
        s.feedMs + units * feedUnit(s) <= FEED_CAPACITY * feedUnit(s),
        "食槽最多储存 1000 份饲料",
      );
      check(s.coins >= units, "金币不足");
      s.coins -= units;
      s.feedMs += units * feedUnit(s);
      log(s, "食槽补充了 " + units + " 份饲料", -units);
      break;
    }
    case "harvest": {
      keys(p, ["animalId"]);
      check(
        p.animalId === undefined || typeof p.animalId === "string",
        "动物编号无效",
      );
      const animals = p.animalId
        ? s.animals.filter((a) => a.id === p.animalId)
        : s.animals;
      check(animals.length > 0, "没有找到动物");
      let total = 0,
        earnedXp = 0;
      for (const a of animals) {
        total += a.stored;
        earnedXp += a.stored * a.harvestXp;
        s.inventory[a.product] = (s.inventory[a.product] ?? 0) + a.stored;
        a.stored = 0;
      }
      check(total > 0, "还没有可以收获的产物");
      s.xp += earnedXp;
      log(s, "收获了 " + total + " 份产物，已放入仓库");
      break;
    }
    case "sellProducts": {
      keys(p, ["product"]);
      check(
        p.product === undefined || species.some((k) => k.product === p.product),
        "产物不存在",
      );
      let total = 0,
        earned = 0;
      for (const kind of species)
        if (!p.product || p.product === kind.product) {
          const count = s.inventory[kind.product] ?? 0;
          total += count;
          earned += count * kind.sellPrice;
          s.inventory[kind.product] = 0;
        }
      check(total > 0, "仓库里没有可出售的产物");
      s.coins += earned;
      log(s, "出售 " + total + " 份产物，获得 " + earned + " 金币", earned);
      break;
    }
    case "upgrade": {
      keys(p, []);
      check(s.capacity < 16, "牧场已经扩建到最大");
      const expansion = expansionFor(s.capacity);
      check(expansion, "牧场已经扩建到最大");
      check(
        level(s.xp) >= expansion.level,
        "扩建需要牧场 Lv. " + expansion.level,
      );
      const cost = expansion.cost;
      check(s.coins >= cost, "金币不足，出售产物再来吧");
      s.coins -= cost;
      s.capacity += 2;
      // Expansion buys space, not experience.
      log(s, "牧场扩建到 " + s.capacity + " 个位置", -cost);
      break;
    }
    case "sellAnimal": {
      keys(p, ["animalId"]);
      check(typeof p.animalId === "string", "动物编号无效");
      const animal = s.animals.find((a) => a.id === p.animalId);
      check(animal, "动物不存在");
      check(animal.stored === 0, "请先收获这只动物的产物");
      const earned = Math.floor(
        animal.paid * (animal.ageMs >= animal.growthMs ? 0.6 : 0.3),
      );
      s.animals = s.animals.filter((a) => a.id !== animal.id);
      s.coins += earned;
      log(
        s,
        "送别一只" +
          species.find((k) => k.id === animal.species)!.name +
          "，获得 " +
          earned +
          " 金币",
        earned,
      );
      break;
    }
    default:
      check(false, "牧场操作不存在");
  }
  check(Number.isSafeInteger(s.coins) && s.coins >= 0, "金币余额异常");
  return s;
}
export function ranchView(
  raw: Record<string, unknown>,
  owner: boolean,
): RanchView {
  const s = raw as RanchState;
  const hungry = s.animals.length > 0 && s.feedMs < s.animals.length;
  const available = s.animals.length
    ? Math.floor(s.feedMs / s.animals.length)
    : 0;
  const view: RanchView = {
    level: level(s.xp),
    capacity: s.capacity,
    hungry,
    species,
    animals: s.animals.map((a) => {
      const kind = species.find((k) => k.id === a.species)!;
      const baby = a.ageMs < a.growthMs;
      const needed = baby
        ? a.growthMs - a.ageMs
        : a.cycleMs - ((a.ageMs - a.growthMs) % a.cycleMs);
      return {
        id: a.id,
        species: a.species,
        name: kind.name,
        baby,
        progress: baby
          ? a.ageMs / a.growthMs
          : ((a.ageMs - a.growthMs) % a.cycleMs) / a.cycleMs,
        stored: a.stored,
        capacity: a.maxStored,
        productName: kind.productName,
        remainingMs: needed,
        nextAt:
          !hungry && available >= needed && a.stored < a.maxStored
            ? s.at + needed
            : null,
        hungry,
      };
    }),
  };
  if (owner)
    Object.assign(view, {
      coins: s.coins,
      xp: s.xp,
      levelStartXp: xpForLevel(level(s.xp)),
      nextLevelXp: xpForLevel(level(s.xp) + 1),
      feedUnitMinutes: feedUnit(s) / MINUTE,
      feed: Math.round((s.feedMs / feedUnit(s)) * 10) / 10,
      feedMinutes: s.animals.length
        ? Math.floor(s.feedMs / s.animals.length / MINUTE)
        : null,
      upgradeCost: expansionFor(s.capacity)?.cost ?? null,
      upgradeLevel: expansionFor(s.capacity)?.level ?? null,
      inventory: species.map((k) => ({
        id: k.product,
        name: k.productName,
        count: s.inventory[k.product] ?? 0,
        price: k.sellPrice,
      })),
      log: s.log.map(({ id, at, message }) => ({ id, at, message })),
    });
  return view;
}
