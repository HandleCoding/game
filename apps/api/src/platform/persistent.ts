import { transaction } from "./db/store.js";
import { registry } from "../games/registry.js";
import { check } from "./errors.js";
export class PersistentService {
  async view(gameId: string, actor: string, owner = actor, world = "default") {
    const def = registry.persistent(gameId);
    return transaction(async (db) => {
      if (actor === owner)
        await db.query(
          "INSERT INTO persistent_profiles VALUES($1,$2,$3,$4,0,$5,$6) ON CONFLICT DO NOTHING",
          [
            gameId,
            world,
            owner,
            def.metadata.version,
            Date.now(),
            JSON.stringify(def.initialState()),
          ],
        );
      const row = (
        await db.query(
          'SELECT * FROM persistent_profiles WHERE game_id=$1 AND world_id=$2 AND "user"=$3 FOR UPDATE',
          [gameId, world, owner],
        )
      ).rows[0];
      check(row, "存档不存在");
      check(row.version === def.metadata.version, "存档版本不支持");
      const now = Date.now(),
        state = def.settle(row.state, row.last_settled_at, now);
      await db.query(
        'UPDATE persistent_profiles SET state=$4,last_settled_at=$5 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
        [gameId, world, owner, JSON.stringify(state), now],
      );
      return {
        gameId,
        owner,
        world,
        revision: row.revision,
        serverNow: now,
        state: def.view(state, actor === owner),
      };
    });
  }
  async action(
    gameId: string,
    actor: string,
    b: {
      requestId: string;
      expectedRevision: number;
      type: string;
      payload: Record<string, unknown>;
    },
  ) {
    const def = registry.persistent(gameId);
    return transaction(async (db) => {
      const scope = "persistent:" + gameId;
      const fingerprint = JSON.stringify({
        scope,
        type: b.type,
        payload: b.payload,
      });
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        actor + ":" + b.requestId,
      ]);
      const prior = (
        await db.query(
          "SELECT * FROM action_receipts WHERE actor=$1 AND request_id=$2",
          [actor, b.requestId],
        )
      ).rows[0];
      if (prior) {
        check(prior.fingerprint === fingerprint, "请求编号已用于其他操作", 409);
        return prior.response;
      }
      const row = (
        await db.query(
          'SELECT * FROM persistent_profiles WHERE game_id=$1 AND world_id=$2 AND "user"=$3 FOR UPDATE',
          [gameId, "default", actor],
        )
      ).rows[0];
      check(row, "请先进入游戏");
      check(row.revision === b.expectedRevision, "存档已变化", 409);
      check(row.version === def.metadata.version, "存档版本不支持");
      const now = Date.now(),
        settled = def.settle(row.state, row.last_settled_at, now),
        state = def.action(settled, b.type, b.payload, actor);
      await db.query(
        'UPDATE persistent_profiles SET state=$4,revision=revision+1,last_settled_at=$5 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
        [gameId, "default", actor, JSON.stringify(state), now],
      );
      const response = {
        gameId,
        revision: row.revision + 1,
        serverNow: now,
        state: def.view(state, true),
      };
      await db.query("INSERT INTO action_receipts VALUES($1,$2,$3,$4,$5,$6)", [
        actor,
        b.requestId,
        scope,
        fingerprint,
        JSON.stringify(response),
        now,
      ]);
      return response;
    });
  }
}
