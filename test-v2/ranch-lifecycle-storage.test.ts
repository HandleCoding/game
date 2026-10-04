import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { readFile, stat, unlink } from "node:fs/promises";
test("生命周期 PostgreSQL：旧存档无损迁移、批次价格、名宠堂隐私分页与双设备退出", async () => {
  const connection = process.env.DATABASE_URL!;
  assert.equal(new URL(connection).pathname, "/playroom_dev");
  const admin = new pg.Pool({ connectionString: connection }),
    schema = "life_" + randomBytes(6).toString("hex");
  await admin.query("CREATE SCHEMA " + schema);
  process.env.PGSCHEMA = schema;
  const { pool, transaction } =
    await import("../apps/api/src/platform/db/store.js");
  const { migrate } = await import("../apps/api/src/platform/db/migrate.js");
  const { PersistentService } =
    await import("../apps/api/src/platform/persistent.js");
  const { ranchStorage } =
    await import("../apps/api/src/games/animal-ranch/storage.js");
  const engine = await import("../apps/api/src/games/animal-ranch/engine.js");
  const legacy =
    await import("../apps/api/src/games/animal-ranch/legacy-v1.js");
  const oldCatalog =
    await import("../apps/api/src/games/animal-ranch/legacy-catalog.js");
  try {
    await migrate();
    await migrate();
    for (const id of ["owner", "visitor", "legacy", "clock"])
      await pool.query(
        "INSERT INTO users VALUES($1,$1,$1,'fixture','fixture',0)",
        [id],
      );
    const future = Date.now() + 3600000,
      old = legacy.initialRanch(future);
    old.coins = 4321;
    old.xp = 123;
    old.inventory = { egg: 17 };
    old.animals[0]!.paid = 120;
    old.animals[0]!.stored = 6;
    old.animals[0]!.ageMs += 12345;
    await pool.query(
      "INSERT INTO persistent_profiles VALUES('animal-ranch','default','legacy',1,9,$1,$2)",
      [
        future,
        JSON.stringify({ version: 1, at: future, feedUnitMs: old.feedUnitMs }),
      ],
    );
    await pool.query(
      "INSERT INTO ranch_wallets VALUES('animal-ranch','default','legacy',$1,$2,$3,$4,$5)",
      [old.coins, old.xp, old.feedMs, old.capacity, old.nextAnimal],
    );
    await pool.query(
      "INSERT INTO ranch_animals(game_id,world_id,\"user\",id,data) VALUES('animal-ranch','default','legacy',$1,$2)",
      [old.animals[0]!.id, JSON.stringify(old.animals[0])],
    );
    await pool.query(
      "INSERT INTO ranch_inventory VALUES('animal-ranch','default','legacy','egg',17)",
    );
    const { migrateRanchProfiles } =
      await import("../apps/api/src/games/animal-ranch/migration.js");
    const operatorFile = "artifacts/lifecycle-operator-" + schema + ".json";
    const cli = spawnSync(
      process.execPath,
      ["scripts/migrate-ranch-lifecycle.mjs", operatorFile],
      { env: process.env, encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const report = JSON.parse(await readFile(operatorFile, "utf8"));
    assert.equal((await stat(operatorFile)).mode & 0o777, 0o600);
    await unlink(operatorFile);
    assert.equal(report.migrated, 1);
    assert.equal(report.reset, false);
    assert.equal(
      (await transaction((db) => migrateRanchProfiles(db, future))).migrated,
      0,
    );
    const service = new PersistentService(),
      migrated = await service.view("animal-ranch", "legacy"),
      a = migrated.state.animals[0];
    assert.equal(migrated.revision, 10);
    assert.equal(migrated.state.coins, 4321);
    assert.equal(migrated.state.xp, 123);
    assert.equal(a.stored, 6);
    assert.equal(a.legacy, true);
    assert.equal(a.createdAt, null);
    assert.equal(a.totalProduced, null);
    assert.notEqual(a.id, old.animals[0]!.id);
    const saved = (
      await pool.query("SELECT data FROM ranch_animals WHERE \"user\"='legacy'")
    ).rows[0].data;
    for (const field of ["growthMs", "cycleMs", "yield", "paid", "harvestXp"])
      assert.equal(saved[field], old.animals[0]![field as keyof typeof saved]);
    assert.equal(
      migrated.state.inventory[0].value,
      17 * oldCatalog.ranchCatalog[0]!.sellPrice,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT version FROM persistent_profiles WHERE \"user\"='legacy'",
        )
      ).rows[0].version,
      2,
    );
    const repeat = await service.view("animal-ranch", "legacy");
    assert.equal(repeat.revision, 10);
    assert.equal(repeat.state.animals[0].id, a.id);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM ranch_animal_batches WHERE \"user\"='legacy'",
        )
      ).rows[0].n,
      1,
    );
    await service.action("animal-ranch", "legacy", {
      requestId: "legacy-harvest-once",
      expectedRevision: 10,
      type: "harvest",
      payload: {},
    });
    assert.equal(
      (await service.view("animal-ranch", "legacy")).state.inventory[0].count,
      23,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM ranch_inventory_lots WHERE \"user\"='legacy'",
        )
      ).rows[0].n,
      2,
    );

    await pool.query(
      "INSERT INTO persistent_profiles VALUES('animal-ranch','default','owner',2,0,$1,$2)",
      [future, JSON.stringify(engine.initialRanch(future))],
    );
    await service.view("animal-ranch", "visitor");
    let notices = 0,
      observed: Promise<any> | undefined;
    const notifying = new PersistentService((_game, owner) => {
      notices++;
      observed = pool.query(
        'SELECT revision FROM persistent_profiles WHERE "user"=$1',
        [owner],
      );
    });
    await notifying.view("animal-ranch", "clock");
    const elapsed = Date.now() - 11 * 60000;
    await pool.query(
      "UPDATE persistent_profiles SET last_settled_at=$1,state=jsonb_set(state,'{at}',to_jsonb($1::bigint)) WHERE \"user\"='clock'",
      [elapsed],
    );
    const changed = await notifying.view("animal-ranch", "clock");
    assert.equal(changed.revision, 1);
    assert.equal(notices, 1);
    assert.equal((await observed!).rows[0].revision, 1);
    assert.equal((await notifying.view("animal-ranch", "clock")).revision, 1);
    assert.equal(notices, 1);

    await transaction(async (db) => {
      const ctx = {
        db,
        gameId: "animal-ranch",
        world: "default",
        owner: "owner",
      };
      const s = engine.initialRanch(future);
      s.animals = [];
      s.batches = [];
      s.events = [];
      s.feedMs = 1000 * 1800000;
      for (let i = 0; i < 27; i++)
        s.animals.push(
          engine.newAnimal(randomUUID(), engine.species[0]!, future),
        );
      // Fixture settlement is real engine code; sufficient food for all complete careers.
      const done = engine.settleRanch(s, future, future + 35 * 60000);
      assert(
        done.animals.every(
          (a) => a.status === "completed" && a.completedRounds === 6,
        ),
      );
      const summary = await ranchStorage.save(done, ctx);
      await db.query(
        "UPDATE persistent_profiles SET state=$1,last_settled_at=$2,revision=revision+1 WHERE \"user\"='owner'",
        [JSON.stringify(summary), done.at],
      );
    });
    let view = await service.view("animal-ranch", "owner");
    const ids = view.state.animals.map((a: any) => a.id);
    await assert.rejects(
      service.action("animal-ranch", "owner", {
        requestId: "hall-before-harvest",
        expectedRevision: view.revision,
        type: "enterHall",
        payload: { animalId: ids[0] },
      }),
      /先收获/,
    );
    const request = {
      requestId: "all-harvest-once",
      expectedRevision: view.revision,
      type: "harvest",
      payload: {},
    };
    const [first, replay] = await Promise.all([
      service.action("animal-ranch", "owner", request),
      service.action("animal-ranch", "owner", request),
    ]);
    assert.deepEqual(first, replay);
    view = first;
    assert.equal(view.state.inventory[0].count, 27 * 18);
    assert.equal(
      view.state.inventory[0].value,
      27 * 18 * engine.species[0]!.sellPrice,
    );
    const act = async (type: string, payload: Record<string, unknown>) => {
      view = await service.action("animal-ranch", "owner", {
        requestId: randomUUID(),
        expectedRevision: view.revision,
        type,
        payload,
      });
      return view;
    };
    for (const id of ids.slice(0, 7)) await act("enterHall", { animalId: id });
    assert.equal(view.state.animals.length, 20);
    assert.equal(view.state.hallCount, 7);
    assert.equal(view.state.feedingAnimals, 0);
    const lastFeed = (
      await pool.query(
        "SELECT feed_ms FROM ranch_wallets WHERE \"user\"='owner'",
      )
    ).rows[0].feed_ms;
    await service.view("animal-ranch", "owner");
    assert.equal(
      (
        await pool.query(
          "SELECT feed_ms FROM ranch_wallets WHERE \"user\"='owner'",
        )
      ).rows[0].feed_ms,
      lastFeed,
    );
    assert.equal(
      (await service.collection("animal-ranch", "visitor", "owner", {})).total,
      0,
    );
    await assert.rejects(
      service.record("animal-ranch", "visitor", "owner", ids[0]!),
      /不存在/,
    );
    await act("renameAnimal", { animalId: ids[0], nickname: "我的小鸡" });
    for (const id of ids.slice(0, 6))
      await act("setHallDisplay", { animalId: id, display: true });
    await assert.rejects(
      act("setHallDisplay", { animalId: ids[6], display: true }),
      /最多公开展示6/,
    );
    assert.equal(
      (await service.record("animal-ranch", "owner", "owner", ids[6]!)).animal
        .display,
      false,
    );
    const publicPage = await service.collection(
      "animal-ranch",
      "visitor",
      "owner",
      { mode: "history" },
    );
    assert.equal(publicPage.total, 6);
    assert(
      publicPage.animals.every(
        (a: any) =>
          a.saleCoins === undefined && a.display && a.status === "hall",
      ),
    );
    const record = await service.record(
      "animal-ranch",
      "visitor",
      "owner",
      ids[0]!,
    );
    assert.equal(record.events.length, 0);
    assert.equal(
      (
        await service.collection("animal-ranch", "owner", "owner", {
          search: "小鸡",
        })
      ).total,
      7,
    );
    const history = await service.collection("animal-ranch", "owner", "owner", {
      mode: "history",
    });
    assert.equal(history.total, 27);
    assert.equal(history.animals.length, 20);
    const next = await service.collection("animal-ranch", "owner", "owner", {
      mode: "history",
      after: history.next!,
    });
    assert.equal(next.animals.length, 7);
    assert.equal(
      new Set([...history.animals, ...next.animals].map((a: any) => a.id)).size,
      27,
    );

    const exit = {
      requestId: "device-one-exit",
      expectedRevision: view.revision,
      type: "sellAnimal",
      payload: { animalId: ids[0] },
    };
    const concurrent = await Promise.allSettled([
      service.action("animal-ranch", "owner", exit),
      service.action("animal-ranch", "owner", {
        ...exit,
        requestId: "device-two-exit",
        type: "releaseAnimal",
      }),
    ]);
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    const coins = (await service.view("animal-ranch", "owner")).state.coins;
    const winner = concurrent.findIndex((r) => r.status === "fulfilled");
    const winRequest =
      winner === 0
        ? exit
        : { ...exit, requestId: "device-two-exit", type: "releaseAnimal" };
    assert.deepEqual(
      await service.action("animal-ranch", "owner", winRequest),
      (concurrent[winner] as PromiseFulfilledResult<any>).value,
    );
    assert.equal(
      (await service.view("animal-ranch", "owner")).state.coins,
      coins,
    );
    assert.equal(
      (await service.record("animal-ranch", "owner", "owner", ids[0]!)).animal
        .status,
      winner === 0 ? "sold" : "released",
    );
    await assert.rejects(
      service.record("animal-ranch", "visitor", "owner", ids[0]!),
      /不存在/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM ranch_animals WHERE \"user\"='owner'",
        )
      ).rows[0].n,
      27,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM ranch_animal_events WHERE \"user\"='owner' AND type IN ('sold','released')",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
