import { describe, expect, it } from "vitest";
import { divRound, divRoundN, floorDiv, floorDivN, isqrt } from "../src/intmath.js";

// A tiny fixed-seed LCG (no clock, no Math.random): the property tests are reproducible.
function lcg(seed: bigint): () => bigint {
  let s = seed;
  return () => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return s; };
}

// Independent reference implementations, deliberately written differently from the package.
function refFloorDiv(a: bigint, b: bigint): bigint {
  const r = ((a % b) + b) % b; // mathematical modulus, 0 <= r < b
  return (a - r) / b;
}
function refIsqrt(n: bigint): bigint { // binary search on the definition
  let lo = 0n, hi = 1n;
  while (hi * hi <= n) hi *= 2n;
  while (lo + 1n < hi) { const mid = (lo + hi) / 2n; if (mid * mid <= n) lo = mid; else hi = mid; }
  return lo;
}

describe("floorDiv", () => {
  it("rounds toward minus infinity (the spec examples)", () => {
    expect(floorDiv(-3n, 2n)).toBe(-2n);
    expect(floorDiv(3n, 2n)).toBe(1n);
    expect(floorDiv(-4n, 2n)).toBe(-2n);
    expect(floorDiv(0n, 7n)).toBe(0n);
    expect(floorDiv(-1n, 1000n)).toBe(-1n);
  });
  it("equals the reference over 1,000,000 random pairs", { timeout: 60_000 }, () => { // design section 17 asks for 1,000,000 values
    const next = lcg(1n);
    for (let i = 0; i < 1_000_000; i++) {
      const a = BigInt.asIntN(64, next()) >> BigInt(Number(next() % 60n));
      const b = (next() >> 40n) + 1n;
      if (floorDiv(a, b) !== refFloorDiv(a, b)) throw new Error(`floorDiv ${a} ${b}`);
    }
  });
});

describe("divRound (round half toward +infinity)", () => {
  it("matches the spec examples", () => {
    expect(divRound(-1n, 2n)).toBe(0n);
    expect(divRound(-3n, 2n)).toBe(-1n);
    expect(divRound(1n, 2n)).toBe(1n);
    expect(divRound(1500n, 2n)).toBe(750n);
    expect(divRound(-2n, 3n)).toBe(-1n);
    expect(divRound(4000n, 2n)).toBe(2000n);
  });
  it("is floorDiv(2a + b, 2b)", () => {
    const next = lcg(2n);
    for (let i = 0; i < 100_000; i++) {
      const a = BigInt.asIntN(60, next());
      const b = (next() >> 50n) + 1n;
      if (divRound(a, b) !== refFloorDiv(2n * a + b, 2n * b)) throw new Error(`divRound ${a} ${b}`);
    }
  }, 60_000);
});

describe("Number-domain variants agree with the BigInt ones", () => {
  it("floorDivN and divRoundN over random operands below 2^51", () => {
    const next = lcg(4n);
    for (let i = 0; i < 200_000; i++) {
      const a = Number(BigInt.asIntN(52, next())) / 1; // |a| <= 2^51
      const b = Number((next() >> 40n) + 1n);
      if (BigInt(floorDivN(a, b)) !== floorDiv(BigInt(a), BigInt(b))) throw new Error(`floorDivN ${a} ${b}`);
      const c = Number(BigInt.asIntN(46, next()));
      if (BigInt(divRoundN(c, 1000)) !== divRound(BigInt(c), 1000n)) throw new Error(`divRoundN ${c}`);
    }
    expect(floorDivN(-3, 2)).toBe(-2);
    expect(divRoundN(-1, 2)).toBe(0);
  }, 60_000); // 200,000 pairs through BigInt references; explicit timeout so a loaded host (Node 22 under a mutation run) cannot time it out
});

describe("isqrt", () => {
  it("handles zero, small values and the boundaries k^2 - 1, k^2, k^2 + 1", () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(1n)).toBe(1n);
    expect(isqrt(2n)).toBe(1n);
    expect(isqrt(3n)).toBe(1n);
    expect(isqrt(4n)).toBe(2n);
    expect(isqrt(8n)).toBe(2n); // rounding to nearest would give 3
    for (const k of [2n, 3n, 10n, 999n, 1000n, 65535n, 2n ** 26n, 2n ** 31n - 1n, 2n ** 31n, 2n ** 52n - 1n, 2n ** 52n, 2n ** 53n + 1n, 2n ** 60n, 10n ** 30n + 7n]) {
      expect(isqrt(k * k - 1n)).toBe(k - 1n);
      expect(isqrt(k * k)).toBe(k);
      expect(isqrt(k * k + 1n)).toBe(k);
      expect(isqrt(k * k + 2n * k)).toBe(k);
      expect(isqrt(k * k + 2n * k + 1n)).toBe(k + 1n);
    }
  });
  it("n >= 1 implies isqrt(n) >= 1 (dist is 0 only for a zero displacement)", () => {
    for (let n = 1n; n < 1000n; n++) expect(isqrt(n) >= 1n).toBe(true);
  });
  it("equals the definition over 1,000,000 random values", { timeout: 60_000 }, () => {
    const next = lcg(3n);
    for (let i = 0; i < 1_000_000; i++) {
      const n = next() >> BigInt(Number(next() % 64n));
      const r = isqrt(n);
      if (!(r * r <= n && n < (r + 1n) * (r + 1n))) throw new Error(`isqrt ${n}`);
    }
    // and against the binary-search reference for large inputs
    for (let i = 0; i < 2000; i++) {
      const n = (next() << 64n) | next();
      expect(isqrt(n)).toBe(refIsqrt(n));
    }
  });
  it("refuses a negative input", () => {
    expect(() => isqrt(-1n)).toThrow();
  });
});
