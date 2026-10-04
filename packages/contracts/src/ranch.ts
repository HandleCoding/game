export type RanchSpecies =
  | "chicken"
  | "rabbit"
  | "dog"
  | "duck"
  | "sheep"
  | "goose"
  | "goat"
  | "cow"
  | "cat"
  | "pig"
  | "parrot"
  | "turtle"
  | "horse"
  | "frog"
  | "peacock"
  | "fox"
  | "alpaca"
  | "hedgehog"
  | "deer"
  | "owl"
  | "penguin"
  | "snake"
  | "buffalo"
  | "moose"
  | "zebra"
  | "bear"
  | "monkey"
  | "gorilla"
  | "giraffe"
  | "rhino"
  | "hippo"
  | "crocodile"
  | "lion"
  | "elephant"
  | "panda"
  | "sloth";
export interface RanchSpeciesInfo {
  category: "farm" | "pets" | "zoo";
  description: string;
  harvestXp: number;
  buyXp: number;
  id: RanchSpecies;
  name: string;
  babyName: string;
  product: string;
  productName: string;
  price: number;
  sellPrice: number;
  unlockLevel: number;
  growthMs: number;
  cycleMs: number;
  yield: number;
}
export interface RanchAnimalView {
  id: string;
  species: RanchSpecies;
  name: string;
  baby: boolean;
  progress: number;
  stored: number;
  capacity: number;
  productName: string;
  nextAt: number | null;
  hungry: boolean;
}
export interface RanchView {
  level: number;
  capacity: number;
  animals: RanchAnimalView[];
  hungry: boolean;
  species: RanchSpeciesInfo[];
  feed?: number;
  feedMinutes?: number;
  coins?: number;
  xp?: number;
  nextLevelXp?: number;
  upgradeCost?: number;
  inventory?: { id: string; name: string; count: number; price: number }[];
  log?: { id: string; at: number; message: string }[];
}
export interface RanchProfile {
  gameId: string;
  owner: string;
  ownerName: string;
  world: string;
  revision: number;
  serverNow: number;
  state: RanchView;
}
export interface RanchNeighbor {
  id: string;
  name: string;
  level: number;
  animals: number;
}
