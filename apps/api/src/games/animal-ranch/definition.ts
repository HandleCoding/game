import type { PersistentDefinition } from "../contracts.js";
import { initialRanch, settleRanch, ranchAction, ranchView } from "./engine.js";
import { ranchStorage } from "./storage.js";
export const animalRanch: PersistentDefinition = {
  metadata: {
    id: "animal-ranch",
    name: "一起牧场",
    kind: "persistent",
    category: "养成 · 动物",
    minPlayers: 1,
    maxPlayers: 1,
    defaultSeconds: 0,
    version: 1,
    description: "认养可爱动物，喂养、收获、扩建。离线也会成长，随时回来看看。",
    rules: [
      "每个账号都有独立牧场，无需创建房间或等待其他玩家。",
      "初始获得 800 金币、240 份饲料和一只成年小鸡，先收获试试看。",
      "36 种家禽家畜、萌宠与动物园伙伴，等级提升逐步解锁，各自成长和产出时间不同。",
      "每只动物每 30 分钟吃 1 份饲料。缺粮会暂停成长，不会死亡；补粮后继续。",
      "每只动物最多保留 3 轮产物，及时收获到仓库，再出售换金币。",
      "关掉网页仍按服务器时间结算；手机和电脑共用同一个存档。",
      "所有玩家可以参观其他人的牧场，首版参观不修改对方资源。",
    ],
  },
  initialState: initialRanch,
  settle: settleRanch,
  action: (s, t, p) => ranchAction(s, t, p),
  view: (s, o) => ranchView(s, o) as unknown as Record<string, unknown>,
  storage: ranchStorage,
};
