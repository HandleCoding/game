import type {
  GameDefinition,
  MatchDefinition,
  PersistentDefinition,
} from "./contracts.js";
import { guessNumber } from "./guess-number/definition.js";
import { check } from "../platform/errors.js";
export class GameRegistry {
  private games = new Map<string, GameDefinition>();
  register(def: GameDefinition) {
    check(!this.games.has(def.metadata.id), "重复游戏注册");
    this.games.set(def.metadata.id, def);
  }
  catalog() {
    return [...this.games.values()].map((g) => g.metadata);
  }
  match(id: string, version?: number): MatchDefinition {
    const def = this.games.get(id);
    check(def?.metadata.kind === "match", "游戏尚未开放");
    check(
      version === undefined || def.metadata.version === version,
      "游戏规则版本无法恢复",
    );
    return def as MatchDefinition;
  }
  persistent(id: string): PersistentDefinition {
    const def = this.games.get(id);
    check(def?.metadata.kind === "persistent", "长期游戏尚未开放");
    return def as PersistentDefinition;
  }
}
export const registry = new GameRegistry();
registry.register(guessNumber);
