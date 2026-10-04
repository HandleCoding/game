import {
  initialRanch,
  settleRanch,
  ranchAction,
  species,
  level,
  type RanchState,
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
  strategy: "xp" | "income",
  days = 180,
) {
  let s = initialRanch(0);
  const milestones: Record<string, number> = {};
  let actions = 0,
    hungryVisits = 0;
  const visit = () => {
    if (s.feedMs < s.animals.length) hungryVisits++;
    const act = (t: string, p = {}) => {
      s = ranchAction(s, t, p);
      actions++;
    };
    if (s.animals.some((a) => a.stored)) act("harvest");
    if (Object.values(s.inventory).some((n) => n)) act("sellProducts");
    // Keep a full visit interval plus 12h of feed before any investment.
    const reserve = Math.ceil((stepHours + 12) * 2 * s.capacity);
    const eligible = species.filter((k) => k.unlockLevel <= level(s.xp));
    const score = (k: (typeof species)[number]) =>
      strategy === "xp"
        ? (k.yield * k.harvestXp) / (k.cycleMs / HOUR)
        : (k.yield * k.sellPrice) / (k.cycleMs / HOUR) - 2;
    const options = eligible.toSorted((a, b) => score(b) - score(a));
    const expansion = expansionFor(s.capacity);
    if (
      expansion &&
      level(s.xp) >= expansion.level &&
      s.coins >= expansion.cost + reserve + 2 * species[0]!.price
    )
      act("upgrade");
    while (s.animals.length < s.capacity) {
      const k = options.find((k) => k.price <= s.coins - reserve);
      if (!k) break;
      act("buyAnimal", { species: k.id });
    }
    // Mature-only upgrades avoid destroying a juvenile's progress on every visit.
    for (const animal of [...s.animals]) {
      const current = species.find((k) => k.id === animal.species)!;
      const k = options.find(
        (k) =>
          score(k) > score(current) * 1.15 &&
          k.price <= s.coins - reserve + Math.floor(animal.paid * 0.6),
      );
      if (k && animal.ageMs >= animal.growthMs && !animal.stored) {
        act("sellAnimal", { animalId: animal.id });
        act("buyAnimal", { species: k.id });
      }
    }
    const target = Math.min(
      FEED_CAPACITY,
      Math.ceil((stepHours + 12) * 2 * s.animals.length),
    );
    for (const units of [300, 100, 20])
      while (s.feedMs / FEED_UNIT_MS + units <= target && s.coins >= units)
        act("buyFeed", { units });
    for (const l of [2, 3, 5, 8, 10, 15, 18, 20])
      if (level(s.xp) >= l && milestones[l] === undefined)
        milestones[l] = s.at / HOUR / 24;
  };
  visit();
  const snapshots: Record<string, unknown> = {};
  for (let hours = stepHours; hours <= days * 24; hours += stepHours) {
    s = settleRanch(s, s.at, hours * HOUR);
    visit();
    if ([6, 24, 72, 168, 720, 1440, 2160, 4320].includes(hours))
      snapshots[hours] = {
        level: level(s.xp),
        xp: s.xp,
        coins: s.coins,
        animals: s.animals.length,
        capacity: s.capacity,
      };
  }
  return {
    stepHours,
    strategy,
    milestones,
    snapshots,
    actions,
    hungryVisits,
    finalLevel: level(s.xp),
  };
}
if (process.argv[1]?.endsWith("ranch-balance-simulation.ts")) {
  const bestHourlyXp = Math.max(
    ...species.map((k) => (k.yield * k.harvestXp) / (k.cycleMs / HOUR)),
  );
  console.log(
    JSON.stringify(
      {
        version: 2,
        xpTo20: xpForLevel(20),
        maximumHourlyXpPerAnimal: bestHourlyXp,
        // Even 16 free mature fastest-XP animals with unlimited food cannot beat this bound.
        optimisticMinimumDaysTo20:
          (xpForLevel(20) - 12) / (16 * bestHourlyXp * 24),
        scenarios: [
          simulate(0.25, "xp"),
          simulate(6, "income"),
          simulate(12, "income"),
          simulate(24, "income"),
        ],
      },
      null,
      2,
    ),
  );
}
