// src/num.ts - integer arithmetic of design 3.1-3.3 (bigint only; no floating point decides any byte of an output).

/** floorDiv(a, b) for b > 0 rounds toward minus infinity (bigint `/` truncates toward zero). */
export function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

/** divRound(a, b) = floorDiv(2a + b, 2b), b > 0: round half toward +infinity. */
export const divRound = (a: bigint, b: bigint): bigint => floorDiv(2n * a + b, 2n * b);

/** Exact floor of the square root of n >= 0 (Newton iteration on bigint). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  let bits = 0n;
  for (let t = n; t > 0n; t >>= 1n) bits++;
  let x = 1n << ((bits + 1n) >> 1n);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** m(v) = divRound(v, 1000): the milli-pixel integer of a micro-pixel value (3.2), as a bigint. */
export const mpxBig = (v: bigint): bigint => divRound(v, 1000n);
/** The same as a number (never -0). Callers have checked the magnitude (3.5). */
export const mpx = (v: bigint): number => Number(mpxBig(v));

export interface Viewport { center_x: number; center_y: number; width: number; height: number; zoom: number }

/** Screen position of a layout point (thousandths) in micro-pixels (3.3): X = (x - cx) z + w 500000, exact. */
export function screenMicro(vp: Viewport, x: number, y: number): { x: bigint; y: bigint } {
  const z = BigInt(vp.zoom);
  return {
    x: (BigInt(x) - BigInt(vp.center_x)) * z + BigInt(vp.width) * 500_000n,
    y: (BigInt(y) - BigInt(vp.center_y)) * z + BigInt(vp.height) * 500_000n,
  };
}
