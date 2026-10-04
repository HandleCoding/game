export type Phase = "waiting" | "secrets" | "dice" | "playing" | "finished";
export interface Player {
  id: string;
  name: string;
  online: boolean;
  ready: boolean;
  secretSet: boolean;
  die: number | null;
}
export interface Guess {
  player: string;
  value?: string;
  hits?: number;
  at: number;
  timeout: boolean;
}
export interface GameMeta {
  id: string;
  name: string;
  kind: "match" | "persistent";
  category: string;
  minPlayers: number;
  maxPlayers: number;
  defaultSeconds: number;
  description: string;
  rules: string[];
  version: number;
}
export interface RoomView extends PlatformRoomView {
  code: string;
  gameId: string;
  host: string;
  seconds: number;
  phase: Phase;
  startedAt: number | null;
  players: Player[];
  ownSecret: string | null;
  revealed?: Record<string, string>;
  turn: string | null;
  deadline: number | null;
  paused: boolean;
  remaining: number | null;
  away: Record<string, number>;
  winner: string | null;
  reason: string | null;
  disableHistory: boolean;
  turnCount: number;
  lastOpponentGuess: { value?: string; hits?: number; at: number } | null;
  history: Guess[];
  diceRound: number;
  lastTie: Record<string, number> | null;
  matchId: string;
  revision: number;
}
export interface PlatformRoomCore {
  code: string;
  gameId: string;
  host: string;
  phase: string;
  startedAt: number | null;
  players: { id: string; name: string; online: boolean; ready: boolean }[];
}
export interface PlatformRoomView extends PlatformRoomCore {
  matchId: string;
  revision: number;
  [field: string]: unknown;
}
export interface OnlinePlayer {
  id: string;
  name: string;
  busy: boolean;
  game: {
    id: string;
    name: string;
    phase: string;
    startedAt: number | null;
  } | null;
}
export interface Invite {
  id: string;
  from: string;
  to: string;
  code: string;
  expires: number;
  name: string;
  gameName: string;
  seconds: number;
  disableHistory: boolean;
}
export interface State {
  me: { id: string; account: string; name: string };
  games: GameMeta[];
  players: OnlinePlayer[];
  room: PlatformRoomView | null;
  invites: Invite[];
  stats: { played: number; wins: number };
  recent: {
    id: string;
    gameId: string;
    winner: string | null;
    reason: string;
    turns: number;
    created: number;
    hasReview: boolean;
  }[];
  serverNow: number;
  feedback?: { value: string; hits: number };
}
export interface Result {
  winner: string | null;
  reason: string;
  turns: number;
  participants: {
    userId: string;
    outcome: "win" | "loss" | "draw";
    score: number | null;
  }[];
  review: unknown;
}
export interface Snapshot {
  snapshotVersion: 2;
  code: string;
  host: string;
  gameId: string;
  gameVersion: number;
  matchId: string;
  revision: number;
  members: string[];
  savedAt: number;
  engine: Record<string, unknown>;
}
export const turnSeconds = [15, 30, 45, 60, 90] as const;
