/** Public balance constants. Resource settlement and permissions remain on the server. */
export const RANCH_BALANCE_VERSION = 2;
export const HOUR = 3_600_000;
export const FEED_UNIT_MS = HOUR / 2;
export const FEED_CAPACITY = 1000;
export const INITIAL_FEED = 240;
export const EXPANSIONS = [
  { capacity: 4, level: 3, cost: 600 },
  { capacity: 6, level: 6, cost: 1800 },
  { capacity: 8, level: 9, cost: 4200 },
  { capacity: 10, level: 12, cost: 8000 },
  { capacity: 12, level: 15, cost: 14000 },
  { capacity: 14, level: 18, cost: 22000 },
] as const;
export function xpForLevel(target: number): number {
  const n = Math.max(0, Math.floor(target) - 1);
  return 80 * n + (25 * n * (n - 1)) / 2 + (10 * n * (n - 1) * (2 * n - 1)) / 6;
}
export function ranchLevel(xp: number): number {
  let lo = 1,
    hi = 2;
  while (xpForLevel(hi) <= xp) hi *= 2;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (xpForLevel(mid) <= xp) lo = mid;
    else hi = mid;
  }
  return lo;
}
export const expansionFor = (capacity: number) =>
  EXPANSIONS.find((e) => e.capacity === capacity);
