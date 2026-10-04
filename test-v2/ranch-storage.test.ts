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
    assert.equal(sold.state.coins, 836);
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
      836,
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
      716,
    );
    const summary = (await pool.query("SELECT state FROM persistent_profiles"))
      .rows[0].state;
    assert.deepEqual(Object.keys(summary).sort(), ["at", "version"]);
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
