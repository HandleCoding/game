import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
test("PostgreSQL变异：预览只读、并发融合去重、材料身份、珍藏权限、失败回滚与重启持久化", async () => {
  const connection = process.env.DATABASE_URL!;
  assert.equal(new URL(connection).pathname, "/playroom_dev");
  const admin = new pg.Pool({ connectionString: connection }),
    schema = "mutation_" + randomBytes(6).toString("hex");
  await admin.query("CREATE SCHEMA " + schema);
  process.env.PGSCHEMA = schema;
  const { pool, transaction } =
    await import("../apps/api/src/platform/db/store.js");
  const { migrate } = await import("../apps/api/src/platform/db/migrate.js");
  const { PersistentService } =
    await import("../apps/api/src/platform/persistent.js");
  const { ranchStorage } =
    await import("../apps/api/src/games/animal-ranch/storage.js");
  const { newAnimal, species } =
    await import("../apps/api/src/games/animal-ranch/engine.js");
  try {
    await migrate();
    await migrate();
    for (const id of ["owner", "visitor"])
      await pool.query(
        "INSERT INTO users VALUES($1,$1,$1,'fixture','fixture',0)",
        [id],
      );
    const service = new PersistentService();
    await service.view("animal-ranch", "owner");
    await transaction(async (db) => {
      const ctx = {
        db,
        gameId: "animal-ranch",
        world: "default",
        owner: "owner",
      };
      const row = (
        await db.query(
          "SELECT state FROM persistent_profiles WHERE \"user\"='owner' FOR UPDATE",
        )
      ).rows[0];
      const s: any = await ranchStorage.load(row.state, ctx);
      s.features.dew = 100;
      s.coins = 10000;
      for (const id of ["a", "b", "c", "d"]) {
        const a = newAnimal(id, species[0]!, Date.now());
        a.status = "hall";
        a.completedAt = s.at;
        a.completedRounds = a.maxRounds;
        a.grade = 0;
        a.attributes = ["fire"];
        a.stored = 0;
        s.animals.push(a);
      }
      await ranchStorage.save(s, ctx);
    });
    const materials: any = await service.collection(
      "animal-ranch",
      "owner",
      "owner",
      { mode: "hall", fusion: "1", species: "chicken", grade: "0" },
    );
    assert.equal(materials.animals.length, 4);
    assert.equal(materials.total, 4);
    await assert.rejects(
      service.collection("animal-ranch", "visitor", "owner", {
        mode: "hall",
        fusion: "1",
      }),
      /自己的名宠堂/,
    );
    await assert.rejects(
      service.collection("animal-ranch", "owner", "owner", {
        mode: "hall",
        fusion: "1",
        grade: "4",
      }),
      /品质无效/,
    );
    let own = await service.view("animal-ranch", "owner");
    const payload = {
      animalIds: ["a", "b"],
      mainAnimalId: "a",
      mode: "inherit",
      recipeVersion: 1,
    };
    const before = (
      await pool.query("SELECT * FROM ranch_features WHERE \"user\"='owner'")
    ).rows;
    const preview = await service.preview("animal-ranch", "owner", payload);
    assert.equal(preview.targetGrade, 1);
    assert.deepEqual(
      (await pool.query("SELECT * FROM ranch_features WHERE \"user\"='owner'"))
        .rows,
      before,
    );
    assert.equal(
      (await service.view("animal-ranch", "owner")).revision,
      own.revision,
    );
    await assert.rejects(
      service.preview("animal-ranch", "visitor", payload),
      /先进入游戏/,
    );
    const request = {
      type: "fuseAnimals",
      payload,
      requestId: randomUUID(),
      expectedRevision: own.revision,
    };
    const [a, b] = await Promise.all([
      service.action("animal-ranch", "owner", request),
      service.action("animal-ranch", "owner", request),
    ]);
    assert.deepEqual(a, b);
    assert.equal(
      (await pool.query("SELECT count(*) FROM ranch_fusions")).rows[0].count,
      1,
    );
    assert.equal(
      (await pool.query("SELECT status FROM ranch_animals WHERE id='b'"))
        .rows[0].status,
      "fused",
    );
    assert.equal(a.state.coins, 9998);
    assert.equal(
      (
        await pool.query(
          "SELECT coins_delta FROM ranch_ledger WHERE message='完成名宠融合' AND \"user\"='owner'",
        )
      ).rows[0].coins_delta,
      -2,
    );
    await assert.rejects(
      service.action("animal-ranch", "owner", {
        ...request,
        requestId: randomUUID(),
      }),
      /存档已变化/,
    );
    own = await new PersistentService().view("animal-ranch", "owner");
    assert.equal(own.state.mutation.dew, 100);
    const record = await service.record("animal-ranch", "owner", "owner", "a");
    assert.equal(record.animal.grade, 1);
    assert.equal(
      record.events.filter((e: any) => e.type === "fusion").length,
      1,
    );
    const foreign = await service.view("animal-ranch", "visitor", "owner");
    assert.equal(foreign.state.mutation, undefined);
    const hidden = await service
      .record("animal-ranch", "visitor", "owner", "a")
      .catch(() => null);
    assert.equal(hidden, null);
    await pool.query(
      "ALTER TABLE ranch_fusions ADD CONSTRAINT reject_fixture CHECK(created<0) NOT VALID",
    );
    const req2 = {
      ...request,
      requestId: randomUUID(),
      expectedRevision: own.revision,
      payload: { ...payload, animalIds: ["c", "d"], mainAnimalId: "c" },
    };
    await assert.rejects(service.action("animal-ranch", "owner", req2));
    let next = await service.view("animal-ranch", "owner");
    assert.equal(next.state.coins, 9998);
    assert.equal(next.revision, own.revision);
    assert.equal(
      (await pool.query("SELECT status FROM ranch_animals WHERE id='d'"))
        .rows[0].status,
      "hall",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM action_receipts WHERE request_id=$1",
          [req2.requestId],
        )
      ).rows[0].count,
      0,
    );
    await pool.query(
      "ALTER TABLE ranch_fusions DROP CONSTRAINT reject_fixture",
    );
    next = await service.action("animal-ranch", "owner", {
      ...req2,
      type: "setAnimalProtected",
      requestId: randomUUID(),
      payload: { animalId: "c", protected: true },
    });
    await assert.rejects(
      service.preview("animal-ranch", "owner", req2.payload),
      /珍藏/,
    );
    assert.equal(
      (await service.record("animal-ranch", "owner", "owner", "c")).animal
        .protected,
      true,
    );
    const requests = [
      {
        ...req2,
        expectedRevision: next.revision,
        payload: { animalId: "c", protected: false },
        type: "setAnimalProtected",
        requestId: randomUUID(),
      },
      {
        ...req2,
        expectedRevision: next.revision,
        payload: { animalId: "c", protected: false },
        type: "setAnimalProtected",
        requestId: randomUUID(),
      },
    ];
    const outcomes = await Promise.allSettled(
      requests.map((r) => service.action("animal-ranch", "owner", r)),
    );
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM schema_migrations WHERE version=5",
        )
      ).rows[0].count,
      1,
    );
    // Generate batches after load on a prior Shanghai day that has already granted two dew.
    await pool.query(
      "INSERT INTO users VALUES('offline','offline','offline','fixture','fixture',0)",
    );
    await service.view("animal-ranch", "offline");
    const today = Math.floor((Date.now() + 8 * 3600000) / 86400000),
      start = today * 86400000 - 8 * 3600000 - 3600000,
      productionDay = String(today - 1);
    await transaction(async (db) => {
      const ctx = {
        db,
        gameId: "animal-ranch",
        world: "default",
        owner: "offline",
      };
      const row = (
        await db.query(
          "SELECT state FROM persistent_profiles WHERE \"user\"='offline' FOR UPDATE",
        )
      ).rows[0];
      const s: any = await ranchStorage.load(row.state, ctx);
      s.at = start;
      s.feedMs = 3600000;
      s.features.epoch = start;
      s.features.dew = 2;
      s.features.claims[productionDay] = {
        count: 2,
        animals: ["previous-a", "previous-b"],
      };
      const gift = s.animals[0];
      Object.assign(gift, {
        status: "hall",
        stored: 0,
        completedRounds: gift.maxRounds,
        completedAt: start,
      });
      s.batches.forEach((b: any) => (b.harvestedAt = start));
      s.animals.push(newAnimal("offline-new", species[0]!, start));
      const saved = await ranchStorage.save(s, ctx);
      await db.query(
        "UPDATE ranch_features SET epoch=$1 WHERE \"user\"='offline'",
        [start],
      );
      await db.query(
        "UPDATE persistent_profiles SET state=$1,last_settled_at=$2 WHERE \"user\"='offline'",
        [JSON.stringify(saved), start],
      );
    });
    const offline = await service.view("animal-ranch", "offline");
    const harvested = await service.action("animal-ranch", "offline", {
      type: "harvest",
      payload: { animalId: "offline-new" },
      requestId: randomUUID(),
      expectedRevision: offline.revision,
    });
    assert.equal(harvested.state.mutation.dew, 3);
    assert.equal(
      (
        await pool.query(
          "SELECT count FROM ranch_material_daily WHERE \"user\"='offline' AND day=$1",
          [productionDay],
        )
      ).rows[0].count,
      3,
    );
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
