import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt as callback, timingSafeEqual } from "node:crypto";
import pg from "pg";
test("PostgreSQL: persistent isolation, concurrent duplicate actions, and rollback", async () => {
  const connection = process.env.DATABASE_URL!;
  assert.ok(new URL(connection).pathname.endsWith("/playroom_dev"));
  const admin = new pg.Pool({ connectionString: connection }),
    schema = "test_persistent_" + randomBytes(6).toString("hex");
  await admin.query("CREATE SCHEMA " + schema);
  process.env.PGSCHEMA = schema;
  const { pool } = await import("../apps/api/src/platform/db/store.js");
  const { migrate } = await import("../apps/api/src/platform/db/migrate.js");
  const { registry } = await import("../apps/api/src/games/registry.js");
  const { PersistentService } =
    await import("../apps/api/src/platform/persistent.js");
  const { check } = await import("../apps/api/src/platform/errors.js");
  try {
    await migrate();
    for (const id of ["owner", "visitor"])
      await pool.query("INSERT INTO users VALUES($1,$1,$1,$2,$2,0)", [
        id,
        "fixture",
      ]);
    registry.register({
      metadata: {
        id: "test-persistent",
        name: "test only",
        kind: "persistent",
        category: "test",
        minPlayers: 1,
        maxPlayers: 1,
        defaultSeconds: 0,
        version: 1,
        description: "test fixture",
        rules: [],
      },
      initialState: () => ({ count: 0, private: "owner-only" }),
      settle: (state) => state,
      action(state, type) {
        check(type === "harvest", "拒绝无效动作");
        return { ...state, count: Number(state.count) + 1 };
      },
      view: (state, owner) => (owner ? state : { count: state.count }),
    });
    const service = new PersistentService();
    await Promise.all([
      service.view("test-persistent", "owner"),
      service.view("test-persistent", "owner"),
    ]);
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) FROM persistent_profiles")).rows[0]
          .count,
      ),
      1,
    );
    const action = {
      requestId: "concurrent-123",
      expectedRevision: 0,
      type: "harvest",
      payload: {},
    };
    const [a, b] = await Promise.all([
      service.action("test-persistent", "owner", action),
      service.action("test-persistent", "owner", action),
    ]);
    assert.deepEqual(a, b);
    assert.equal(a.state.count, 1);
    assert.equal(
      (await service.view("test-persistent", "visitor", "owner")).state.private,
      undefined,
    );
    await assert.rejects(
      service.action("test-persistent", "owner", {
        ...action,
        requestId: "stale-request",
        expectedRevision: 0,
      }),
      /存档已变化/,
    );
    await assert.rejects(
      service.action("test-persistent", "owner", {
        ...action,
        requestId: "invalid-action",
        expectedRevision: 1,
        type: "bad",
      }),
      /拒绝无效动作/,
    );
    assert.equal(
      (await service.view("test-persistent", "owner")).state.count,
      1,
    );
    await pool.query("INSERT INTO sessions VALUES($1,$2,$3)", [
      "a".repeat(48),
      "owner",
      Date.now() + 60000,
    ]);
    const { authenticate } =
      await import("../apps/api/src/platform/accounts.js");
    assert.equal(
      (
        await authenticate({
          headers: { cookie: "other=value; pair_session=" + "a".repeat(48) },
        } as never)
      )?.user,
      "owner",
    );
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
