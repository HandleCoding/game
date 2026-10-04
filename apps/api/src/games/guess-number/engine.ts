import { randomInt } from "node:crypto";

export const validNumber = (value: unknown) =>
  typeof value === "string" && /^\d{4}$/.test(value);
export const hits = (secret: string, guess: string) =>
  [...guess].filter((digit, i) => secret[i] === digit).length;
import { GameError } from "../../platform/errors.js";
export { GameError };
const requireThat = (ok: unknown, message: string) => {
  if (!ok) throw new GameError(message);
};

export class Duel {
  code: string;
  host: string;
  seconds: number;
  now: () => number;
  roll: () => number;
  gameId: string;
  players: string[];
  created: number;
  disableHistory: boolean;
  phase: "waiting" | "secrets" | "dice" | "playing" | "finished" = "waiting";
  startedAt: number | null = null;
  ready: Record<string, boolean> = {};
  secrets: Record<string, string> = {};
  dice: Record<string, number> = {};
  diceRound = 1;
  history: import("../../../../../packages/contracts/src/index.js").Guess[] =
    [];
  turn: string | null = null;
  deadline: number | null = null;
  paused = false;
  lastTie: Record<string, number> | null = null;
  remaining: number | null = null;
  away: Record<string, number> = {};
  winner: string | null = null;
  reason: string | null = null;
  completed = false;

