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
    const animals = (
      await ctx.db.query(
        "SELECT data FROM ranch_animals WHERE game_id=$1 AND world_id=$2 AND \"user\"=$3 AND (status IN ('legacy','juvenile','producing','completed') OR id=$4)",
        [...args, ctx.animalId ?? ""],
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
    return {
      ...summary,
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
    s.collection = await stats(ctx);
    s.hallCount = Object.values(s.collection).reduce(
      (n, v) => n + (v?.hall ?? 0),
      0,
    );
    return { version: 2, at: s.at, feedUnitMs: s.feedUnitMs };
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
