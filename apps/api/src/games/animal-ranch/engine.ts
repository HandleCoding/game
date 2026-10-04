import { randomUUID, createHash } from "node:crypto";
import { check } from "../../platform/errors.js";
import type {
  RanchSpecies,
  RanchSpeciesInfo,
  RanchView,
  RanchAnimalView,
  RanchAnimalStatus,
  RanchAffix,
  RanchAnimalEvent,
} from "../../../../../packages/contracts/src/ranch.js";
import {
  FEED_UNIT_MS,
  FEED_CAPACITY,
  INITIAL_FEED,
  HOUR,
  expansionFor,
  ranchLevel,
  xpForLevel,
} from "../../../../../packages/contracts/src/ranch-balance.js";
import { ranchCatalog as species } from "../../../../../packages/contracts/src/ranch-catalog.js";
export { species };
export const MINUTE = 60_000;
export const level = ranchLevel;
export interface Animal {
  id: string;
  legacyId?: string;
  species: RanchSpecies;
  status: RanchAnimalStatus;
  ageMs: number;
  cycleProgressMs: number;
  stored: number;
  growthMs: number;
  cycleMs: number;
  yield: number;
  product: string;
  maxStored: number;
  harvestXp: number;
  paid: number;
  sellPrice: number;
  maxRounds: number;
  completedRounds: number;
  lifetimeXp: number;
  nickname: string;
  variantId: string;
  rarityId: string;
  affixes: RanchAffix[];
  runeSlots: string[];
  rulesVersion: number;
  appearanceVersion: number;
  createdAt: number | null;
  adultAt: number | null;
  completedAt: number | null;
  exitAt: number | null;
  legacy: boolean;
  display: boolean;
  totalProduced: number | null;
}
export interface Batch {
  id: string;
  animalId: string;
  round: number;
  product: string;
  quantity: number;
  xp: number;
  price: number;
  at: number;
  harvestedAt: number | null;
}
export interface Lot {
  id: string;
  animalId: string | null;
  batchId: string | null;
  product: string;
  quantity: number;
  price: number;
  at: number;
}
export interface RanchState extends Record<string, unknown> {
  version: 2;
  feedUnitMs: number;
  at: number;
  coins: number;
  xp: number;
  feedMs: number;
  capacity: number;
  nextAnimal: number;
  animals: Animal[];
  batches: Batch[];
  lots: Lot[];
  inventory: Record<string, number>;
  events: RanchAnimalEvent[];
  hallCount: number;
  collection: RanchView["collection"];
  log: { id: string; at: number; message: string; coins: number }[];
}
const feedUnit = (s: RanchState) => s.feedUnitMs ?? MINUTE;
export const active = (a: Animal) =>
  ["juvenile", "producing", "completed"].includes(a.status);
export const feeding = (a: Animal) =>
  a.status === "juvenile" ||
  (a.status === "producing" && a.stored < a.maxStored);
