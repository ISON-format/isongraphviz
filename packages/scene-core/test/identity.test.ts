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
  // V2 closure audit, finding m-3 + owner ruling 2026-11-16: an oversized invalid `i:` token must be refused by LENGTH before any BigInt conversion
  // (BigInt of a 4,000,000-digit string took 1.2-12 s). Behaviour for every valid or invalid token is unchanged.
  describe("INT64 decoding is bounded before conversion", () => {
    const realBigInt = globalThis.BigInt;
    const guarded = <T>(f: () => T): { result: T | undefined; error: unknown; longConversions: number } => {
      let longConversions = 0;
      globalThis.BigInt = new Proxy(realBigInt, {
        apply(target, thisArg, args: unknown[]) {
          if (typeof args[0] === "string" && args[0].length > 40) longConversions++;
          return Reflect.apply(target, thisArg, args);
        },
      });
      try { return { result: f(), error: undefined, longConversions }; }
      catch (error) { return { result: undefined, error, longConversions }; }
      finally { globalThis.BigInt = realBigInt; }
    };

    it("refuses a huge digit run with INVALID_SCENE/INVALID_ID and never converts it", () => {
      for (const wire of ["i:" + "1".repeat(100_000), "i:-" + "9".repeat(100_000), "i:" + "9".repeat(21), "i:-" + "9".repeat(20)]) {
        const r = guarded(() => decodeNodeId(wire));
        expect(r.error, wire.slice(0, 12)).toBeInstanceOf(IgsError);
        expect([(r.error as IgsError).code, (r.error as IgsError).reason]).toEqual(["INVALID_SCENE", "INVALID_ID"]);
        expect(r.longConversions).toBe(0);
      }
    });

    it("still accepts both INT64 extremes and rejects the first value beyond each", () => {
      expect(decodeNodeId("i:9223372036854775807")).toEqual({ kind: "int", value: 9223372036854775807n });
      expect(decodeNodeId("i:-9223372036854775808")).toEqual({ kind: "int", value: -9223372036854775808n });
      for (const w of ["i:9223372036854775808", "i:-9223372036854775809", "i:10000000000000000000"]) expect(() => decodeNodeId(w), w).toThrowError(IgsError);
    });

    it("is equivalent to the unbounded reference decoder on 20,000 random tokens of length 1-25 (valid, out of range, non-canonical)", () => {
      const reference = (wire: string): string => {
        const digits = wire.slice(2);
        if (!/^(0|-?[1-9][0-9]*)$/.test(digits)) return "INVALID";
        const v = BigInt(digits);
        return v < -(1n << 63n) || v > (1n << 63n) - 1n ? "INVALID" : v.toString();
      };
      let state = 12345;
      const rnd = (n: number): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
      const alphabet = "0123456789-+.e ";
      let valid = 0;
      for (let i = 0; i < 20_000; i++) {
        const len = 1 + rnd(25);
        let t = rnd(3) === 0 ? "-" : "";
        for (let k = 0; k < len; k++) t += rnd(8) === 0 ? alphabet[rnd(alphabet.length)]! : String(rnd(10));
        const wire = "i:" + t;
        let got: string;
        try { got = (decodeNodeId(wire) as { value: bigint }).value.toString(); } catch (e) { expect(e).toBeInstanceOf(IgsError); got = "INVALID"; }
        if (got !== "INVALID") valid++;
        expect(got, wire).toBe(reference(wire));
      }
      expect(valid).toBeGreaterThan(1000); // the property is not vacuous
    });
  });
});
