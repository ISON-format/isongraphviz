// src/stats.ts - the small statistics and formatting helpers of the report. Pure; no clock.
export interface Summary { n: number; min: number; max: number; mean: number; median: number; p95: number }

const check = (xs: readonly number[]): void => {
  if (xs.length === 0) throw new Error("empty sample");
  for (const x of xs) if (!Number.isFinite(x)) throw new Error("a sample value is not finite");
};
const sortedCopy = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);

/** Median; the mean of the two middle values for an even sample. */
export function median(xs: readonly number[]): number {
  check(xs);
  const s = sortedCopy(xs);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Nearest-rank percentile (p in 0..100): the value at 1-based rank ceil(p/100 * n), rank at least 1. The input is not modified. */
export function percentile(xs: readonly number[], p: number): number {
  check(xs);
  if (!(p >= 0 && p <= 100)) throw new Error("percentile out of range");
  const s = sortedCopy(xs);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[rank - 1]!;
}

export function summarize(xs: readonly number[]): Summary {
  check(xs);
  const s = sortedCopy(xs);
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, min: s[0]!, max: s[s.length - 1]!, mean: sum / s.length, median: median(s), p95: percentile(s, 95) };
}

/** Milliseconds with about four significant digits and no exponent. */
export function fmtMs(ms: number): string {
  const a = Math.abs(ms);
  if (a >= 10000) return ms.toFixed(0);
  if (a >= 100) return ms.toFixed(1);
  if (a >= 10) return ms.toFixed(2);
  if (a >= 0.1) return ms.toFixed(3);
  return ms.toFixed(4);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${units[i]}`;
}
