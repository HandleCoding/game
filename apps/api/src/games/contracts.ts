import type { PoolClient } from "pg";
import type {
  GameMeta,
  Result,
  RoomView,
  PlatformRoomView,
  PlatformRoomCore,
} from "../../../../packages/contracts/src/index.js";
export interface MatchEngine {
  code: string;
  host: string;
  seconds: number;
  players: string[];
  phase: string;
  startedAt: number | null;
  paused: boolean;
  deadline: number | null;
  remaining: number | null;
  away: Record<string, number>;
  disableHistory: boolean;
  completed: boolean;
  join(id: string): void;
  configure(id: string, seconds: number, disableHistory: boolean): void;
  prepare(id: string, ready: boolean): void;
  reset(): void;
  action(id: string, type: string, payload: Record<string, unknown>): unknown;
  disconnect(id: string): void;
  reconnect(id: string): void;
  tick(): boolean;
  leave(id: string): void;
  view(
    id: string,
    name: (id: string) => string,
    online: (id: string) => boolean,
  ): PlatformRoomCore & Record<string, unknown>;
  serialize(): Record<string, unknown>;
  result(): Result | null;
}
export interface MatchDefinition {
  metadata: GameMeta & { kind: "match" };
  create(code: string, host: string, seconds: number): MatchEngine;
  restore(data: Record<string, unknown>): MatchEngine;
}
export interface PersistentStorageContext {
  db: PoolClient;
  gameId: string;
  world: string;
  owner: string;
}
export interface PersistentStorage {
  directory?(ctx: PersistentStorageContext): Promise<Record<string, unknown>[]>;
  load(
    summary: Record<string, unknown>,
    ctx: PersistentStorageContext,
  ): Promise<Record<string, unknown>>;
  save(
    state: Record<string, unknown>,
    ctx: PersistentStorageContext,
  ): Promise<Record<string, unknown>>;
}
export interface PersistentDefinition {
  storage?: PersistentStorage;
  metadata: GameMeta & { kind: "persistent" };
  initialState(): Record<string, unknown>;
  settle(
    state: Record<string, unknown>,
    last: number,
    now: number,
  ): Record<string, unknown>;
  action(
    state: Record<string, unknown>,
    type: string,
    payload: Record<string, unknown>,
    actor: string,
  ): Record<string, unknown>;
  view(
    state: Record<string, unknown>,
    isOwner: boolean,
  ): Record<string, unknown>;
}
export type GameDefinition = MatchDefinition | PersistentDefinition;