  constructor(
    code: string,
    host: string,
    seconds = 30,
    now = Date.now,
    roll = () => randomInt(1, 7),
  ) {
    requireThat([15, 30, 45, 60, 90].includes(seconds), "请选择有效的回合时间");
    this.code = code;
    this.host = host;
    this.seconds = seconds;
    this.now = now;
    this.roll = roll;
    this.gameId = "guess-number";
    this.players = [host];
    this.created = now();
    this.disableHistory = false;
    this.reset();
  }
  reset() {
    this.phase = "waiting";
    this.startedAt = null;
    this.ready = {};
    this.secrets = {};
    this.dice = {};
    this.diceRound = 1;
    this.history = [];
    this.turn = null;
    this.deadline = null;
    this.paused = false;
    this.lastTie = null;
    this.remaining = null;
    this.away = {};
    this.winner = null;
    this.reason = null;
    this.completed = false;
  }
  member(id: string) {
    requireThat(this.players.includes(id), "你不在这个房间");
  }
  join(id: string) {
    requireThat(
      this.phase === "waiting" && this.players.length === 1,
      "房间已满或已经开始",
    );
    requireThat(id !== this.host, "你已经在房间里");
    this.players.push(id);
  }
  configure(id: string, seconds: number, disableHistory = this.disableHistory) {
    this.member(id);
    requireThat(
      id === this.host && this.phase === "waiting",
      "只有房主可以在准备前调整设置",
    );
    requireThat([15, 30, 45, 60, 90].includes(seconds), "请选择有效的回合时间");
    requireThat(
      typeof disableHistory === "boolean",
      "请选择有效的历史记录设置",
    );
    this.seconds = seconds;
    this.disableHistory = disableHistory;
    this.ready = {};
  }
  prepare(id: string, value: boolean) {
    this.member(id);
    requireThat(this.phase === "waiting", "这一阶段不能修改准备状态");
    this.ready[id] = !!value;
    if (this.players.length === 2 && this.players.every((p) => this.ready[p])) {
      this.phase = "secrets";
      this.startedAt = this.now();
    }
  }
  secret(id: string, value: string) {
    this.member(id);
    requireThat(this.phase === "secrets", "还没到设置数字的时候");
    requireThat(
      validNumber(value),
      "请输入 0000–9999 的四位数字，可以重复或以零开头",
    );
    requireThat(!this.secrets[id], "秘密数字已锁定");
    this.secrets[id] = value;
    if (this.players.every((p) => this.secrets[p])) this.phase = "dice";
  }
  throwDice(id: string) {
    this.member(id);
    requireThat(this.phase === "dice" && !this.paused, "现在不能掷骰");
    requireThat(!this.dice[id], "这一轮已经掷过骰子");
    this.dice[id] = this.roll();
    if (!this.players.every((p) => this.dice[p])) return;
    const [a, b] = this.players;
    if (this.dice[a] === this.dice[b]) {
      this.lastTie = { ...this.dice };
      this.dice = {};
      this.diceRound++;
      return;
    }
    this.turn = this.dice[a] > this.dice[b] ? a : b;
    this.phase = "playing";
    this.deadline = this.now() + this.seconds * 1000;
  }
  next() {
    this.turn = this.players.find((p) => p !== this.turn) || null;
    this.deadline = this.now() + this.seconds * 1000;
  }
  guess(id: string, value: string) {
    this.member(id);
    requireThat(this.phase === "playing" && !this.paused, "请等待对局恢复");
    if (this.now() >= this.deadline!) {
      this.expire();
      throw new GameError("本回合已超时，轮到对方了");
    }
    requireThat(id === this.turn, "还没有轮到你");
    requireThat(validNumber(value), "请输入 0000–9999 的四位数字");
    const count = hits(
      this.secrets[this.players.find((p) => p !== id)!],
      value,
    );
    this.history.push({
      player: id,
      value,
      hits: count,
      at: this.now(),
      timeout: false,
    });
    if (count === 4) this.finish(id, "guessed");
    else this.next();
    return count;
  }
  expire() {
    if (this.phase !== "playing" || this.paused || this.now() < this.deadline!)
      return false;
    this.history.push({ player: this.turn!, timeout: true, at: this.now() });
    this.next();
    return true;
  }
  finish(winner: string | null, reason: string) {
    this.winner = winner;
    this.reason = reason;
    this.phase = "finished";
    this.deadline = null;
    this.paused = false;
  }
  disconnect(id: string) {
    this.member(id);
    if (this.phase === "finished" || this.away[id]) return;
    this.away[id] = this.now() + 60000;
    if (!this.paused) {
      this.remaining = this.deadline
        ? Math.max(0, this.deadline! - this.now())
        : null;
      this.paused = true;
    }
  }
  reconnect(id: string) {
    delete this.away[id];
    if (this.paused && !Object.keys(this.away).length) {
      this.paused = false;
      if (this.phase === "playing")
        this.deadline = this.now() + (this.remaining ?? 0);
      this.remaining = null;
    }
  }
  tick() {
    if (this.phase === "finished") return false;
    const expired = this.players.find(
      (p) => this.away[p] && this.now() >= this.away[p],
    );
    if (expired) {
      this.finish(
        this.players.find((p) => p !== expired && !this.away[p]) || null,
        "disconnect",
      );
      return true;
    }
    return this.expire();
  }
  action(id: string, type: string, payload: Record<string, unknown>) {
    if (type === "secret") return this.secret(id, payload.value as string);
    if (type === "dice") return this.throwDice(id);
    if (type === "guess")
      return {
        value: payload.value as string,
        hits: this.guess(id, payload.value as string),
      };
    throw new GameError("没有这个游戏操作");
  }
  leave(id: string) {
    this.finish(this.players.find((p) => p !== id) || null, "left");
  }
  serialize(): Record<string, unknown> {
    const { now, roll, ...data } = this;
    return structuredClone(data);
  }
  result():
    import("../../../../../packages/contracts/src/index.js").Result | null {
    if (this.phase !== "finished") return null;
    return {
      winner: this.winner,
      reason: this.reason || "completed",
      turns: this.history.length,
      participants: this.players.map((userId) => ({
        userId,
        outcome: this.winner
          ? this.winner === userId
            ? ("win" as const)
            : ("loss" as const)
          : ("draw" as const),
        score: null,
      })),
      review: {
        type: "guess-number",
        version: 1,
        records: structuredClone(this.history),
        revealed: { ...this.secrets },
      },
    };
  }
  view(
    id: string,
    name: (id: string) => string,
    online: (id: string) => boolean,
  ) {
    this.member(id);
    const latest = this.history.findLast((h) => h.player !== id && !h.timeout);
    return {
      code: this.code,
      gameId: this.gameId,
      host: this.host,
      seconds: this.seconds,
      phase: this.phase,
      startedAt: this.startedAt,
      players: this.players.map((p) => ({
        id: p,
        name: name(p),
        online: online(p),
        ready: !!this.ready[p],
        secretSet: !!this.secrets[p],
        die: this.dice[p] || null,
      })),
      ownSecret: this.secrets[id] || null,
      revealed: this.phase === "finished" ? this.secrets : undefined,
      turn: this.turn,
      deadline: this.deadline,
      paused: this.paused,
      remaining: this.remaining,
      away: this.away,
      winner: this.winner,
      reason: this.reason,
      disableHistory: this.disableHistory,
      turnCount: this.history.length,
      lastOpponentGuess: latest
        ? { value: latest.value, hits: latest.hits, at: latest.at }
        : null,
      history:
        this.disableHistory && this.phase !== "finished" ? [] : this.history,
      diceRound: this.diceRound,
      lastTie: this.lastTie,
    };
  }
}
