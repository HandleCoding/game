import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
test("PostgreSQL 牧场：唯一初始化、双设备收获、原子钱包仓库流水、重载与事务失败回滚", async () => {
  const connection = process.env.DATABASE_URL!;
  assert.ok(new URL(connection).pathname.endsWith("/playroom_dev"));
  const admin = new pg.Pool({ connectionString: connection }),
    schema = "test_ranch_" + randomBytes(6).toString("hex");
  await admin.query("CREATE SCHEMA " + schema);
  process.env.PGSCHEMA = schema;
  const { pool } = await import("../apps/api/src/platform/db/store.js");
  const { migrate } = await import("../apps/api/src/platform/db/migrate.js");
  const { PersistentService } =
    await import("../apps/api/src/platform/persistent.js");
  try {
    await migrate();
    for (const id of ["owner", "visitor"])
      await pool.query("INSERT INTO users VALUES($1,$1,$1,$2,$2,0)", [
        id,
        "fixture",
      ]);
    const service = new PersistentService();
    await Promise.all([
      service.view("animal-ranch", "owner"),
      service.view("animal-ranch", "owner"),
    ]);
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) FROM ranch_wallets")).rows[0].count,
      ),
      1,
    );
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) FROM ranch_animals")).rows[0].count,
      ),
      1,
    );
    const req = {
      requestId: "ranch-harvest-0001",
      expectedRevision: 0,
      type: "harvest",
      payload: {},
    };
    const [a, b] = await Promise.all([
      service.action("animal-ranch", "owner", req),
      service.action("animal-ranch", "owner", req),
    ]);
    assert.deepEqual(a, b);
    assert.equal(
      (
        await pool.query(
          "SELECT quantity FROM ranch_inventory WHERE product='egg'",
        )
      ).rows[0].quantity,
      3,
    );
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) FROM ranch_ledger")).rows[0].count,
      ),
      1,
    );
    await assert.rejects(
      service.action("animal-ranch", "owner", {
        ...req,
        requestId: "other-device-req1",
      }),
      /存档已变化/,
    );
    const reload = await new PersistentService().view("animal-ranch", "owner");
    assert.equal((reload.state.inventory as { count: number }[])[0]!.count, 3);
    const visitor = await service.view("animal-ranch", "visitor", "owner");
    assert.equal(visitor.state.coins, undefined);
    assert.equal(visitor.state.inventory, undefined);
    assert.equal(visitor.state.log, undefined);
    assert.equal(
      (await service.list("animal-ranch", "visitor")).players[0]?.id,
      "owner",
    );
    await assert.rejects(
      service.action("animal-ranch", "visitor", {
        ...req,
        requestId: "visitor-steal-001",
      }),
      /先进入游戏/,
    );
    const sold = await service.action("animal-ranch", "owner", {
      ...req,
      requestId: "sell-products-001",
      expectedRevision: 1,
      type: "sellProducts",
    });
    assert.equal(sold.state.coins, 803);
    await pool.query(
      "ALTER TABLE ranch_wallets ADD CONSTRAINT test_fail_write CHECK(coins>=800)",
    );
    await assert.rejects(
      service.action("animal-ranch", "owner", {
        ...req,
        requestId: "fail-purchase-001",
        expectedRevision: 2,
        type: "buyAnimal",
        payload: { species: "chicken" },
      }),
    );
    assert.equal(
      (await service.view("animal-ranch", "owner")).state.coins,
      803,
    );
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) FROM ranch_animals")).rows[0].count,
      ),
      1,
    );
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) FROM ranch_ledger")).rows[0].count,
      ),
      2,
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM action_receipts WHERE request_id='fail-purchase-001'",
          )
        ).rows[0].count,
      ),
      0,
    );
    await pool.query(
      "ALTER TABLE ranch_wallets DROP CONSTRAINT test_fail_write",
    );
    const buy = {
      ...req,
      requestId: "buy-last-slot-001",
      expectedRevision: 2,
      type: "buyAnimal",
      payload: { species: "chicken" },
    };
    const results = await Promise.allSettled([
      service.action("animal-ranch", "owner", buy),
      service.action("animal-ranch", "owner", {
        ...buy,
        requestId: "buy-last-slot-002",
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await service.view("animal-ranch", "owner")).state.coins,
      790,
    );
    const summary = (await pool.query("SELECT state FROM persistent_profiles"))
      .rows[0].state;
    assert.deepEqual(Object.keys(summary).sort(), [
      "at",
      "feedUnitMs",
      "version",
    ]);

    // Balance reset rehearsed against real relational data, preserving identity and other games.
    const { captureRanch, resetRanch, restoreRanch } =
      await import("../apps/api/src/games/animal-ranch/reset.js");
    const { transaction } =
      await import("../apps/api/src/platform/db/store.js");
    const { xpForLevel } =
      await import("../packages/contracts/src/ranch-balance.js");
    await pool.query("UPDATE ranch_wallets SET xp=$1", [xpForLevel(20)]);
    assert.equal(
      (await service.list("animal-ranch", "visitor")).players[0]!.level,
      20,
    );
    await pool.query(
      "INSERT INTO action_receipts VALUES('owner','unrelated-guess','match-guess','guess-fingerprint','{}',0)",
    );
    await pool.query(
      "INSERT INTO persistent_profiles VALUES('test-other','default','owner',1,7,0,'{}')",
    );
    const preserved = (await pool.query("SELECT * FROM users ORDER BY id"))
      .rows;
    const beforeReset = await service.view("animal-ranch", "owner");
    const backup = await transaction(async (db) => {
      const b = await captureRanch(db, 1);
      await resetRanch(db, b, Date.now());
      return b;
    });
    const reset = await service.view("animal-ranch", "owner");
    assert.equal(reset.revision, beforeReset.revision + 1);
    assert.equal(reset.state.level, 1);
    assert.equal(reset.state.coins, 800);
    assert.equal(reset.state.feed, 240);
    assert.equal(reset.state.capacity, 4);
    assert.equal(reset.state.animals.length, 1);
    assert.equal(reset.state.inventory[0].count, 0);
    assert.equal(
      (await pool.query("SELECT count(*) FROM ranch_ledger")).rows[0].count,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM action_receipts WHERE match_id='persistent:animal-ranch'",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM action_receipts WHERE request_id='unrelated-guess'",
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT revision FROM persistent_profiles WHERE game_id='test-other'",
        )
      ).rows[0].revision,
      7,
    );
    assert.deepEqual(
      (await pool.query("SELECT * FROM users ORDER BY id")).rows,
      preserved,
    );
    await assert.rejects(
      service.action("animal-ranch", "owner", {
        ...req,
        requestId: "stale-before-reset",
        expectedRevision: beforeReset.revision,
      }),
      /存档已变化/,
    );
    await assert.rejects(
      transaction((db) => captureRanch(db, 2)),
      /count changed/,
    );
    await transaction((db) => restoreRanch(db, backup));
    const restored = await service.view("animal-ranch", "owner");
    assert.equal(restored.state.coins, beforeReset.state.coins);
    assert.equal(restored.state.level, 20);
    assert.equal(restored.revision, beforeReset.revision);
    assert.equal(restored.state.animals.length, 2);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM action_receipts WHERE request_id='unrelated-guess'",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
