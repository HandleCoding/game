import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
test("Room registry, three-player capacity, action deduplication, stale revisions, and durable reviews", async () => {
  const connection = process.env.DATABASE_URL!;
  assert.ok(new URL(connection).pathname.endsWith("/playroom_dev"));
  const admin = new pg.Pool({ connectionString: connection }),
    schema = "test_rooms_" + randomBytes(6).toString("hex");
  await admin.query("CREATE SCHEMA " + schema);
  process.env.PGSCHEMA = schema;
  const { pool } = await import("../apps/api/src/platform/db/store.js");
  const { migrate } = await import("../apps/api/src/platform/db/migrate.js");
  const { registry } = await import("../apps/api/src/games/registry.js");
  const { RoomHub } = await import("../apps/api/src/platform/rooms.js");
  const { Duel } = await import("../apps/api/src/games/guess-number/engine.js");
  const { check } = await import("../apps/api/src/platform/errors.js");
  try {
    await migrate();
    for (const id of ["a", "b", "c", "d"])
      await pool.query("INSERT INTO users VALUES($1,$1,$1,$2,$2,0)", [
        id,
        "fixture",
      ]);
    class Three extends Duel {
      join(id: string) {
        check(this.phase === "waiting" && this.players.length < 3, "已满");
        this.players.push(id);
      }
      prepare(id: string, ready: boolean) {
        this.member(id);
        this.ready[id] = ready;
        if (
          this.players.length === 3 &&
          this.players.every((p) => this.ready[p])
        )
          this.phase = "playing";
      }
    }
    const definition = {
      metadata: {
        ...registry.match("guess-number").metadata,
        id: "test-three",
        name: "Three",
        minPlayers: 3,
        maxPlayers: 3,
      },
      create: (code: string, host: string, seconds: number) =>
        new Three(code, host, seconds),
      restore: (data: Record<string, unknown>) =>
        Object.assign(
          new Three(
            data.code as string,
            data.host as string,
            data.seconds as number,
          ),
          data,
        ),
    };
    registry.register(definition);
    assert.throws(() => registry.register(definition), /重复/);
    assert.throws(() => registry.match("guess-number", 99), /版本/);
    const hub = new RoomHub();
    const s = await hub.mutate("a", "create", { gameId: "test-three" });
    await hub.mutate("b", "join", { code: s.room!.code });
    await hub.mutate("c", "join", { code: s.room!.code });
    await assert.rejects(
      hub.mutate("d", "join", { code: s.room!.code }),
      /已满/,
    );
    await hub.mutate("a", "ready", { ready: true });
    await hub.mutate("b", "ready", { ready: true });
    assert.equal(hub.roomFor("a")?.engine.phase, "waiting");
    await hub.mutate("c", "ready", { ready: true });
    assert.equal(hub.roomFor("a")?.engine.phase, "playing");
    await hub.mutate("a", "leave", {});
    await hub.mutate("b", "leave", {});
    await hub.mutate("c", "leave", {});
    let current = await hub.mutate("a", "create", {
      seconds: 90,
      disableHistory: true,
    });
    await pool.query(
      "ALTER TABLE active_rooms ADD CONSTRAINT test_no_revision CHECK ((snapshot->>'revision')::int <= 1)",
    );
    await assert.rejects(hub.mutate("b", "join", { code: current.room!.code }));
    assert.equal(hub.roomFor("b"), undefined);
    assert.equal(hub.roomFor("a")!.members.length, 1);
    await pool.query(
      "ALTER TABLE active_rooms DROP CONSTRAINT test_no_revision",
    );
    await hub.mutate("b", "join", { code: current.room!.code });
    await hub.mutate("a", "ready", { ready: true });
    await hub.mutate("b", "ready", { ready: true });
    await hub.mutate("a", "secret", { value: "0000" });
    await hub.mutate("b", "secret", { value: "0123" });
    do {
      await hub.mutate("a", "dice", {});
      current = await hub.mutate("b", "dice", {});
    } while (current.room!.phase === "dice");
    const actor = current.room!.turn!,
      receipt = {
        value: "0999",
        requestId: "repeat-action-123",
        matchId: current.room!.matchId,
        expectedRevision: current.room!.revision,
      };
    await hub.mutate(actor, "guess", receipt);
    await hub.mutate(actor, "guess", receipt);
    assert.equal(
      (hub.roomFor("a")!.engine.serialize().history as unknown[]).length,
      1,
    );
    await assert.rejects(
      hub.mutate(actor, "guess", { ...receipt, value: "0888" }),
      /请求编号/,
    );
    await assert.rejects(
      hub.mutate(actor, "guess", { ...receipt, requestId: "stale-action-456" }),
      /状态已变化/,
    );
    await hub.mutate("a", "leave", {});
    const row = (
      await pool.query("SELECT * FROM results WHERE game_id='guess-number'")
    ).rows[0];
    assert.equal(row.review_json.records.length, 1);
    const loaded = new RoomHub();
    await loaded.load();
    assert.equal((await loaded.state("b")).room?.history.length, 1);
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
