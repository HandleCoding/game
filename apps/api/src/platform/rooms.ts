import type { ServerResponse } from "node:http";
import { createHash, randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  Snapshot,
  State,
  Invite,
} from "../../../../packages/contracts/src/index.js";
import type { MatchEngine } from "../games/contracts.js";
import { registry } from "../games/registry.js";
import { pool, transaction } from "./db/store.js";
import { user, token } from "./accounts.js";
import { check, GameError } from "./errors.js";
export interface Room {
  code: string;
  host: string;
  gameId: string;
  gameVersion: number;
  matchId: string;
  revision: number;
  members: string[];
  engine: MatchEngine;
}
export function restoreSnapshot(s: Snapshot): Room {
  check(s.snapshotVersion === 2, "房间快照版本不支持");
  const engine = registry.match(s.gameId, s.gameVersion).restore(s.engine);
  return {
    code: s.code,
    host: s.host,
    gameId: s.gameId,
    gameVersion: s.gameVersion,
    matchId: s.matchId,
    revision: s.revision,
    members: s.members,
    engine,
  };
}
export function snapshot(r: Room): Snapshot {
  return {
    snapshotVersion: 2,
    code: r.code,
    host: r.host,
    gameId: r.gameId,
    gameVersion: r.gameVersion,
    matchId: r.matchId,
    revision: r.revision,
    members: [...r.members],
    savedAt: Date.now(),
    engine: r.engine.serialize(),
  };
}
export class RoomHub {
  rooms = new Map<string, Room>();
  streams = new Map<string, Set<ServerResponse>>();
  invites = new Map<
    string,
    Omit<Invite, "name" | "gameName" | "seconds" | "disableHistory">
  >();
  private queue: Promise<unknown> = Promise.resolve();
  private stopping = false;
  run<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(fn);
    this.queue = task.catch(() => {});
    return task;
  }
  online = (id: string) => !!this.streams.get(id)?.size;
  roomFor(id: string) {
    return [...this.rooms.values()].find((r) => r.members.includes(id));
  }
  async load() {
    for (const row of (
      await pool.query<{ snapshot: Snapshot }>(
        "SELECT snapshot FROM active_rooms",
      )
    ).rows) {
      const s = row.snapshot,
        r = restoreSnapshot(s),
        e = r.engine;
      e.away = {};
      if (e.phase !== "finished") {
        e.remaining = e.paused
          ? e.remaining
          : e.deadline
            ? Math.max(0, e.deadline - s.savedAt)
            : null;
        e.paused = true;
        for (const p of e.players) e.away[p] = Date.now() + 60000;
      }
      this.rooms.set(r.code, r);
    }
  }
  async state(id: string): Promise<State> {
    const u = await user(id);
    check(u, "用户不存在", 401);
    const names = new Map(
      (
        await pool.query<{ id: string; name: string }>(
          "SELECT id,name FROM users",
        )
      ).rows.map((p) => [p.id, p.name]),
    );
    const name = (p: string) => names.get(p) || "玩家",
      r = this.roomFor(id);
    const past = (
      await pool.query(
        'SELECT r.* FROM results r JOIN result_players p ON p.result=r.id WHERE p."user"=$1 ORDER BY r.created DESC LIMIT 8',
        [id],
      )
    ).rows;
    const counts = (
      await pool.query(
        'SELECT count(*)::int AS played,count(*) FILTER(WHERE outcome=$2)::int AS wins FROM result_players WHERE "user"=$1',
        [id, "win"],
      )
    ).rows[0];
    return {
      me: { id: u.id, account: u.account, name: u.name },
      games: registry.catalog(),
      players: [...this.streams.keys()].filter(this.online).map((p) => {
        const room = this.roomFor(p),
          meta = room ? registry.match(room.gameId).metadata : null;
        return {
          id: p,
          name: name(p),
          busy: !!room,
          game: room
            ? {
                id: room.gameId,
                name: meta!.name,
                phase: room.engine.phase,
                startedAt: room.engine.startedAt,
              }
            : null,
        };
      }),
      room: r
        ? {
            ...r.engine.view(id, name, this.online),
            matchId: r.matchId,
            revision: r.revision,
          }
        : null,
      invites: [...this.invites.values()]
        .filter((i) => i.to === id && i.expires > Date.now())
        .map((i) => {
          const target = this.rooms.get(i.code);
          return {
            ...i,
            name: name(i.from),
            gameName: target
              ? registry.match(target.gameId).metadata.name
              : "游戏",
            seconds: target?.engine.seconds || 30,
            disableHistory: target?.engine.disableHistory || false,
          };
        }),
      stats: counts,
      recent: past.map((p) => ({
        id: p.id,
        gameId: p.game_id,
        winner: p.winner,
        reason: p.reason,
        turns: p.turns,
        created: p.created,
        hasReview: p.review_json !== null,
      })),
      serverNow: Date.now(),
    };
  }
  notice(id: string, message: string) {
    for (const res of this.streams.get(id) || [])
      res.write("event: notice\ndata: " + JSON.stringify({ message }) + "\n\n");
  }
  async broadcast() {
    for (const [id, streams] of this.streams) {
      if (!streams.size) continue;
      const message =
        "event: state\ndata: " + JSON.stringify(await this.state(id)) + "\n\n";
      for (const res of streams) {
        if (res.writableLength > 262144) {
          res.destroy();
          continue;
        }
        res.write(message);
      }
    }
  }
  private async save(db: PoolClient, before: Map<string, Snapshot>) {
    for (const [code, r] of this.rooms) {
      const old = before.get(code),
        current = snapshot(r);
      if (
        old &&
        JSON.stringify({ ...old, savedAt: 0, revision: 0 }) ===
          JSON.stringify({ ...current, savedAt: 0, revision: 0 })
      )
        continue;
      r.revision++;
      current.revision = r.revision;
      const result = r.engine.result();
      if (result && !r.engine.completed) {
        await db.query(
          "INSERT INTO results(id,code,players,winner,reason,turns,created,game_id,game_version,match_id,settings_json,review_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(match_id) DO NOTHING",
          [
            r.matchId,
            code,
            JSON.stringify(r.engine.players),
            result.winner,
            result.reason,
            result.turns,
            Date.now(),
            r.gameId,
            r.gameVersion,
            r.matchId,
            JSON.stringify({
              seconds: r.engine.seconds,
              disableHistory: r.engine.disableHistory,
            }),
            JSON.stringify(result.review),
          ],
        );
        for (const p of result.participants)
          await db.query(
            'INSERT INTO result_players("user",result,outcome,score) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
            [p.userId, r.matchId, p.outcome, p.score],
          );
        r.engine.completed = true;
        current.engine = r.engine.serialize();
      }
      await db.query(
        "INSERT INTO active_rooms VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET snapshot=EXCLUDED.snapshot",
        [code, JSON.stringify(current)],
      );
    }
    for (const code of before.keys())
      if (!this.rooms.has(code))
        await db.query("DELETE FROM active_rooms WHERE code=$1", [code]);
  }
  private async change<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const before = new Map(
        [...this.rooms].map(([code, r]) => [code, snapshot(r)]),
      ),
      invitations = structuredClone([...this.invites]);
    try {
      return await transaction(async (db) => {
        const result = await fn(db);
        await this.save(db, before);
        return result;
      });
    } catch (e) {
      this.rooms = new Map(
        [...before].map(([code, s]) => [code, restoreSnapshot(s)]),
      );
      this.invites = new Map(invitations);
      throw e;
    }
  }
  private clearInvites(r: Room, id?: string) {
    for (const [key, i] of this.invites)
      if (i.code === r.code || i.to === id) this.invites.delete(key);
  }
  private join(r: Room, id: string) {
    check(!this.roomFor(id), "你已经在房间里了");
    const meta = registry.match(r.gameId).metadata;
    check(
      r.engine.phase === "waiting" && r.members.length < meta.maxPlayers,
      "房间已满或已经开始",
    );
    r.engine.join(id);
    r.members.push(id);
    this.clearInvites(r, id);
  }
  private leave(id: string) {
    const r = this.roomFor(id);
    if (!r) return;
    if (r.engine.phase === "waiting") {
      r.members = r.members.filter((p) => p !== id);
      if (!r.members.length) {
        this.rooms.delete(r.code);
      } else {
        r.host = r.members[0];
        r.engine.host = r.host;
        r.engine.players = [...r.members];
        r.engine.reset();
      }
    } else {
      if (r.engine.phase !== "finished") r.engine.leave(id);
      r.members = r.members.filter((p) => p !== id);
      if (!r.members.length) this.rooms.delete(r.code);
    }
    this.clearInvites(r);
  }
  async mutate(id: string, op: string, b: Record<string, unknown>) {
    return this.run(async () => {
      let feedback: State["feedback"], actionError: GameError | undefined;
      await this.change(async (db) => {
        let r = this.roomFor(id);
        let receipt = false;
        let fingerprint = "";
        if (b.requestId !== undefined) {
          check(
            typeof b.requestId === "string" &&
              b.requestId.length >= 8 &&
              b.requestId.length <= 100,
            "请求编号无效",
          );
          fingerprint = createHash("sha256")
            .update(
              JSON.stringify({
                op,
                matchId: b.matchId,
                payload: Object.fromEntries(
                  Object.entries(b)
                    .filter(
                      ([k]) => !["requestId", "expectedRevision"].includes(k),
                    )
                    .sort(),
                ),
              }),
            )
            .digest("hex");
          const cached = (
            await db.query(
              "SELECT * FROM action_receipts WHERE actor=$1 AND request_id=$2",
              [id, b.requestId],
            )
          ).rows[0];
          if (cached) {
            check(
              cached.fingerprint === fingerprint,
              "请求编号已用于其他操作",
              409,
            );
            feedback = cached.response.feedback;
            return;
          }
          receipt = true;
        }
        if (b.matchId !== undefined) {
          check(r && r.matchId === b.matchId, "对局已变化，请刷新状态", 409);
          check(b.expectedRevision === r.revision, "状态已变化，请重试", 409);
        }
        try {
          switch (op) {
            case "create": {
              check(!r, "先离开当前房间再创建");
              const def = registry.match(String(b.gameId || "guess-number"));
              let code;
              do {
                code = String(randomInt(100000, 1000000));
              } while (this.rooms.has(code));
              const engine = def.create(
                code,
                id,
                (b.seconds as number) ?? def.metadata.defaultSeconds,
              );
              engine.disableHistory = (b.disableHistory as boolean) ?? false;
              r = {
                code,
                host: id,
                gameId: def.metadata.id,
                gameVersion: def.metadata.version,
                matchId: token(),
                revision: 0,
                members: [id],
                engine,
              };
              this.rooms.set(code, r);
              break;
            }
            case "join": {
              const target = this.rooms.get(String(b.code));
              check(target, "房间不存在或已结束");
              this.join(target, id);
              break;
            }
            case "invite": {
              check(
                r &&
                  r.engine.phase === "waiting" &&
                  r.members.length <
                    registry.match(r.gameId).metadata.maxPlayers,
                "请先创建等待中的房间",
              );
              const to = String(b.to);
              check(
                to !== id && this.online(to) && !this.roomFor(to),
                "对方暂时无法接受邀请",
              );
              check(
                ![...this.invites.values()].some(
                  (i) => i.from === id && i.to === to && i.expires > Date.now(),
                ),
                "邀请已经发出",
              );
              const key = token();
              this.invites.set(key, {
                id: key,
                from: id,
                to,
                code: r.code,
                expires: Date.now() + 15000,
              });
              break;
            }
            case "invite/respond": {
              const i = this.invites.get(String(b.id));
              check(i && i.to === id && i.expires > Date.now(), "邀请已过期");
              if (b.accept) {
                const target = this.rooms.get(i.code);
                check(target, "房间已结束");
                this.join(target, id);
              }
              this.invites.delete(i.id);
              break;
            }
            case "leave":
              this.leave(id);
              break;
            case "logout":
              this.leave(id);
              break;
            case "settings":
              check(r, "请先进入房间");
              r.engine.configure(
                id,
                b.seconds as number,
                b.disableHistory === undefined
                  ? r.engine.disableHistory
                  : (b.disableHistory as boolean),
              );
              break;
            case "ready":
              check(typeof b.ready === "boolean", "请选择有效的准备状态");
              check(r, "请先进入房间");
              r.engine.prepare(id, b.ready as boolean);
              if (r.engine.phase !== "waiting") this.clearInvites(r);
              break;
            case "rematch":
              check(
                r &&
                  r.engine.phase === "finished" &&
                  r.members.length === r.engine.players.length,
                "对方已离开，请重新邀请",
              );
              r.engine.reset();
              r.matchId = token();
              for (const p of r.members)
                if (!this.online(p)) r.engine.disconnect(p);
              break;
            default:
              check(r, "请先进入房间");
              feedback = r.engine.action(id, op, b) as State["feedback"];
              break;
          }
        } catch (e) {
          if (e instanceof GameError) actionError = e;
          else throw e;
        }
        if (receipt && !actionError)
          await db.query(
            "INSERT INTO action_receipts VALUES($1,$2,$3,$4,$5,$6)",
            [
              id,
              b.requestId,
              r?.matchId || String(b.matchId || "platform"),
              fingerprint,
              JSON.stringify({ feedback }),
              Date.now(),
            ],
          );
      });
      await this.broadcast();
      if (actionError) throw actionError;
      return { ...(await this.state(id)), ...(feedback ? { feedback } : {}) };
    });
  }
  async attach(id: string, res: ServerResponse) {
    await this.run(async () => {
      check(!this.stopping, "服务正在维护", 503);
      if (!this.streams.has(id)) this.streams.set(id, new Set());
      check(this.streams.get(id)!.size < 5, "连接过多");
      this.streams.get(id)!.add(res);
      await this.change(async () => {
        this.roomFor(id)?.engine.reconnect(id);
      });
      await this.broadcast();
    });
    res.on("close", () => {
      void this.run(async () => {
        this.streams.get(id)?.delete(res);
        if (!this.online(id)) {
          this.streams.delete(id);
          if (!this.stopping)
            await this.change(async () => {
              this.roomFor(id)?.engine.disconnect(id);
            });
        }
        if (!this.stopping) await this.broadcast();
      }).catch(console.error);
    });
  }
  async tick() {
    await this.run(async () => {
      if (this.stopping) return;
      let changed = false;
      await this.change(async () => {
        for (const r of this.rooms.values())
          if (r.engine.tick()) changed = true;
        for (const [key, i] of this.invites)
          if (i.expires <= Date.now()) {
            this.invites.delete(key);
            this.notice(i.from, "15 秒内未回应，邀请已自动拒绝");
            changed = true;
          }
      });
      if (changed) await this.broadcast();
      for (const clients of this.streams.values())
        for (const res of clients) res.write(": heartbeat\n\n");
    });
  }
  async close() {
    await this.run(async () => {
      this.stopping = true;
      await this.change(async () => {});
      for (const clients of this.streams.values())
        for (const res of clients) res.end();
    });
  }
}
