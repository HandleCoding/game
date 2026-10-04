import type { PoolClient } from "pg";
import { initialRanch } from "./engine.js";
import { ranchStorage } from "./storage.js";
const GAME = "animal-ranch";
const tables = [
  "persistent_profiles",
  "ranch_wallets",
  "ranch_animals",
  "ranch_animal_batches",
  "ranch_inventory_lots",
  "ranch_animal_events",
  "ranch_inventory",
  "ranch_ledger",
  "action_receipts",
] as const;
export interface RanchBackup {
  format: 1;
  gameId: typeof GAME;
  rows: Record<string, Record<string, unknown>[]>;
}
export async function captureRanch(
  db: PoolClient,
  expected: number,
): Promise<RanchBackup> {
  await db.query("SELECT pg_advisory_xact_lock(7321042026)");
  const profiles = (
    await db.query(
      "SELECT * FROM persistent_profiles WHERE game_id=$1 FOR UPDATE",
      [GAME],
    )
  ).rows;
  if (profiles.length !== expected)
    throw new Error("Ranch player count changed; reset aborted");
  const rows: RanchBackup["rows"] = { persistent_profiles: profiles };
  for (const table of tables.slice(1))
    rows[table] = (
      await db.query(
        table === "action_receipts"
          ? "SELECT * FROM action_receipts WHERE match_id=$1 AND actor=ANY($2::text[])"
          : "SELECT * FROM " + table + " WHERE game_id=$1",
        table === "action_receipts"
          ? ["persistent:" + GAME, profiles.map((p) => p.user)]
          : [GAME],
      )
    ).rows;
  return { format: 1, gameId: GAME, rows };
}
async function clearChildren(db: PoolClient, owners: unknown[]) {
  for (const table of [
    "ranch_animal_events",
    "ranch_inventory_lots",
    "ranch_animal_batches",
    "ranch_ledger",
    "ranch_inventory",
    "ranch_animals",
    "ranch_wallets",
  ])
    await db.query(
      "DELETE FROM " + table + ' WHERE game_id=$1 AND "user"=ANY($2::text[])',
      [GAME, owners],
    );
  await db.query(
    "DELETE FROM action_receipts WHERE match_id=$1 AND actor=ANY($2::text[])",
    ["persistent:" + GAME, owners],
  );
}
export async function resetRanch(
  db: PoolClient,
  backup: RanchBackup,
  at: number,
) {
  if (backup.format !== 1 || backup.gameId !== GAME)
    throw new Error("Invalid reset backup");
  const current = await captureRanch(
    db,
    backup.rows.persistent_profiles!.length,
  );
  const original = backup.rows.persistent_profiles!;
  if (
    JSON.stringify(current.rows.persistent_profiles) !==
    JSON.stringify(original)
  )
    throw new Error("Ranch changed since backup; reset aborted");
  await clearChildren(
    db,
    original.map((p) => p.user),
  );
  for (const row of original) {
    const s = initialRanch(at);
    const saved = await ranchStorage.save(s, {
      db,
      gameId: GAME,
      world: row.world_id as string,
      owner: row.user as string,
    });
    await db.query(
      'UPDATE persistent_profiles SET version=2,revision=revision+1,last_settled_at=$4,state=$5 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
      [GAME, row.world_id, row.user, at, JSON.stringify(saved)],
    );
  }
}
export async function restoreRanch(db: PoolClient, backup: RanchBackup) {
  if (backup.format !== 1 || backup.gameId !== GAME)
    throw new Error("Invalid restore backup");
  const original = backup.rows.persistent_profiles!;
  await captureRanch(db, original.length);
  await clearChildren(
    db,
    original.map((p) => p.user),
  );
  for (const row of original) {
    await db.query(
      'UPDATE persistent_profiles SET version=$4,revision=$5,last_settled_at=$6,state=$7 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
      [
        GAME,
        row.world_id,
        row.user,
        row.version,
        row.revision,
        row.last_settled_at,
        JSON.stringify(row.state),
      ],
    );
  }
  for (const table of tables.slice(1))
    for (const row of backup.rows[table]!) {
      const cols = Object.keys(row),
        values = Object.values(row).map((v) =>
          typeof v === "object" && v !== null ? JSON.stringify(v) : v,
        );
      // Backup is private, locally generated. Quote identifiers and permit only DB column names.
      if (cols.some((c) => !/^[a-z_]+$/.test(c)))
        throw new Error("Invalid backup column");
      await db.query(
        "INSERT INTO " +
          table +
          " (" +
          cols.map((c) => '"' + c + '"').join(",") +
          ") VALUES(" +
          cols.map((_, i) => "$" + (i + 1)).join(",") +
          ")",
        values,
      );
    }
}
