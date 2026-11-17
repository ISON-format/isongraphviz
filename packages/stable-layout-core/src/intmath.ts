// Exact integer helpers (docs: 28-STABLE-LAYOUT-DESIGN.md section 4.2). No floating point.

/** floorDiv(a, b), b > 0: the greatest integer <= a/b. BigInt division truncates toward zero, so negatives are corrected. */
export function floorDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError("floorDiv: divisor must be positive");
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

/** divRound(a, b) = floorDiv(2a + b, 2b): round half toward +infinity. */
export function divRound(a: bigint, b: bigint): bigint {
  return floorDiv(2n * a + b, 2n * b);
}

/** isqrt(n), n >= 0: the largest r with r*r <= n (Newton iteration on BigInt). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt: negative input");
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1); // a power of two >= sqrt(n)
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Number-domain floorDiv for operands provably below 2^53 (grid cells, candidate arithmetic). Exact: % is exact in IEEE 754. */
export function floorDivN(a: number, b: number): number {
  const r = ((a % b) + b) % b;
  return (a - r) / b;
}

/** Number-domain divRound for operands provably below 2^52. */
export function divRoundN(a: number, b: number): number {
  return floorDivN(2 * a + b, 2 * b);
}
