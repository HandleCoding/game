import {
  initialRanch,
  newAnimal,
  species,
} from "../apps/api/src/games/animal-ranch/engine.js";
import {
  ATTRS,
  rollMutation,
  priceMilli,
  mutationProbability,
} from "../apps/api/src/games/animal-ranch/mutation.js";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
let seed = 20261005;
const rng = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const results = [];
const n = 50000;
for (const hours of [1, 12, 48, 120])
  for (const rate of [1000, 3000]) {
    const s = initialRanch(0);
    s.features!.completedSpecies =
      rate === 3000 ? species.slice(0, 30).map((k) => k.id) : [];
    if (rate === 3000)
      for (const k of species)
        for (const attr of ATTRS) {
          const key = k.id + ":" + attr;
          s.features!.codex[key] = {
            key,
            species: k.id,
            attributes: [attr],
            grade: 0,
            firstAt: 0,
            source: "simulation",
            seen: true,
          };
        }
    let mutated = 0,
      dual = 0,
      priceSum = 0;
    const grades = [0, 0, 0, 0, 0],
      attributes: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      if (rate === 1000) s.features!.codex = {};
      s.events = [];
      s.features!.goals = {};
      const a = newAnimal("sample", species[0]!, 0);
      Object.assign(a, {
        grade: 0,
        attributes: [],
        purchaseRoll: "pending",
        adultRoll: "pending",
        growthMs: (hours * 3600000) / 7,
        cycleMs: (hours * 3600000) / 7,
        maxRounds: 6,
      });
      s.animals = [a];
      assert.equal(mutationProbability(s), rate);
      rollMutation(s, a, "purchase", 1, rng);
      rollMutation(s, a, "adult", 2, rng);
      if (a.attributes!.length) mutated++;
      if (a.attributes!.length === 2) dual++;
      grades[a.grade!]!++;
      for (const attr of a.attributes!)
        attributes[attr] = (attributes[attr] ?? 0) + 1;
      priceSum += priceMilli(a);
      assert(priceMilli(a) <= 2200);
    }
    const p = rate / 10000;
    assert(Math.abs(mutated / n - (1 - (1 - p) ** 2)) < 0.005);
    assert(Math.abs(dual / n - p * p) < 0.005);
    results.push({
      lifetimeHours: hours,
      perChance: p,
      samples: n,
      mutatedRate: mutated / n,
      dualRate: dual / n,
      grades: grades.map((x) => x / n),
      attributeCounts: attributes,
      averageProductMultiplier: priceSum / n / 1000,
    });
  }
writeFileSync(
  "docs/test-reports/20261005-ranch-mutation-simulation.json",
  JSON.stringify(
    {
      seed: 20261005,
      totalSamples: n * results.length,
      engine: "actual rollMutation and priceMilli; independent purchase/adult",
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ totalSamples: n * results.length, results }, null, 2),
);
