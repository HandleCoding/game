import type { PersistentStorage } from "../contracts.js";
import type { RanchState, Animal } from "./engine.js";
export const ranchStorage: PersistentStorage = {
  async directory(ctx) {
    return (
      await ctx.db.query(
        `SELECT p."user" AS id,u.name,floor(w.xp/80.0)::int+1 AS level,(SELECT count(*)::int FROM ranch_animals a WHERE a.game_id=p.game_id AND a.world_id=p.world_id AND a."user"=p."user") AS animals FROM persistent_profiles p JOIN users u ON u.id=p."user" JOIN ranch_wallets w ON w.game_id=p.game_id AND w.world_id=p.world_id AND w."user"=p."user" WHERE p.game_id=$1 AND p.world_id=$2 AND p."user"<>$3 ORDER BY u.created,p."user" LIMIT 100`,
        [ctx.gameId, ctx.world, ctx.owner],
      )
    ).rows;
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
    const animals = (
      await ctx.db.query(
        'SELECT data FROM ranch_animals WHERE game_id=$1 AND world_id=$2 AND "user"=$3 ORDER BY length(id),id',
        args,
      )
    ).rows.map((r) => r.data as Animal);
    const inventory = Object.fromEntries(
      (
        await ctx.db.query(
          'SELECT product,quantity FROM ranch_inventory WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
          args,
        )
      ).rows.map((r) => [r.product, r.quantity]),
    );
    const entries = (
      await ctx.db.query(
        'SELECT id,created AS at,message,coins_delta AS coins FROM ranch_ledger WHERE game_id=$1 AND world_id=$2 AND "user"=$3 ORDER BY created DESC,id DESC LIMIT 20',
        args,
      )
    ).rows;
    return {
      ...summary,
      coins: wallet.coins,
      xp: wallet.xp,
      feedMs: wallet.feed_ms,
      capacity: wallet.capacity,
      nextAnimal: wallet.next_animal,
      animals,
      inventory,
      log: entries,
    };
  },
  async save(raw, ctx) {
    const s = raw as RanchState,
      args = [ctx.gameId, ctx.world, ctx.owner];
    await ctx.db.query(
      'INSERT INTO ranch_wallets VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(game_id,world_id,"user") DO UPDATE SET coins=EXCLUDED.coins,xp=EXCLUDED.xp,feed_ms=EXCLUDED.feed_ms,capacity=EXCLUDED.capacity,next_animal=EXCLUDED.next_animal',
      [...args, s.coins, s.xp, s.feedMs, s.capacity, s.nextAnimal],
    );
    await ctx.db.query(
      'DELETE FROM ranch_animals WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
      args,
    );
    for (const animal of s.animals)
      await ctx.db.query("INSERT INTO ranch_animals VALUES($1,$2,$3,$4,$5)", [
        ...args,
        animal.id,
        JSON.stringify(animal),
      ]);
    for (const [product, quantity] of Object.entries(s.inventory))
      await ctx.db.query(
        'INSERT INTO ranch_inventory VALUES($1,$2,$3,$4,$5) ON CONFLICT(game_id,world_id,"user",product) DO UPDATE SET quantity=EXCLUDED.quantity',
        [...args, product, quantity],
      );
    for (const entry of s.log)
      await ctx.db.query(
        "INSERT INTO ranch_ledger VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        [...args, entry.id, entry.at, entry.message, entry.coins],
      );
    return { version: s.version, at: s.at };
  },
};
