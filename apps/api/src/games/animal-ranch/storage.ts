import { ranchCatalog } from "../../../../../packages/contracts/src/ranch-catalog.js";
import { ranchLevel } from "../../../../../packages/contracts/src/ranch-balance.js";
import type {
  PersistentStorage,
  PersistentStorageContext,
} from "../contracts.js";
import {
  animalView,
  active,
  type RanchState,
  type Animal,
  type Batch,
  type Lot,
} from "./engine.js";
import {
  fusionPreview,
  prepareFeatures,
  type RanchFeatures,
} from "./mutation.js";
import { check } from "../../platform/errors.js";
async function stats(ctx: PersistentStorageContext) {
  const rows = (
    await ctx.db.query(
      "SELECT data->>'species' AS species,count(*)::int AS owned,count(*) FILTER(WHERE data->>'completedAt' IS NOT NULL)::int AS completed,count(*) FILTER(WHERE status='hall')::int AS hall FROM ranch_animals WHERE game_id=$1 AND world_id=$2 AND \"user\"=$3 GROUP BY data->>'species'",
      [ctx.gameId, ctx.world, ctx.owner],
    )
  ).rows;
  return Object.fromEntries(rows.map(({ species, ...v }) => [species, v]));
}
export const ranchStorage: PersistentStorage = {
  async directory(ctx) {
    return (
      await ctx.db.query(
        'SELECT p."user" AS id,u.name,w.xp AS xp,(SELECT count(*)::int FROM ranch_animals a WHERE a.game_id=p.game_id AND a.world_id=p.world_id AND a."user"=p."user" AND a.status IN (\'legacy\',\'juvenile\',\'producing\',\'completed\')) AS animals FROM persistent_profiles p JOIN users u ON u.id=p."user" JOIN ranch_wallets w ON w.game_id=p.game_id AND w.world_id=p.world_id AND w."user"=p."user" WHERE p.game_id=$1 AND p.world_id=$2 AND p."user"<>$3 ORDER BY u.created,p."user" LIMIT 100',
        [ctx.gameId, ctx.world, ctx.owner],
      )
    ).rows.map(({ xp, ...e }) => ({ ...e, level: ranchLevel(Number(xp)) }));
  },
  async load(summary, ctx) {
    const args = [ctx.gameId, ctx.world, ctx.owner];
    const wallet = (
      await ctx.db.query(
        'SELECT * FROM ranch_wallets WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
        args,
      )
    ).rows[0];
    if (!wallet) return summary;
    const legacy = summary.version === 1;
    const ids = Array.isArray(ctx.action?.payload.animalIds)
      ? ctx.action!.payload.animalIds
      : [];
    check(
      ids.length <= 3 &&
        ids.every((id) => typeof id === "string" && id.length <= 80),
      "材料编号无效",
    );
    const targets = [ctx.animalId ?? "", ...ids];
    const animals = (
      await ctx.db.query(
        "SELECT data FROM ranch_animals WHERE game_id=$1 AND world_id=$2 AND \"user\"=$3 AND (status IN ('legacy','juvenile','producing','completed') OR id=ANY($4::text[]))",
        [...args, targets],
      )
    ).rows.map((r) => r.data);
    const entries = (
      await ctx.db.query(
        'SELECT id,created AS at,message,coins_delta AS coins FROM ranch_ledger WHERE game_id=$1 AND world_id=$2 AND "user"=$3 ORDER BY created DESC,id DESC LIMIT 20',
        args,
      )
    ).rows;
    const inventory = Object.fromEntries(
      (
        await ctx.db.query(
          'SELECT product,quantity FROM ranch_inventory WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
          args,
        )
      ).rows.map((r) => [r.product, r.quantity]),
    );
    if (legacy)
      return {
        ...summary,
        migrationScope: args.join(":"),
        coins: wallet.coins,
        xp: wallet.xp,
        feedMs: wallet.feed_ms,
        capacity: wallet.capacity,
        nextAnimal: wallet.next_animal,
        animals,
        inventory,
        log: entries,
      };
    const batches = (
      await ctx.db.query(
        'SELECT data FROM ranch_animal_batches WHERE game_id=$1 AND world_id=$2 AND "user"=$3 AND harvested_at IS NULL',
        args,
      )
    ).rows.map((r) => r.data as Batch);
    const lots = (
      await ctx.db.query(
        'SELECT data FROM ranch_inventory_lots WHERE game_id=$1 AND world_id=$2 AND "user"=$3 AND quantity>0',
        args,
      )
    ).rows.map((r) => r.data as Lot);
    const collection = await stats(ctx),
      hallCount = Object.values(collection).reduce(
        (n, v: any) => n + v.hall,
        0,
      );
    const featureRow = (
      await ctx.db.query(
        'SELECT * FROM ranch_features WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
        args,
      )
    ).rows[0];
    const codex = (
      await ctx.db.query(
        'SELECT key,data FROM ranch_codex WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
        args,
      )
    ).rows;
    const dayKeys = [
      ...new Set([
        ...batches.map((b) =>
          String(Math.floor((b.at + 8 * 3600000) / 86400000)),
        ),
        String(Math.floor((Date.now() + 8 * 3600000) / 86400000)),
      ]),
    ];
    // New offline batches may fall on a prior production day that has already granted dew.
    // Feed bounds the advancing interval (at most 500h); load those daily counters before settling.
    const start = Number(summary.at),
      end = Math.min(Date.now(), start + Number(wallet.feed_ms));
    if (Number.isFinite(start) && Number.isFinite(end))
      for (
        let day = Math.floor((start + 8 * 3600000) / 86400000);
        day <= Math.floor((end + 8 * 3600000) / 86400000);
        day++
      )
        if (!dayKeys.includes(String(day))) dayKeys.push(String(day));
    const days = (
      await ctx.db.query(
        'SELECT day,count,animals FROM ranch_material_daily WHERE game_id=$1 AND world_id=$2 AND "user"=$3 AND day=ANY($4::text[])',
        [...args, dayKeys],
      )
    ).rows;
    const features: RanchFeatures | undefined = featureRow
      ? {
          epoch: Number(featureRow.epoch),
          dew: Number(featureRow.dew),
          remainder: featureRow.remainder,
          codex: Object.fromEntries(codex.map((c) => [c.key, c.data])),
          completedSpecies: [],
          tracked: ["first-variant", "six-species"],
          goals: {},
          ...featureRow.data,
          claims: Object.fromEntries(
            days.map((d) => [d.day, { count: d.count, animals: d.animals }]),
          ),
          fusions: [],
        }
      : undefined;
    return {
      ...summary,
      features,
      coins: wallet.coins,
      xp: wallet.xp,
      feedMs: wallet.feed_ms,
      capacity: wallet.capacity,
      nextAnimal: wallet.next_animal,
      animals,
      batches,
      lots,
      events: [],
      inventory,
      log: entries,
      collection,
      hallCount,
    };
  },
  async save(raw, ctx) {
    const s = raw as RanchState,
      args = [ctx.gameId, ctx.world, ctx.owner];
    const f = prepareFeatures(s);
    await ctx.db.query(
      'INSERT INTO ranch_wallets VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(game_id,world_id,"user") DO UPDATE SET coins=EXCLUDED.coins,xp=EXCLUDED.xp,feed_ms=EXCLUDED.feed_ms,capacity=EXCLUDED.capacity,next_animal=EXCLUDED.next_animal',
      [...args, s.coins, s.xp, s.feedMs, s.capacity, s.nextAnimal],
    );
    for (const a of s.animals) {
      if (a.legacyId)
        await ctx.db.query(
          'UPDATE ranch_animals SET id=$5 WHERE game_id=$1 AND world_id=$2 AND "user"=$3 AND id=$4',
          [...args, a.legacyId, a.id],
        );
      if (a.status === "hall" && a.display) {
        const count = (
          await ctx.db.query(
            "SELECT count(*)::int AS n FROM ranch_animals WHERE game_id=$1 AND world_id=$2 AND \"user\"=$3 AND status='hall' AND data->>'display'='true' AND id<>$4",
            [...args, a.id],
          )
        ).rows[0].n;
        check(count < 6, "名宠堂最多公开展示6位伙伴");
      }
      await ctx.db.query(
        'INSERT INTO ranch_animals(game_id,world_id,"user",id,data,status) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(game_id,world_id,"user",id) DO UPDATE SET data=EXCLUDED.data,status=EXCLUDED.status',
        [...args, a.id, JSON.stringify(a), a.status],
      );
    }
    for (const b of s.batches)
      await ctx.db.query(
        'INSERT INTO ranch_animal_batches VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(game_id,world_id,"user",id) DO UPDATE SET data=EXCLUDED.data,harvested_at=EXCLUDED.harvested_at',
        [...args, b.id, b.animalId, b.round, b.harvestedAt, JSON.stringify(b)],
      );
    for (const l of s.lots)
      await ctx.db.query(
        'INSERT INTO ranch_inventory_lots VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(game_id,world_id,"user",id) DO UPDATE SET quantity=EXCLUDED.quantity,data=EXCLUDED.data',
        [...args, l.id, l.animalId, l.quantity, JSON.stringify(l)],
      );
    for (const [product, quantity] of Object.entries(s.inventory))
      await ctx.db.query(
        'INSERT INTO ranch_inventory VALUES($1,$2,$3,$4,$5) ON CONFLICT(game_id,world_id,"user",product) DO UPDATE SET quantity=EXCLUDED.quantity',
        [...args, product, quantity],
      );
    for (const e of s.events)
      await ctx.db.query(
        "INSERT INTO ranch_animal_events VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
        [...args, e.id, e.animalId, e.at, e.type, e.message],
      );
    for (const e of s.log)
      await ctx.db.query(
        "INSERT INTO ranch_ledger VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        [...args, e.id, e.at, e.message, e.coins],
      );
    await ctx.db.query(
      'INSERT INTO ranch_features(game_id,world_id,"user",epoch,dew,remainder,data) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(game_id,world_id,"user") DO UPDATE SET dew=EXCLUDED.dew,remainder=EXCLUDED.remainder,data=EXCLUDED.data',
      [
        ...args,
        f.epoch,
        f.dew,
        f.remainder,
        JSON.stringify({
          completedSpecies: f.completedSpecies,
          tracked: f.tracked,
          goals: f.goals,
          fusionCount: f.fusionCount ?? 0,
        }),
      ],
    );
    for (const e of Object.values(f.codex))
      await ctx.db.query(
        'INSERT INTO ranch_codex VALUES($1,$2,$3,$4,$5) ON CONFLICT(game_id,world_id,"user",key) DO UPDATE SET data=EXCLUDED.data',
        [...args, e.key, JSON.stringify(e)],
      );
    for (const [day, d] of Object.entries(f.claims))
      await ctx.db.query(
        'INSERT INTO ranch_material_daily VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(game_id,world_id,"user",day) DO UPDATE SET count=EXCLUDED.count,animals=EXCLUDED.animals',
        [...args, day, d.count, JSON.stringify(d.animals)],
      );
    for (const record of f.fusions)
      await ctx.db.query(
        "INSERT INTO ranch_fusions VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [...args, record.id, record.at, JSON.stringify(record)],
      );
    s.collection = await stats(ctx);
    s.hallCount = Object.values(s.collection).reduce(
      (n, v) => n + (v?.hall ?? 0),
      0,
    );
    return { version: 2, at: s.at, feedUnitMs: s.feedUnitMs };
  },
  preview(raw, payload) {
    const s = structuredClone(raw) as unknown as RanchState;
    prepareFeatures(s);
    const v = fusionPreview(s, payload);
    return {
      recipeVersion: v.recipeVersion,
      targetGrade: v.targetGrade,
      dew: v.dew,
      coins: v.coins,
      affordable: v.affordable,
      attributes: v.attributes,
      mainAnimalId: v.main.id,
      materialIds: v.material.map((a) => a.id),
    };
  },
  async collection(ctx, q, isOwner) {
    const args: unknown[] = [ctx.gameId, ctx.world, ctx.owner];
    let where = 'game_id=$1 AND world_id=$2 AND "user"=$3';
    const mode = q.mode ?? "hall";
    check(["hall", "history"].includes(mode), "收藏分类无效");
    if (!isOwner) where += " AND status='hall' AND data->>'display'='true'";
    else if (mode === "hall") where += " AND status='hall'";
    if (q.search) {
      check(
        typeof q.search === "string" && q.search.length <= 40,
        "搜索内容过长",
      );
      args.push("%" + q.search + "%");
      const ix = args.length;
      args.push(
        ranchCatalog.filter((k) => k.name.includes(q.search!)).map((k) => k.id),
      );
      where +=
        " AND (data->>'nickname' ILIKE $" +
        ix +
        " OR data->>'species' ILIKE $" +
        ix +
        " OR data->>'species'=ANY($" +
        args.length +
        "::text[]))";
    }
    if (q.fusion !== undefined) {
      check(
        isOwner && mode === "hall" && q.fusion === "1",
        "融合材料只能查看自己的名宠堂",
      );
      where +=
        " AND COALESCE(data->>'protected','false')='false' AND COALESCE((data->>'grade')::int,0)<4";
      if (q.species !== undefined) {
        check(
          ranchCatalog.some((k) => k.id === q.species),
          "物种无效",
        );
        args.push(q.species);
        where += " AND data->>'species'=$" + args.length;
      }
      if (q.grade !== undefined) {
        check(/^[0-3]$/.test(q.grade), "品质无效");
        args.push(Number(q.grade));
        where += " AND COALESCE((data->>'grade')::int,0)=$" + args.length;
      }
    }
    const total = (
      await ctx.db.query(
        "SELECT count(*)::int AS n FROM ranch_animals WHERE " + where,
        args,
      )
    ).rows[0].n;
    if (q.after) {
      check(
        typeof q.after === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(q.after),
        "分页编号无效",
      );
      args.push(q.after);
      where += " AND id>$" + args.length;
    }
    const rows = (
      await ctx.db.query(
        "SELECT data FROM ranch_animals WHERE " +
          where +
          " ORDER BY id LIMIT 21",
        args,
      )
    ).rows;
    const animals = rows
      .slice(0, 20)
      .map((r) =>
        animalView(
          r.data,
          { at: Date.now(), feedMs: 0, animals: [] } as unknown as RanchState,
          isOwner,
        ),
      );
    return {
      animals,
      total,
      next: rows.length > 20 ? animals.at(-1)!.id : null,
    };
  },
  async record(ctx, id, isOwner) {
    check(typeof id === "string" && id.length <= 80, "动物编号无效");
    const a = (
      await ctx.db.query(
        'SELECT data FROM ranch_animals WHERE game_id=$1 AND world_id=$2 AND "user"=$3 AND id=$4',
        [ctx.gameId, ctx.world, ctx.owner, id],
      )
    ).rows[0]?.data as Animal | undefined;
    check(
      a && (isOwner || (a.status === "hall" && a.display)),
      "动物记录不存在",
      404,
    );
    const events = isOwner
      ? (
          await ctx.db.query(
            'SELECT id,animal_id AS "animalId",created AS at,type,message FROM ranch_animal_events WHERE game_id=$1 AND world_id=$2 AND "user"=$3 AND animal_id=$4 ORDER BY created DESC,id DESC LIMIT 50',
            [ctx.gameId, ctx.world, ctx.owner, id],
          )
        ).rows
      : [];
    return {
      animal: animalView(
        a,
        { at: Date.now(), feedMs: 0, animals: [] } as unknown as RanchState,
        isOwner,
      ),
      events,
    };
  },
};
