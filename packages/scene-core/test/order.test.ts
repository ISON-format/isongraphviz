// packages/scene-core/test/order.test.ts
import { describe, expect, it } from "vitest";
import { compareEdgeAddress, compareNodeRef, compareUtf8 } from "../src/order.js";

const i = (type: string, v: bigint) => ({ type, id: { kind: "int" as const, value: v } });
const s = (type: string, v: string) => ({ type, id: { kind: "str" as const, value: v } });

describe("ordering", () => {
  it("orders strings by UTF-8 bytes, not UTF-16 code units", () => {
    const bmp = "～";       // U+FF5E, UTF-8 EF BD 9E
    const astral = "\u{1F600}"; // U+1F600, UTF-8 F0 9F 98 80
    expect(bmp < astral).toBe(false);          // the JavaScript default is UTF-16 order: the hazard
    expect(compareUtf8(bmp, astral)).toBeLessThan(0);
    expect(compareUtf8(astral, bmp)).toBeGreaterThan(0);
    expect(compareUtf8("a", "a")).toBe(0);
    expect(compareUtf8("a", "ab")).toBeLessThan(0);
  });

  it("puts every INT64 before every STRING and orders INT64s numerically", () => {
    const sorted = [s("p", "007"), i("p", 10n), i("p", -5n), i("p", 2n), s("p", "a"), i("p", -9223372036854775808n)].sort(compareNodeRef);
    expect(sorted.map((r) => (r.id.kind === "int" ? r.id.value.toString() : r.id.value))).toEqual(["-9223372036854775808", "-5", "2", "10", "007", "a"]);
  });

  it("orders by type before id", () => {
    expect(compareNodeRef(i("a", 9n), i("b", 1n))).toBeLessThan(0);
  });

  it("orders edge ordinals lexicographically", () => {
    const e = (ord: string) => ({ src: i("p", 1n), rel: "R", tgt: i("p", 2n), ord });
    expect(compareEdgeAddress(e("10"), e("2"))).toBeLessThan(0);
  });
});
