// packages/scene-core/test/identity.test.ts
import { describe, expect, it } from "vitest";
import { decodeNodeId, edgeFromWire, edgeToWire, encodeNodeId, labelOf, nodeKey } from "../src/identity.js";
import { IgsError } from "../src/errors.js";

describe("tagged node ids", () => {
  it("keeps INT64 and STRING distinct", () => {
    expect(encodeNodeId({ kind: "int", value: 1n })).toBe("i:1");
    expect(encodeNodeId({ kind: "str", value: "1" })).toBe("s:1");
  });

  it("accepts both INT64 extremes exactly", () => {
    expect(encodeNodeId({ kind: "int", value: -9223372036854775808n })).toBe("i:-9223372036854775808");
    expect(encodeNodeId({ kind: "int", value: 9223372036854775807n })).toBe("i:9223372036854775807");
  });

  it("rejects an INT64 out of range", () => {
    try { encodeNodeId({ kind: "int", value: 9223372036854775808n }); throw new Error("no throw"); }
    catch (e) { expect((e as IgsError).code).toBe("INVALID_NODE_ID"); expect((e as IgsError).reason).toBe("INT64_RANGE"); }
  });

  it("round-trips through the wire form", () => {
    for (const w of ["i:0", "i:-5", "i:10", "s:007", "s:", "s:é"]) expect(encodeNodeId(decodeNodeId(w))).toBe(w);
  });

  it("rejects non-canonical or untagged wire ids", () => {
    for (const w of ["i:-0", "i:+5", "i:007", "i:", "i:1.5", "i:9223372036854775808", "x:1", "1", ""]) {
      expect(() => decodeNodeId(w), w).toThrowError(IgsError);
    }
  });

  it("derives the label from the id text", () => {
    expect(labelOf({ kind: "int", value: -5n })).toBe("-5");
    expect(labelOf({ kind: "str", value: "ann" })).toBe("ann");
  });

  it("builds stable keys and converts edge addresses both ways", () => {
    const a = { src: { type: "p", id: { kind: "int" as const, value: 1n } }, rel: "R", tgt: { type: "p", id: { kind: "str" as const, value: "x" } }, ord: "0" };
    expect(edgeFromWire(edgeToWire(a))).toEqual(a);
    expect(nodeKey(a.src)).not.toBe(nodeKey({ type: "p", id: { kind: "str", value: "1" } }));
  });
});
