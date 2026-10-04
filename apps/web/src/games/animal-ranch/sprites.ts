import type { RanchSpecies } from "../../../../../packages/contracts/src/ranch";
export const spriteGroups: RanchSpecies[][] = [
  ["chicken", "rabbit", "dog", "duck", "sheep", "goose", "goat", "cow", "cat"],
  [
    "pig",
    "parrot",
    "turtle",
    "horse",
    "frog",
    "peacock",
    "fox",
    "alpaca",
    "hedgehog",
  ],
  [
    "deer",
    "owl",
    "penguin",
    "snake",
    "buffalo",
    "moose",
    "zebra",
    "bear",
    "monkey",
  ],
  [
    "gorilla",
    "giraffe",
    "rhino",
    "hippo",
    "crocodile",
    "lion",
    "elephant",
    "panda",
    "sloth",
  ],
];
export function spriteLocation(species: RanchSpecies) {
  const group = spriteGroups.findIndex((row) => row.includes(species));
  return {
    url: "/ranch/scene/animals-" + group + ".png",
    group,
    row: spriteGroups[group].indexOf(species),
  };
}
