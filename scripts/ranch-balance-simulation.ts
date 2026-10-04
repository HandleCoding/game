import {
  initialRanch,
  settleRanch,
  ranchAction,
  species,
  level,
  active,
  feeding,
} from "../apps/api/src/games/animal-ranch/engine.js";
import {
  HOUR,
  FEED_UNIT_MS,
  FEED_CAPACITY,
  expansionFor,
  xpForLevel,
} from "../packages/contracts/src/ranch-balance.js";
export function simulate(
  stepHours: number,
  strategy: "xp" | "income" | "low" = "income",
  days = 90,
  exit: "sellAnimal" | "enterHall" | "releaseAnimal" = "sellAnimal",
) {
  let s = initialRanch(0),
    actions = 0,
    hungryVisits = 0;
  const milestones: Record<string, number> = {},
    snapshots: Record<string, unknown> = {};
  function visit() {
    if (s.animals.some(feeding) && s.feedMs < s.animals.filter(feeding).length)
      hungryVisits++;
    const act = (type: string, payload = {}) => {
      s = ranchAction(s, type, payload);
      actions++;
    };
    if (s.animals.some((a) => a.stored)) act("harvest");
    if (s.lots.some((l) => l.quantity)) act("sellProducts");
    for (const a of s.animals.filter((a) => a.status === "completed"))
      act(exit, { animalId: a.id });
    s.animals = s.animals.filter(active);
    s.batches = s.batches.filter((b) => b.harvestedAt === null);
    s.events = [];
    s.log = [];
    s.lots = s.lots.filter((l) => l.quantity > 0);
    const reserve = Math.max(
      0,
      Math.ceil((stepHours + 12) * 2 * s.capacity) -
        Math.floor(s.feedMs / FEED_UNIT_MS),
    );
    const eligible = species.filter((k) => k.unlockLevel <= level(s.xp));
    const score = (k: (typeof species)[number]) => {
      const t = (k.growthMs + k.maxRounds * k.cycleMs) / HOUR;
      return strategy === "xp"
        ? k.lifetimeXp / t
        : (k.maxRounds * k.yield * k.sellPrice -
            k.price -
            2 * t +
            (exit === "sellAnimal" ? Math.floor(k.price * 0.15) : 0)) /
            t;
    };
    const options =
      strategy === "low"
        ? [species[0]!]
        : eligible.toSorted((a, b) => score(b) - score(a));
    const expansion = expansionFor(s.capacity);
    if (
      expansion &&
      level(s.xp) >= expansion.level &&
      s.coins >= expansion.cost + reserve + 4 * species[0]!.price
    )
      act("upgrade");
    while (s.animals.length < s.capacity) {
      const k = options.find((k) => k.price <= s.coins - reserve);
      if (!k) break;
      act("buyAnimal", { species: k.id });
    }
    const target = Math.min(
      FEED_CAPACITY,
      Math.ceil((stepHours + 12) * 2 * s.animals.filter(feeding).length),
    );
    for (const units of [300, 100, 20])
      while (s.feedMs / FEED_UNIT_MS + units <= target && s.coins >= units)
        act("buyFeed", { units });
    for (const l of [2, 3, 5, 8, 10, 15, 18, 20])
      if (level(s.xp) >= l && milestones[l] === undefined)
        milestones[l] = s.at / HOUR / 24;
  }
  visit();
  let dayRecorded = 0;
  for (let h = stepHours; h <= days * 24 + 1e-6; h += stepHours) {
    s = settleRanch(s, s.at, Math.round(h * HOUR));
    visit();
    const day = Math.floor(h / 24 + 1e-8);
    if (day > dayRecorded) {
      dayRecorded = day;
      if ([1, 7, 30, 90].includes(day))
        snapshots[day] = {
          level: level(s.xp),
          xp: s.xp,
          coins: s.coins,
          capacity: s.capacity,
          animals: s.animals.length,
        };
    }
  }
  return {
    stepHours,
    strategy,
    exit,
    milestones,
    snapshots,
    actions,
    hungryVisits,
    finalLevel: level(s.xp),
  };
}
if (process.argv[1]?.endsWith("ranch-balance-simulation.ts")) {
  const parameters = species.map((k) => {
    const t = (k.growthMs + k.maxRounds * k.cycleMs) / HOUR;
    return {
      id: k.id,
      name: k.name,
      level: k.unlockLevel,
      growthMinutes: k.growthMs / 60000,
      cycleMinutes: k.cycleMs / 60000,
      rounds: k.maxRounds,
      price: k.price,
      yield: k.yield,
      sellPrice: k.sellPrice,
      lifetimeXp: k.lifetimeXp,
      lifetimeHours: t,
      hallProfit: k.maxRounds * k.yield * k.sellPrice - k.price - 2 * t,
      xpPerHour: k.lifetimeXp / t,
    };
  });
  console.log(
    JSON.stringify(
      {
        version: 3,
        xpTo20: xpForLevel(20),
        parameters,
        scenarios: [
          simulate(1 / 12, "xp"),
          simulate(1, "income"),
          simulate(4, "income"),
          simulate(8, "income"),
          simulate(12, "income"),
          simulate(24, "income"),
          simulate(1 / 12, "low"),
          simulate(4, "income", 90, "enterHall"),
          simulate(4, "income", 90, "releaseAnimal"),
        ],
      },
      null,
      2,
    ),
  );
}
