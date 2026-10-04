import type { PoolClient } from "pg";
import { check } from "../../platform/errors.js";
import { ranchStorage } from "./storage.js";
import { settleRanch, changeKey, type RanchState } from "./engine.js";
import { settleRanch as settleLegacy } from "./legacy-v1.js";
// Call inside one transaction while production writers are stopped. No row deletion or reset.
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
    pending = 0;
  for (const row of rows) {
    check([1, 2].includes(row.version), "迁移遇到未知牧场版本");
    if (row.version === 2) {
      alreadyCurrent++;
      continue;
    }
    const ctx = {
      db,
      gameId: "animal-ranch",
      world: row.world_id,
      owner: row.user,
    };
    const loaded = await ranchStorage.load(row.state, ctx);
    const expected = settleLegacy(loaded, row.last_settled_at, cutoff);
    const state = settleRanch(loaded, row.last_settled_at, cutoff);
    check(
      state.coins === expected.coins &&
        state.xp === expected.xp &&
        state.feedMs === expected.feedMs &&
        state.capacity === expected.capacity,
      "迁移资源校验失败",
    );
    check(
      state.animals.length === expected.animals.length,
      "迁移动物数量校验失败",
    );
    for (let i = 0; i < expected.animals.length; i++) {
      const a = state.animals[i]!,
        old = expected.animals[i]!;
      for (const k of [
        "species",
        "ageMs",
        "growthMs",
        "cycleMs",
        "yield",
        "stored",
        "paid",
        "harvestXp",
      ] as const)
        check(a[k] === old[k], "迁移实例参数校验失败");
      check(
        state.batches
          .filter((b) => b.animalId === a.id)
          .reduce((n, b) => n + b.quantity, 0) === old.stored,
        "待收批次数量校验失败",
      );
    }
    for (const [product, quantity] of Object.entries(expected.inventory))
      check(
        state.lots
          .filter((l) => l.product === product)
          .reduce((n, l) => n + l.quantity, 0) === quantity,
        "仓库数量校验失败",
      );
    const saved = await ranchStorage.save(state, ctx);
    const reloaded = (await ranchStorage.load(saved, ctx)) as RanchState;
    check(changeKey(reloaded) === changeKey(state), "迁移落库校验失败");
    check(
      reloaded.coins === expected.coins &&
        reloaded.xp === expected.xp &&
        reloaded.feedMs === expected.feedMs,
      "迁移钱包落库校验失败",
    );
    await db.query(
      'UPDATE persistent_profiles SET version=2,revision=revision+1,last_settled_at=$4,state=$5 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
      [ctx.gameId, ctx.world, ctx.owner, state.at, JSON.stringify(saved)],
    );
    migrated++;
    animals += state.animals.length;
    pending += state.animals.reduce((n, a) => n + a.stored, 0);
  }
  return {
    profiles: rows.length,
    migrated,
    alreadyCurrent,
    animals,
    pending,
    cutoff,
    rulesVersion: 3,
    schemaVersion: 4,
    reset: false,
  };
}
