// src/rng.ts - a seeded 32-bit generator (mulberry32). Integer arithmetic only (Math.imul, shifts) and one exact division by 2^32, so a seed gives the
// same sequence on every engine; no Math.random, no transcendental function.
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n), n a positive integer below 2^32. */
  int(n: number): number;
  /** A bounded, centred, bell-shaped value in [-1, 1] (the Irwin-Hall sum of four uniforms, rescaled). */
  bump(): number;
}

export function createRng(seed: number): Rng {
  let a = seed | 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number): number => Math.floor(next() * n),
    bump: (): number => (next() + next() + next() + next() - 2) / 2,
  };
}
