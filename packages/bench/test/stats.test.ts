import { describe, expect, it } from "vitest";
import { fmtBytes, fmtMs, median, percentile, summarize } from "../src/stats.js";

describe("statistics helpers", () => {
  it("median of an odd and an even sample, order independent", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
  });
  it("percentile is nearest-rank on the sorted sample", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(10);
    expect(percentile(xs, 95)).toBe(19);
    expect(percentile(xs, 100)).toBe(20);
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile([5], 95)).toBe(5);
  });
  it("percentile sorts an unsorted input without mutating it", () => {
    const xs = [9, 1, 5, 3, 7];
    expect(percentile(xs, 95)).toBe(9);
    expect(xs).toEqual([9, 1, 5, 3, 7]);
  });
  it("summarize gives n, min, max, mean, median and p95", () => {
    const s = summarize([10, 20, 30, 40]);
    expect(s).toEqual({ n: 4, min: 10, max: 40, mean: 25, median: 25, p95: 40 });
  });
  it("an empty sample and a non-finite value are refused", () => {
    expect(() => summarize([])).toThrow();
    expect(() => median([])).toThrow();
    expect(() => summarize([1, Number.NaN])).toThrow();
    expect(() => percentile([1], 101)).toThrow();
  });
  it("formats milliseconds and bytes with fixed rules", () => {
    expect(fmtMs(0.0004)).toBe("0.0004");
    expect(fmtMs(0.123456)).toBe("0.123");
    expect(fmtMs(12.3456)).toBe("12.35");
    expect(fmtMs(123.456)).toBe("123.5");
    expect(fmtMs(12345.6)).toBe("12346");
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(1023)).toBe("1023 B");
    expect(fmtBytes(1024)).toBe("1.00 KiB");
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5.00 MiB");
    expect(fmtBytes(3 * 1024 ** 3)).toBe("3.00 GiB");
  });
});
