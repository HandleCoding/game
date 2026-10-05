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
  maxRounds: number;
  lifetimeXp: number;
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
  grade?: number;
  attributes?: string[];
  protected?: boolean;
  purchaseRoll?: string;
  adultRoll?: string;
  species: RanchSpecies;
  name: string;
  nickname: string;
  status: RanchAnimalStatus;
  completedRounds: number;
  maxRounds: number;
  storageRounds: number;
  saleCoins?: number;
  variantId: string;
  rarityId: string;
  affixes: RanchAffix[];
  createdAt: number | null;
  completedAt: number | null;
  legacy: boolean;
  display: boolean;
  totalProduced: number | null;
  baby: boolean;
  progress: number;
  stored: number;
  capacity: number;
  productName: string;
  nextAt: number | null;
  remainingMs: number;
  hungry: boolean;
}
export interface RanchMutationView {
  probabilityBp: number;
  dew: number;
  remainder: number;
  dailyDew: number;
  codex: {
    key: string;
    species: string;
    attributes: string[];
    grade: number;
    firstAt: number | null;
    source: string;
    seen: boolean;
  }[];
  completedSpecies: string[];
  tracked: string[];
  goals: {
    id: string;
    name: string;
    kind: string;
    target: number;
    completedAt: number | null;
  }[];
  lots: {
    id: string;
    product: string;
    quantity: number;
    priceMilli: number;
    grade: number;
    attributes: string[];
    locked: boolean;
    animalId: string | null;
    at: number;
  }[];
}
export interface RanchView {
  mutation?: RanchMutationView;
  level: number;
  capacity: number;
  animals: RanchAnimalView[];
  hungry: boolean;
  feedingAnimals: number;
  hallCount: number;
  collection: Partial<
    Record<RanchSpecies, { owned: number; completed: number; hall: number }>
  >;
  species: RanchSpeciesInfo[];
  feed?: number;
  feedMinutes?: number | null;
  coins?: number;
  xp?: number;
  levelStartXp?: number;
  nextLevelXp?: number;
  feedUnitMinutes?: number;
  upgradeLevel?: number | null;
  upgradeCost?: number | null;
  inventory?: {
    id: string;
    name: string;
    count: number;
    price: number;
    value: number;
    minPrice: number;
    maxPrice: number;
  }[];
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

export type RanchAnimalStatus =
  | "juvenile"
  | "producing"
  | "completed"
  | "hall"
  | "sold"
  | "released"
  | "fused";
export interface RanchAffix {
  definitionId: string;
  definitionVersion: number;
  roll: number;
  eventId: string;
  label: string;
}
export interface RanchAnimalEvent {
  id: string;
  animalId: string;
  at: number;
  type: string;
  message: string;
}
export interface RanchCollectionPage {
  animals: RanchAnimalView[];
  next: string | null;
  total: number;
}
export interface RanchAnimalRecord {
  animal: RanchAnimalView;
  events: RanchAnimalEvent[];
}
