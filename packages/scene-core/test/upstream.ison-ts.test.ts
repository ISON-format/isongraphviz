// packages/scene-core/test/upstream.ison-ts.test.ts
// Canary for an upstream parser behaviour that the adapter guards against (rule A10). These tests assert what ison-ts 1.2.0 DOES today, so
// that an upgrade which fixes it is noticed. If one fails after a dependency bump, the parser changed: re-read the adapter guard
// (qualifyBlocks PROTOTYPE_FIELD, ownValue) before deciding whether it can be relaxed. It never needs relaxing to stay correct.
import { parse, Reference } from "ison-ts";
import { describe, expect, it } from "vitest";

describe("ison-ts 1.2.0: a __proto__ column re-parents the row (upstream defect, pinned)", () => {
  const doc = parse("nodes.p\n__proto__ name\n:q:77 a\n");
  const row = doc.blocks[0]!.rows[0]!;

  it("declares the column but stores no own `__proto__` property", () => {
    expect(doc.blocks[0]!.fields).toEqual(["__proto__", "name"]);
    expect(Object.keys(row)).toEqual(["name"]);
  });

  it("makes the row inherit from the Reference value, so `id` and `type` appear from nowhere", () => {
    expect(Object.getPrototypeOf(row)).toBeInstanceOf(Reference);
    expect((row as Record<string, unknown>)["id"]).toBe("77");
    expect(Object.prototype.hasOwnProperty.call(row, "id")).toBe(false);
  });

  it("is the only column name with this effect: other Object.prototype names stay own data", () => {
    const r = parse("nodes.p\nid constructor toString\n1 a b\n").blocks[0]!.rows[0]!;
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
    expect(Object.keys(r)).toEqual(["id", "constructor", "toString"]);
  });
});
