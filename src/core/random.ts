// A small seedable PRNG, so engine playoffs and fuzz tests are reproducible.
// The original seeds `rand()` from the clock, which makes a losing game
// impossible to replay.

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, limit). */
  nextInt(limit: number): number;
}

/** Mulberry32 — 32 bits of state, good enough for playouts and very fast. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (limit: number) => (next() * limit) | 0,
  };
}

/** An RNG seeded from the clock, for actual play. */
export function makeDefaultRng(): Rng {
  return makeRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
}
