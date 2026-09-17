export type Rng = {
  (): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  sign(): number;
};

export function hashString(str: string): number {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + (max - min) * next();
  next.int = (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

export function rngFor(key: string): Rng {
  return mulberry32(hashString(key));
}

function shuffled(n: number, rng: Rng): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function bagFor(cycle: number, n: number): number[] {
  const bag = shuffled(n, rngFor(`bag:${cycle}`));
  if (cycle > 0 && n > 1) {
    const prev = bagFor(cycle - 1, n);
    if (bag[0] === prev[n - 1]) [bag[0], bag[1]] = [bag[1], bag[0]];
  }
  return bag;
}

/**
 * Shuffle-bag selection: every effect plays once per cycle of `n` days and the
 * same effect never plays on two consecutive days, including across cycles.
 * `dayIndex` counts days since an arbitrary fixed epoch.
 */
export function effectIndexForDay(dayIndex: number, n: number): number {
  const d = ((dayIndex % 100000) + 100000) % 100000;
  const cycle = Math.floor(d / n);
  return bagFor(cycle, n)[d % n];
}
