import type { PoolClient } from "pg";
import { check } from "../../platform/errors.js";
import { ranchStorage } from "./storage.js";
import {
  species,
  newAnimal,
  stableId,
  changeKey,
  type Animal,
  type RanchState,
} from "./engine.js";
import { ranchCatalog as previousCatalog } from "./legacy-catalog.js";
import { FEED_UNIT_MS } from "../../../../../packages/contracts/src/ranch-balance.js";
// Offline, one-shot conversion. Gameplay has a single current ruleset, never parallel legacy timing.
export function upgradeRanchRules(
  raw: Record<string, unknown>,
  cutoff = Date.now(),
): { state: RanchState; changed: number } {
  let state: RanchState;
  if (raw.version === 1) {
    const scope = String(raw.migrationScope ?? "migration");
    state = {
      ...structuredClone(raw),
      version: 2,
      at: cutoff,
      feedUnitMs: raw.feedUnitMs ?? FEED_UNIT_MS,
      batches: [],
      lots: [],
      events: [],
      hallCount: 0,
      collection: {},
    } as unknown as RanchState;
    state.animals = (raw.animals as Animal[]).map((prev) => {
      const kind = species.find((k) => k.id === prev.species)!;
      check(kind, "迁移遇到未知动物");
      const a = {
        ...newAnimal(stableId(scope + ":" + prev.id), kind, cutoff),
        ...prev,
        id: stableId(scope + ":" + prev.id),
        legacyId: prev.id,
        legacy: true,
        createdAt: null,
        adultAt: null,
        completedAt: null,
        exitAt: null,
        totalProduced: null,
        status: prev.ageMs < prev.growthMs ? "juvenile" : "producing",
        cycleProgressMs: Math.max(0, prev.ageMs - prev.growthMs) % prev.cycleMs,
      } as Animal;
      if (prev.stored)
        state.batches.push({
          id: a.id + ":batch:0",
          animalId: a.id,
          round: 0,
          product: prev.product,
          quantity: prev.stored,
          xp: prev.stored * prev.harvestXp,
          price: previousCatalog.find((k) => k.id === prev.species)!.sellPrice,
          at: cutoff,
          harvestedAt: null,
        });
      return a;
    });
    for (const [product, quantity] of Object.entries(state.inventory))
      if (quantity > 0) {
        const kind = previousCatalog.find((k) => k.product === product);
        check(kind, "仓库产物无法转换");
        state.lots.push({
          id: stableId(scope + ":inventory:" + product),
          animalId: null,
          batchId: null,
          product,
          quantity,
          price: kind.sellPrice,
          at: cutoff,
        });
      }
    delete state.migrationScope;
  } else {
    check(raw.version === 2, "迁移遇到未知牧场版本");
    state = structuredClone(raw) as RanchState;
  }
  let changed = 0;
  for (const a of state.animals) {
    if (!a.legacy && a.rulesVersion === 3) continue;
    const kind = species.find((k) => k.id === a.species)!;
    check(kind, "迁移遇到未知动物");
    const current = newAnimal(a.id, kind, cutoff),
      juvenile = a.status === "juvenile";
    const growthRatio = Math.min(1, a.ageMs / a.growthMs),
      cycleRatio = Math.min(1, a.cycleProgressMs / a.cycleMs);
    Object.assign(a, {
      growthMs: current.growthMs,
      cycleMs: current.cycleMs,
      yield: current.yield,
      product: current.product,
      maxStored: Math.max(a.stored, current.maxStored),
      harvestXp: 0,
      sellPrice: current.sellPrice,
      maxRounds: current.maxRounds,
      lifetimeXp: current.lifetimeXp,
      paid: a.paid > 0 ? current.paid : 0,
      cycleProgressMs: juvenile
        ? 0
        : Math.min(
            current.cycleMs - 1,
            Math.floor(cycleRatio * current.cycleMs),
          ),
      ageMs: juvenile
        ? Math.min(
            current.growthMs - 1,
            Math.floor(growthRatio * current.growthMs),
          )
        : current.growthMs,
      legacy: false,
      rulesVersion: 3,
    });
    state.events.push({
      id: a.id + ":rules:3",
      animalId: a.id,
      at: cutoff,
      type: "rules-upgraded",
      message: "统一切换新成长、生产与有限轮次规则，保留当前成长比例和已有产物",
    });
    changed++;
  }
  if (changed) state.at = Math.max(state.at, cutoff);
  return { state, changed };
}
export async function migrateRanchProfiles(
  db: PoolClient,
  cutoff = Date.now(),
) {
  const rows = (
    await db.query(
      "SELECT * FROM persistent_profiles WHERE game_id='animal-ranch' ORDER BY world_id,\"user\" FOR UPDATE",
    )
  ).rows;
  let migrated = 0,
    alreadyCurrent = 0,
    animals = 0,
    pending = 0,
    convertedAnimals = 0;
  for (const row of rows) {
    check([1, 2].includes(row.version), "迁移遇到未知牧场版本");
    const ctx = {
      db,
      gameId: "animal-ranch",
      world: row.world_id,
      owner: row.user,
    };
    const loaded = await ranchStorage.load(row.state, ctx);
    const { state, changed } = upgradeRanchRules(loaded, cutoff);
    if (row.version === 2 && !changed) {
      alreadyCurrent++;
      continue;
    }
    check(
      state.coins === loaded.coins &&
        state.xp === loaded.xp &&
        state.feedMs === loaded.feedMs &&
        state.capacity === loaded.capacity,
      "资源转换校验失败",
    );
    check(
      state.animals.length === (loaded.animals as Animal[]).length,
      "动物数量转换校验失败",
    );
    const saved = await ranchStorage.save(state, ctx),
      reloaded = (await ranchStorage.load(saved, ctx)) as RanchState;
    check(changeKey(reloaded) === changeKey(state), "转换落库校验失败");
    for (const a of reloaded.animals) {
      const kind = species.find((k) => k.id === a.species)!;
      check(
        !a.legacy &&
          a.growthMs === kind.growthMs &&
          a.cycleMs === kind.cycleMs &&
          a.maxRounds === kind.maxRounds &&
          a.lifetimeXp === kind.lifetimeXp,
        "统一数值落库校验失败",
      );
    }
    check(
      reloaded.coins === loaded.coins &&
        reloaded.xp === loaded.xp &&
        reloaded.feedMs === loaded.feedMs,
      "钱包落库校验失败",
    );
    await db.query(
      'UPDATE persistent_profiles SET version=2,revision=revision+1,last_settled_at=$4,state=$5 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
      [ctx.gameId, ctx.world, ctx.owner, state.at, JSON.stringify(saved)],
    );
    migrated++;
    animals += state.animals.length;
    pending += state.animals.reduce((n, a) => n + a.stored, 0);
    convertedAnimals += changed;
  }
  return {
    profiles: rows.length,
    migrated,
    alreadyCurrent,
    animals,
    pending,
    convertedAnimals,
    cutoff,
    rulesVersion: 3,
    schemaVersion: 4,
    reset: false,
    uniformRules: true,
  };
}
