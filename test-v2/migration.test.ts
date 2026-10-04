import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { unlink } from "node:fs/promises";
import pg from "pg";
test("Migration retains IDs, original passwords, sessions, results, and private room snapshots", async () => {
  const connection = process.env.DATABASE_URL!;
  assert.ok(new URL(connection).pathname.endsWith("/playroom_dev"));
  const admin = new pg.Pool({ connectionString: connection }),
    schema = "test_migration_" + randomBytes(6).toString("hex");
  await admin.query("CREATE SCHEMA " + schema);
  process.env.PGSCHEMA = schema;
  const file = "/var/backups/pair-play/fixture-" + schema + ".sqlite",
    db = new DatabaseSync(file),
    salt = randomBytes(24).toString("hex"),
    hash = scryptSync("fixture-password", salt, 64).toString("hex"),
    session = "b".repeat(48);
  db.exec(
    "CREATE TABLE users(id,account,name,salt,hash,created);CREATE TABLE sessions(token,user,expires);CREATE TABLE results(id,code,players,winner,reason,turns,created);CREATE TABLE result_players(user,result);CREATE TABLE active_rooms(code,snapshot)",
  );
  for (const [id, account, name] of [
    ["legacy-id", "legacy_account", "迁移测试"],
    ["legacy-other", "legacy_other", "对手"],
  ])
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
      id,
      account,
      name,
      salt,
      hash,
      1234,
    );
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    session,
    "legacy-id",
    Date.now() + 600000,
  );
  db.prepare("INSERT INTO results VALUES(?,?,?,?,?,?,?)").run(
    "legacy-result",
    "123456",
    '["legacy-id","legacy-other"]',
    "legacy-id",
    "guessed",
    4,
    1000,
  );
  for (const id of ["legacy-id", "legacy-other"])
    db.prepare("INSERT INTO result_players VALUES(?,?)").run(
      id,
      "legacy-result",
    );
  const { Duel } = await import("../apps/api/src/games/guess-number/engine.js");
  const room = new Duel("654321", "legacy-id", 30);
  room.join("legacy-other");
  room.prepare("legacy-id", true);
  room.prepare("legacy-other", true);
  room.secret("legacy-id", "0000");
  room.secret("legacy-other", "0123");
  db.prepare("INSERT INTO active_rooms VALUES(?,?)").run(
    room.code,
    JSON.stringify({
      code: room.code,
      host: room.host,
      seconds: room.seconds,
      members: room.players,
      savedAt: Date.now(),
      game: room.serialize(),
    }),
  );
  db.close();
  const { pool } = await import("../apps/api/src/platform/db/store.js");
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/import-sqlite.ts", file],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: connection, PGSCHEMA: schema },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const { signIn, authenticate, user } =
      await import("../apps/api/src/platform/accounts.js");
    assert.equal(
      (
        await signIn(false, {
          account: "legacy_account",
          password: "fixture-password",
        })
      ).u.id,
      "legacy-id",
    );
    assert.equal((await user("legacy-id"))?.hash, hash);
    assert.equal(
      (
        await authenticate({
          headers: { cookie: "pair_session=" + session },
        } as never)
      )?.user,
      "legacy-id",
    );
    assert.equal(
      (await pool.query("SELECT review_json FROM results")).rows[0].review_json,
      null,
    );
    assert.equal(
      (
        await pool.query('SELECT outcome FROM result_players WHERE "user"=$1', [
          "legacy-id",
        ])
      ).rows[0].outcome,
      "win",
    );
    const { RoomHub } = await import("../apps/api/src/platform/rooms.js");
    const hub = new RoomHub();
    await hub.load();
    const state = await hub.state("legacy-id");
    assert.equal(state.room?.ownSecret, "0000");
    assert.equal(state.room?.paused, true);
    assert.equal(JSON.stringify(state.room).includes("0123"), false);
    assert.equal(state.me.id, "legacy-id");
    const retry = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/import-sqlite.ts", file],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: connection, PGSCHEMA: schema },
        encoding: "utf8",
      },
    );
    assert.notEqual(retry.status, 0);
    assert.equal(
      Number((await pool.query("SELECT count(*) FROM users")).rows[0].count),
      2,
    );
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
    await unlink(file);
  }
});
