import assert from "node:assert/strict";
import pg from "pg";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const connection = process.env.DATABASE_URL;
if (!new URL(connection).pathname.endsWith("/playroom_dev"))
  throw Error("Development only");
const admin = new pg.Pool({ connectionString: connection });
const schema = "reset_qa_" + randomBytes(6).toString("hex");
await admin.query("CREATE SCHEMA " + schema);
process.env.PGSCHEMA = schema;
const { pool } = await import("../dist/apps/api/src/platform/db/store.js");
const { migrate } = await import("../dist/apps/api/src/platform/db/migrate.js");
const { PersistentService } =
  await import("../dist/apps/api/src/platform/persistent.js");
const service = new PersistentService();
const file = process.cwd() + "/artifacts/" + schema + ".json";
try {
  await migrate();
  await pool.query(
    "INSERT INTO users VALUES('fixture','fixture','fixture','fixture','fixture',0)",
  );
  await service.view("animal-ranch", "fixture");
  await pool.query("UPDATE ranch_wallets SET xp=2760,coins=12000,capacity=16");
  const invoke = (mode, expected) =>
    spawnSync(
      process.execPath,
      ["scripts/reset-ranch.mjs", mode, file, String(expected)],
      { encoding: "utf8", env: process.env },
    );
  const wrong = invoke("reset", 2);
  assert.notEqual(wrong.status, 0);
  assert.equal(fs.existsSync(file), false);
  const reset = invoke("reset", 1);
  assert.equal(reset.status, 0, reset.stderr);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const after = await service.view("animal-ranch", "fixture");
  assert.equal(after.state.coins, 800);
  assert.equal(after.state.feed, 240);
  assert.equal(after.state.level, 1);
  assert.equal(after.revision, 1);
  const restore = invoke("restore", 1);
  assert.equal(restore.status, 0, restore.stderr);
  const restored = await service.view("animal-ranch", "fixture");
  assert.equal(restored.state.coins, 12000);
  assert.equal(restored.state.capacity, 16);
  assert.equal(restored.revision, 0);
  console.log(
    "Operator CLI: isolated reset, 600 backup, mismatched count guard and scoped restore passed",
  );
} finally {
  await pool.end();
  await admin.query("DROP SCHEMA " + schema + " CASCADE");
  await admin.end();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
