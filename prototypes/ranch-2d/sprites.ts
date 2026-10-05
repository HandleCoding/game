export type RanchSpecies = 'chicken'|'rabbit'|'dog'|'duck'|'sheep'|'goose'|'goat'|'cow'|'cat'|'pig'|'parrot'|'turtle'|'horse'|'frog'|'peacock'|'fox'|'alpaca'|'hedgehog'|'deer'|'owl'|'penguin'|'snake'|'buffalo'|'moose'|'zebra'|'bear'|'monkey'|'gorilla'|'giraffe'|'rhino'|'hippo'|'crocodile'|'lion'|'elephant'|'panda'|'sloth';
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
/** Life stage chooses independent artwork. Catalog stats / saves remain server-owned. */
export function spriteLocation(species: RanchSpecies, baby = false) {
  if (species === "rabbit")
    return {
      url: "/ranch/scene/soft/rabbit-stages-v1.webp",
      group: 8,
      row: baby ? 1 : 0,
    };
  const atlas = spriteGroups.findIndex((row) => row.includes(species));
  return {
    url:
      "/ranch/scene/soft/" +
      (baby ? "baby" : "adult") +
      "-" +
      atlas +
      "-v1.webp",
    group: atlas + (baby ? 4 : 0),
    row: spriteGroups[atlas].indexOf(species),
  };
}
/** Max visible body dimension in world pixels. Coherent game scale, not zoological 1:1. */
export const animalExtent: Record<RanchSpecies, number> = {
  chicken: 72,
  rabbit: 68,
  dog: 100,
  duck: 66,
  sheep: 107,
  goose: 85,
  goat: 110,
  cow: 147,
  cat: 76,
  pig: 111,
  parrot: 58,
  turtle: 55,
  horse: 150,
  frog: 43,
  peacock: 92,
  fox: 96,
  alpaca: 127,
  hedgehog: 46,
  deer: 128,
  owl: 63,
  penguin: 76,
  snake: 92,
  buffalo: 150,
  moose: 163,
  zebra: 142,
  bear: 148,
  monkey: 83,
  gorilla: 140,
  giraffe: 188,
  rhino: 169,
  hippo: 160,
  crocodile: 156,
  lion: 139,
  elephant: 188,
  panda: 122,
  sloth: 80,
};
