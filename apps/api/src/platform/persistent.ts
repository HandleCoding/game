import { transaction } from "./db/store.js";
import { registry } from "../games/registry.js";
import { check } from "./errors.js";
export class PersistentService {
  constructor(
    private readonly onChange?: (gameId: string, owner: string) => void,
  ) {}
  async preview(
    gameId: string,
    actor: string,
    payload: Record<string, unknown>,
  ) {
    const def = registry.persistent(gameId);
    check(def.storage?.preview, "游戏不支持融合预览");
    return transaction(async (db) => {
      const row = (
        await db.query(
          'SELECT * FROM persistent_profiles WHERE game_id=$1 AND world_id=$2 AND "user"=$3 FOR UPDATE',
          [gameId, "default", actor],
        )
      ).rows[0];
      check(row, "请先进入游戏");
      const ctx = {
        db,
        gameId,
        world: "default",
        owner: actor,
        action: { type: "fusionPreview", payload },
      };
      const loaded = await def.storage!.load(row.state, ctx);
      return {
        ...def.storage!.preview!(loaded, payload),
        revision: row.revision,
      };
    });
  }
  async collection(
    gameId: string,
    actor: string,
    owner: string,
    query: {
      mode?: string;
      after?: string;
      search?: string;
      fusion?: string;
      species?: string;
      grade?: string;
    },
  ) {
    const def = registry.persistent(gameId);
    check(def.storage?.collection, "游戏不支持收藏");
    await this.view(gameId, actor, owner);
    return transaction((db) =>
      def.storage!.collection!(
        { db, gameId, world: "default", owner },
        query,
        actor === owner,
      ),
    );
  }
  async record(gameId: string, actor: string, owner: string, id: string) {
    const def = registry.persistent(gameId);
    check(def.storage?.record, "游戏不支持成长记录");
    await this.view(gameId, actor, owner);
    return transaction((db) =>
      def.storage!.record!(
        { db, gameId, world: "default", owner },
        id,
        actor === owner,
      ),
    );
  }
  async list(gameId: string, actor: string) {
    const def = registry.persistent(gameId);
    return transaction(async (db) => ({
      players: def.storage?.directory
        ? await def.storage.directory({
            db,
            gameId,
            world: "default",
            owner: actor,
          })
        : (
            await db.query(
              'SELECT p."user" AS id,u.name FROM persistent_profiles p JOIN users u ON u.id=p."user" WHERE p.game_id=$1 AND p.world_id=$2 AND p."user"<>$3 ORDER BY u.created LIMIT 100',
              [gameId, "default", actor],
            )
          ).rows,
    }));
  }
  async view(gameId: string, actor: string, owner = actor, world = "default") {
    const def = registry.persistent(gameId);
    let notify = false;
    const result = await transaction(async (db) => {
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
      check(
        row.version === def.metadata.version ||
          def.previousVersions?.includes(row.version),
        "存档版本不支持",
      );
      const now = Date.now(),
        ctx = { db, gameId, world, owner },
        loaded = def.storage
          ? await def.storage.load(row.state, ctx)
          : row.state,
        state = def.settle(loaded, row.last_settled_at, now),
        saved = def.storage ? await def.storage.save(state, ctx) : state;
      const changed =
        row.version !== def.metadata.version ||
        (def.changeKey
          ? def.changeKey(loaded) !== def.changeKey(state)
          : false);
      notify = changed;
      await db.query(
        'UPDATE persistent_profiles SET state=$4,last_settled_at=$5,version=$6,revision=revision+$7 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
        [
          gameId,
          world,
          owner,
          JSON.stringify(saved),
          now,
          def.metadata.version,
          changed ? 1 : 0,
        ],
      );
      return {
        gameId,
        owner,
        ownerName:
          (await db.query("SELECT name FROM users WHERE id=$1", [owner]))
            .rows[0]?.name || "玩家",
        world,
        revision: row.revision + (changed ? 1 : 0),
        serverNow: now,
        state: def.view(state, actor === owner),
      };
    });
    if (notify) this.onChange?.(gameId, owner);
    return result;
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
      check(
        row.version === def.metadata.version ||
          def.previousVersions?.includes(row.version),
        "存档版本不支持",
      );
      const now = Date.now(),
        ctx = {
          db,
          gameId,
          world: "default",
          owner: actor,
          action: { type: b.type, payload: b.payload },
          animalId:
            typeof b.payload.animalId === "string"
              ? b.payload.animalId
              : undefined,
        },
        loaded = def.storage
          ? await def.storage.load(row.state, ctx)
          : row.state,
        settled = def.settle(loaded, row.last_settled_at, now),
        state = def.action(settled, b.type, b.payload, actor),
        saved = def.storage ? await def.storage.save(state, ctx) : state;
      await db.query(
        'UPDATE persistent_profiles SET state=$4,revision=revision+1,last_settled_at=$5,version=$6 WHERE game_id=$1 AND world_id=$2 AND "user"=$3',
        [
          gameId,
          "default",
          actor,
          JSON.stringify(saved),
          now,
          def.metadata.version,
        ],
      );
      const response = {
        gameId,
        owner: actor,
        world: "default",
        ownerName:
          (await db.query("SELECT name FROM users WHERE id=$1", [actor]))
            .rows[0]?.name || "玩家",
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
