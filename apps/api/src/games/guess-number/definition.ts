import { Duel } from "./engine.js";
import type { MatchDefinition } from "../contracts.js";
export const guessNumber: MatchDefinition = {
  metadata: {
    id: "guess-number",
    name: "猜数字",
    kind: "match",
    category: "推理",
    minPlayers: 2,
    maxPlayers: 2,
    defaultSeconds: 30,
    version: 1,
    description: "藏好四位秘密数字，轮流推理，先猜中对方的人获胜。",
    rules: [
      "双方准备后提交 0000–9999，可重复，可前导零",
      "掷骰子，高点先猜，平局重掷",
      "只返回相同位置命中数量，4 位命中获胜",
      "超时跳过；记忆模式结束后开放双方复盘",
    ],
  },
  create: (code, host, seconds) => new Duel(code, host, seconds),
  restore(data) {
    const engine = new Duel(
      data.code as string,
      data.host as string,
      data.seconds as number,
    );
    Object.assign(engine, data);
    return engine;
  },
};
