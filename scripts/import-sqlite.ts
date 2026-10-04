import { isDeepStrictEqual } from "node:util";
import { registry } from "../apps/api/src/games/registry.js";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool, transaction } from "../apps/api/src/platform/db/store.js";
import { migrate } from "../apps/api/src/platform/db/migrate.js";
import type { Snapshot } from "../packages/contracts/src/index.js";
const path = process.argv[2];
if (!path?.startsWith("/var/backups/pair-play/"))
  throw new Error("Source must be a private consistent SQLite backup");
const digest = createHash("sha256")
    .update(await readFile(path))
    .digest("hex"),
  sqlite = new DatabaseSync(path, { readOnly: true }),
  tables = ["users", "sessions", "results", "result_players", "active_rooms"];
const data = Object.fromEntries(
  tables.map((t) => [t, sqlite.prepare("SELECT * FROM " + t).all()]),
);
const counts = Object.fromEntries(tables.map((t) => [t, data[t].length]));
await migrate();
await transaction(async (db) => {
  const prior = (
    await db.query("SELECT counts FROM import_runs WHERE source_sha256=$1", [
      digest,
    ])
  ).rows[0];
  if (prior) throw new Error("This source was already imported");
  for (const table of tables)
    if (
      Number(
        (await db.query("SELECT count(*) FROM " + table)).rows[0].count,
      ) !== 0
    )
      throw new Error("Destination is not empty: " + table);
  for (const u of data.users)
    await db.query("INSERT INTO users VALUES($1,$2,$3,$4,$5,$6)", [
      u.id,
      u.account,
      u.name,
      u.salt,
      u.hash,
      u.created,
    ]);
  for (const s of data.sessions)
    await db.query("INSERT INTO sessions VALUES($1,$2,$3)", [
      s.token,
      s.user,
      s.expires,
    ]);
  for (const r of data.results)
    await db.query(
      "INSERT INTO results(id,code,players,winner,reason,turns,created,game_id,game_version,match_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$1)",
      [
        r.id,
        r.code,
        typeof r.players === "string" ? r.players : JSON.stringify(r.players),
        r.winner,
        r.reason,
        r.turns,
        r.created,
        "guess-number",
      ],
    );
  for (const p of data.result_players) {
    const result = data.results.find((r) => r.id === p.result)!;
    await db.query(
      'INSERT INTO result_players("user",result,outcome) VALUES($1,$2,$3)',
      [
        p.user,
        p.result,
        result.winner ? (result.winner === p.user ? "win" : "loss") : "draw",
      ],
    );
  }
  for (const r of data.active_rooms) {
    const legacy = JSON.parse(r.snapshot as string);
    let s: Snapshot;
    if (legacy.snapshotVersion === 2) s = legacy;
    else {
      s = {
        snapshotVersion: 2,
        code: legacy.code,
        host: legacy.host,
        gameId: legacy.game.gameId || "guess-number",
        gameVersion: 1,
        matchId:
          "legacy-" +
          createHash("sha256")
            .update(legacy.code + ":" + legacy.game.created)
            .digest("hex")
            .slice(0, 32),
        revision: 0,
        members: legacy.members,
        savedAt: legacy.savedAt,
        engine: legacy.game,
      };
    }
    registry.match(s.gameId, s.gameVersion).restore(s.engine);
    if (!s.members.every((id) => (s.engine.players as string[]).includes(id)))
      throw new Error("Invalid room membership");
    await db.query("INSERT INTO active_rooms VALUES($1,$2)", [
      r.code,
      JSON.stringify(s),
    ]);
  }
  for (const table of tables) {
    const rows = (await db.query("SELECT * FROM " + table)).rows;
    if (rows.length !== data[table].length)
      throw new Error("Count mismatch: " + table);
    for (const old of data[table]) {
      const current = rows.find((row) =>
        table === "result_players"
          ? row.user === old.user && row.result === old.result
          : table === "sessions"
            ? row.token === old.token
            : table === "active_rooms"
              ? row.code === old.code
              : row.id === old.id,
      );
      if (!current) throw new Error("Missing migrated row in " + table);
      for (const [key, value] of Object.entries(old)) {
        if (table === "active_rooms" && key === "snapshot") {
          const oldSnapshot = JSON.parse(value as string),
            next = current.snapshot;
          if (oldSnapshot.snapshotVersion === 2) {
            if (!isDeepStrictEqual(next, oldSnapshot))
              throw new Error("Room snapshot mismatch");
          } else {
            if (
              next.code !== oldSnapshot.code ||
              next.host !== oldSnapshot.host ||
              next.savedAt !== oldSnapshot.savedAt ||
              !isDeepStrictEqual(next.members, oldSnapshot.members) ||
              !isDeepStrictEqual(next.engine, oldSnapshot.game)
            )
              throw new Error("Legacy room snapshot mismatch");
          }
          continue;
        }
        if (table === "results" && key === "players") {
          if (
            JSON.stringify(current[key]) !==
            JSON.stringify(JSON.parse(value as string))
          )
            throw new Error("JSON mismatch: results.players");
        } else if (current[key] !== value)
          throw new Error("Field mismatch: " + table + "." + key);
      }
    }
  }
  await db.query(
    "INSERT INTO import_runs(source_sha256,counts) VALUES($1,$2)",
    [digest, JSON.stringify(counts)],
  );
});
sqlite.close();
console.log("Imported and verified all legacy fields:", counts);
console.log("Source SHA-256:", digest);
await pool.end();
