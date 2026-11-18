// src/num.ts - integer arithmetic of design section 3 (bigint only; no floating point decides any byte of the output).

/** floorDiv(a, b) for b > 0 rounds toward minus infinity (bigint `/` truncates toward zero). */
export function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

/** divRound(a, b) = floorDiv(2a + b, 2b), b > 0: round half toward +infinity (3.1). */
export const divRound = (a: bigint, b: bigint): bigint => floorDiv(2n * a + b, 2n * b);

/** Exact floor of the square root of n >= 0 (Newton iteration on bigint; 3.1). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  // initial estimate: a power of two at or above sqrt(n)
  let bits = 0n;
  for (let t = n; t > 0n; t >>= 1n) bits++;
  let x = 1n << ((bits + 1n) >> 1n);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Number text of a micro-pixel integer (3.2): milli-pixels by divRound, no -0, no exponent, no trailing zeros. */
export function fmt(v: bigint): string {
  const m = divRound(v, 1000n);
  if (m === 0n) return "0";
  const neg = m < 0n;
  const a = neg ? -m : m;
  const q = a / 1000n;
  const r = a % 1000n;
  let t = q.toString();
  if (r !== 0n) t += "." + r.toString().padStart(3, "0").replace(/0+$/, "");
  return neg ? "-" + t : t;
}

export interface Viewport { center_x: number; center_y: number; width: number; height: number; zoom: number }

/** Screen position of a layout point (thousandths) in micro-pixels (3.3): X = (x - cx) z + w 500000, exact. */
export function screenMicro(vp: Viewport, x: number, y: number): { x: bigint; y: bigint } {
  const z = BigInt(vp.zoom);
  return {
    x: (BigInt(x) - BigInt(vp.center_x)) * z + BigInt(vp.width) * 500_000n,
    y: (BigInt(y) - BigInt(vp.center_y)) * z + BigInt(vp.height) * 500_000n,
  };
}