export function stableId(seed: string) {
  const h = createHash("sha256").update(seed).digest("hex");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-5" +
    h.slice(13, 16) +
    "-a" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
}
export function newAnimal(id: string, kind: RanchSpeciesInfo, at = 0): Animal {
  return {
    id,
    species: kind.id,
    status: "juvenile",
    ageMs: 0,
    cycleProgressMs: 0,
    stored: 0,
    growthMs: kind.growthMs,
    cycleMs: kind.cycleMs,
    yield: kind.yield,
    product: kind.product,
    maxStored:
      kind.yield *
      Math.min(
        kind.maxRounds,
        Math.max(3, Math.ceil((24 * HOUR) / kind.cycleMs)),
      ),
    harvestXp: kind.harvestXp,
    paid: kind.price,
    sellPrice: kind.sellPrice,
    maxRounds: kind.maxRounds,
    completedRounds: 0,
    lifetimeXp: kind.lifetimeXp,
    nickname: "",
    variantId: "normal",
    rarityId: "common",
    affixes: [],
    runeSlots: [],
    rulesVersion: 3,
    appearanceVersion: 1,
    createdAt: at,
    adultAt: null,
    completedAt: null,
    exitAt: null,
    legacy: false,
    display: false,
    totalProduced: 0,
  };
}
function event(
  s: RanchState,
  a: Animal,
  type: string,
  message: string,
  at = s.at,
  key = type,
) {
  s.events.push({ id: a.id + ":" + key, animalId: a.id, type, message, at });
}
function addBatch(
  s: RanchState,
  a: Animal,
  round: number,
  quantity: number,
  xp: number,
  at: number,
) {
  s.batches.push({
    id: a.id + ":batch:" + round,
    animalId: a.id,
    round,
    product: a.product,
    quantity,
    xp,
    price: a.sellPrice,
    at,
    harvestedAt: null,
  });
  a.stored += quantity;
}
export function initialRanch(at = Date.now()): RanchState {
  const first = newAnimal(randomUUID(), species[0]!, at);
  first.ageMs = first.growthMs;
  first.status = "producing";
  first.adultAt = at;
  first.paid = 0;
  const s: RanchState = {
    version: 2,
    feedUnitMs: FEED_UNIT_MS,
    at,
    coins: 800,
    xp: 0,
    feedMs: INITIAL_FEED * FEED_UNIT_MS,
    capacity: 4,
    nextAnimal: 2,
    animals: [first],
    batches: [],
    lots: [],
    inventory: {},
    events: [],
    hallCount: 0,
    collection: {},
    log: [],
  };
  addBatch(s, first, 0, 3, 12, at);
  event(s, first, "gift", "迎来了第一位小鸡伙伴", at);
  return s;
}
export function settleRanch(
  raw: Record<string, unknown>,
  last: number,
  now: number,
): RanchState {
  const s = structuredClone(raw) as RanchState;
  check(s.version === 2, "牧场存档版本不支持");
  let cursor = Math.max(last, s.at),
    end = Math.max(cursor, now);
  while (cursor < end) {
    const animals = s.animals.filter(feeding);
    if (!animals.length) break;
    const budget = Math.floor(s.feedMs / animals.length);
    if (!budget) break;
    const boundary = Math.min(
      ...animals.map((a) =>
        a.status === "juvenile"
          ? a.growthMs - a.ageMs
          : a.cycleMs - a.cycleProgressMs,
      ),
    );
    const elapsed = Math.min(end - cursor, budget, boundary);
    check(elapsed > 0, "动物计时状态异常");
    s.feedMs -= elapsed * animals.length;
    cursor += elapsed;
    for (const a of animals) {
      a.ageMs += elapsed;
      if (a.status === "juvenile") {
        if (a.ageMs >= a.growthMs) {
          a.status = "producing";
          a.adultAt = cursor;
          event(s, a, "adult", "长大成年，准备第一轮生产", cursor);
        }
      } else {
        a.cycleProgressMs += elapsed;
        if (a.cycleProgressMs === a.cycleMs) {
          a.cycleProgressMs = 0;
          const k = ++a.completedRounds;
          check(k <= a.maxRounds, "生产轮次超出上限");
          const xp =
            Math.floor((k * a.lifetimeXp) / a.maxRounds) -
            Math.floor(((k - 1) * a.lifetimeXp) / a.maxRounds);
          addBatch(s, a, k, a.yield, xp, cursor);
          if (a.totalProduced !== null) a.totalProduced += a.yield;
          if (k === a.maxRounds) {
            a.status = "completed";
            a.completedAt = cursor;
            event(
              s,
              a,
              "completed",
              "完成全部 " + a.maxRounds + " 轮生产",
              cursor,
            );
          }
        }
      }
    }
  }
  s.at = end;
  return s;
}
export function saleCoins(a: Animal) {
  if (a.status === "juvenile") return Math.floor(a.paid * 0.3);
  return Math.floor(
    (a.paid * (60 * a.maxRounds - 45 * a.completedRounds)) /
      (100 * a.maxRounds),
  );
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
function animal(s: RanchState, id: unknown) {
  check(typeof id === "string", "动物编号无效");
  const a = s.animals.find((a) => a.id === id);
  check(a, "动物不存在");
  return a;
}
function inventory(s: RanchState) {
  s.inventory = {};
  for (const lot of s.lots)
    s.inventory[lot.product] = (s.inventory[lot.product] ?? 0) + lot.quantity;
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
        s.animals.filter(active).length + quantity <= s.capacity,
        "牧场满了，先扩建或让伙伴进入名宠堂",
      );
      check(s.coins >= kind.price * quantity, "金币不足");
      s.coins -= kind.price * quantity;
      for (let i = 0; i < quantity; i++) {
        const a = newAnimal(randomUUID(), kind, s.at);
        s.animals.push(a);
        s.nextAnimal++;
        event(s, a, "adopted", "认养了" + kind.name);
      }
      log(s, "迎来了 " + quantity + " 只" + kind.name, -kind.price * quantity);
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
      const animals = s.animals.filter(
        (a) => active(a) && (!p.animalId || a.id === p.animalId),
      );
      check(animals.length, "没有找到动物");
      let total = 0,
        xp = 0;
      for (const a of animals) {
        for (const b of s.batches.filter(
          (b) => b.animalId === a.id && b.harvestedAt === null,
        )) {
          total += b.quantity;
          xp += b.xp;
          b.harvestedAt = s.at;
          s.lots.push({
            id: b.id,
            animalId: a.id,
            batchId: b.id,
            product: b.product,
            quantity: b.quantity,
            price: b.price,
            at: s.at,
          });
          a.stored -= b.quantity;
          event(
            s,
            a,
            "harvest",
            "收获第" + (b.round || "初始") + "批 " + b.quantity + " 份产物",
            s.at,
            "harvest:" + b.round,
          );
        }
      }
      check(total > 0, "还没有可以收获的产物");
      s.xp += xp;
      inventory(s);
      log(s, "收获了 " + total + " 份产物，获得 " + xp + " 经验，已放入仓库");
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
      for (const lot of s.lots)
        if (!p.product || lot.product === p.product) {
          total += lot.quantity;
          earned += lot.quantity * lot.price;
          lot.quantity = 0;
        }
      check(total > 0, "仓库里没有可出售的产物");
      s.coins += earned;
      inventory(s);
      log(s, "出售 " + total + " 份产物，获得 " + earned + " 金币", earned);
      break;
    }
    case "upgrade": {
      keys(p, []);
      const e = expansionFor(s.capacity);
      check(e, "牧场已经扩建到最大");
      check(level(s.xp) >= e.level, "扩建需要牧场 Lv. " + e.level);
      check(s.coins >= e.cost, "金币不足，出售产物再来吧");
      s.coins -= e.cost;
      s.capacity += 2;
      log(s, "牧场扩建到 " + s.capacity + " 个位置", -e.cost);
      break;
    }
    case "renameAnimal": {
      keys(p, ["animalId", "nickname"]);
      const a = animal(s, p.animalId);
      check(!["sold", "released"].includes(a.status), "伙伴已离开牧场");
      check(typeof p.nickname === "string", "昵称无效");
      const name = p.nickname.trim();
      check(
        [...name].length <= 12 && !/[\p{Cc}\p{Cf}<>]/u.test(name),
        "昵称最多12个字，不能包含控制字符或尖括号",
      );
      a.nickname = name;
      event(
        s,
        a,
        "renamed",
        name ? "取名为「" + name + "」" : "恢复物种名字",
        s.at,
        "rename:" + randomUUID(),
      );
      log(s, "更新了伙伴的名字");
      break;
    }
    case "enterHall":
    case "sellAnimal":
    case "releaseAnimal": {
      keys(p, ["animalId"]);
      const a = animal(s, p.animalId);
      check(!["sold", "released"].includes(a.status), "伙伴已经离开牧场");
      check(a.stored === 0, "请先收获这只动物的产物");
      const name = a.nickname || species.find((k) => k.id === a.species)!.name;
      if (type === "enterHall") {
        check(a.status === "completed", "完成全部生产后才能进入名宠堂");
        a.status = "hall";
        a.display = false;
        s.hallCount++;
        event(s, a, "hall", "进入名宠堂，永久收藏");
        log(s, name + "进入名宠堂");
      } else {
        if (a.status === "hall") s.hallCount--;
        const earned = type === "sellAnimal" ? saleCoins(a) : 0;
        a.status = type === "sellAnimal" ? "sold" : "released";
        a.display = false;
        a.exitAt = s.at;
        s.coins += earned;
        event(
          s,
          a,
          a.status,
          a.status === "sold"
            ? "出售，获得 " + earned + " 金币"
            : "放生，留下纪念",
        );
        log(
          s,
          name +
            (a.status === "sold"
              ? "已出售，获得 " + earned + " 金币"
              : "已放生"),
          earned,
        );
      }
      break;
    }
    case "setHallDisplay": {
      keys(p, ["animalId", "display"]);
      const a = animal(s, p.animalId);
      check(a.status === "hall", "只能展示名宠堂伙伴");
      check(typeof p.display === "boolean", "展示设置无效");
      a.display = p.display;
      event(
        s,
        a,
        "display",
        a.display ? "展示给来访的玩家" : "取消公开展示",
        s.at,
        "display:" + randomUUID(),
      );
      break;
    }
    default:
      check(false, "牧场操作不存在");
  }
  check(
    Number.isSafeInteger(s.coins) &&
      s.coins >= 0 &&
      Number.isSafeInteger(s.xp) &&
      s.xp >= 0,
    "金币或经验余额异常",
  );
  return s;
}
export function animalView(
  a: Animal,
  s: RanchState,
  owner: boolean,
): RanchAnimalView {
  const hungry = feeding(a) && s.feedMs < s.animals.filter(feeding).length;
  const baby = a.status === "juvenile";
  const needed = baby
    ? a.growthMs - a.ageMs
    : a.status === "producing"
      ? a.cycleMs - a.cycleProgressMs
      : 0;
  const rate = s.animals.filter(feeding).length;
  const budget = rate ? Math.floor(s.feedMs / rate) : 0;
  return {
    id: a.id,
    species: a.species,
    name: a.nickname || species.find((k) => k.id === a.species)!.name,
    nickname: a.nickname,
    status: a.status,
    completedRounds: a.completedRounds,
    maxRounds: a.maxRounds,
    storageRounds: Math.ceil(a.maxStored / a.yield),
    ...(owner ? { saleCoins: saleCoins(a) } : {}),
    variantId: a.variantId,
    rarityId: a.rarityId,
    affixes: a.affixes,
    createdAt: a.createdAt,
    completedAt: a.completedAt,
    legacy: a.legacy,
    display: a.display,
    totalProduced: a.totalProduced,
    baby,
    progress: baby
      ? a.ageMs / a.growthMs
      : a.status === "producing"
        ? a.cycleProgressMs / a.cycleMs
        : 1,
    stored: a.stored,
    capacity: a.maxStored,
    productName: species.find((k) => k.id === a.species)!.productName,
    remainingMs: needed,
    nextAt:
      needed && feeding(a) && !hungry && budget >= needed
        ? s.at + needed
        : null,
    hungry,
  };
}
export function changeKey(raw: Record<string, unknown>) {
  const s = raw as RanchState;
  return JSON.stringify([
    s.version,
    s.animals
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map((a) => [a.id, a.status, a.completedRounds, a.stored]),
    s.batches
      ?.toSorted((a, b) => a.id.localeCompare(b.id))
      .map((b) => [b.id, b.harvestedAt]),
  ]);
}
export function ranchView(
  raw: Record<string, unknown>,
  owner: boolean,
): RanchView {
  const s = raw as RanchState,
    count = s.animals.filter(feeding).length;
  const v: RanchView = {
    level: level(s.xp),
    capacity: s.capacity,
    hungry: count > 0 && s.feedMs < count,
    feedingAnimals: count,
    hallCount: s.hallCount ?? 0,
    collection: owner ? s.collection : {},
    animals: s.animals.filter(active).map((a) => animalView(a, s, owner)),
    species,
  };
  if (owner) {
    const items = species.map((k) => {
      const lots = s.lots.filter(
          (l) => l.product === k.product && l.quantity > 0,
        ),
        quantity = lots.reduce((n, l) => n + l.quantity, 0);
      const value = lots.reduce((n, l) => n + l.quantity * l.price, 0);
      return {
        id: k.product,
        name: k.productName,
        count: quantity,
        price: quantity ? value / quantity : k.sellPrice,
        value,
        minPrice: lots.length
          ? Math.min(...lots.map((l) => l.price))
          : k.sellPrice,
        maxPrice: lots.length
          ? Math.max(...lots.map((l) => l.price))
          : k.sellPrice,
      };
    });
    Object.assign(v, {
      coins: s.coins,
      xp: s.xp,
      levelStartXp: xpForLevel(level(s.xp)),
      nextLevelXp: xpForLevel(level(s.xp) + 1),
      feedUnitMinutes: feedUnit(s) / MINUTE,
      feed: Math.round((s.feedMs / feedUnit(s)) * 10) / 10,
      feedMinutes: count ? Math.floor(s.feedMs / count / MINUTE) : null,
      upgradeCost: expansionFor(s.capacity)?.cost ?? null,
      upgradeLevel: expansionFor(s.capacity)?.level ?? null,
      inventory: items,
      log: s.log.map(({ id, at, message }) => ({ id, at, message })),
    });
  }
  return v;
}
