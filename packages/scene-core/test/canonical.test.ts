// packages/scene-core/test/canonical.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalBytes, canonicalize, hasLoneSurrogate, type CJValue } from "../src/canonical.js";
import { bytesOf, hex, igsError, ORACLES, textOf } from "./helpers.js";
import { join } from "node:path";

describe("IGS-CJ/1 values", () => {
  it("sorts keys and writes no whitespace", () => {
    expect(canonicalize({ b: 1, a: [true, "x"] })).toBe('{"a":[true,"x"],"b":1}');
  });

  it("keeps array order exactly as given", () => {
    expect(canonicalize(["b", "a"])).toBe('["b","a"]');
  });

  it("allows only non-negative safe integers", () => {
    expect(canonicalize(0)).toBe("0");
    expect(canonicalize(9007199254740991)).toBe("9007199254740991");
    for (const bad of [1.5, -1, 2 ** 53, -0, NaN, Infinity]) expect(igsError(() => canonicalize(bad)).code, String(bad)).toBe("INVALID_SCENE");
  });

  it("rejects null and undefined", () => {
    expect(() => canonicalize(null as unknown as CJValue)).toThrow();
    expect(() => canonicalize({ a: undefined } as unknown as CJValue)).toThrow();
  });
});

describe("IGS-CJ/1 strings (docs/specs/IGS-1.md §5.4)", () => {
  it("escapes quote and backslash", () => {
    expect(canonicalize('a"b')).toBe('"a\\"b"');
    expect(canonicalize("a\\b")).toBe('"a\\\\b"');
  });

  it("uses the short escapes and lowercase \\u00xx for the other controls", () => {
    expect(canonicalize("\b\f\n\r\t")).toBe('"\\b\\f\\n\\r\\t"');
    expect(canonicalize("\u0007")).toBe('"\\u0007"');
    expect(canonicalize("\u0000")).toBe('"\\u0000"');
    expect(canonicalize("\u001f")).toBe('"\\u001f"');
  });

  it("writes DEL, U+2028 and non-BMP scalars literally and does not normalize", () => {
    expect(canonicalize("\u007f \u{1F600}")).toBe('"\u007f \u{1F600}"');
    expect(canonicalize("é")).toBe('"é"'); // decomposed é is not recomposed
  });

  it("rejects a lone surrogate", () => {
    expect(hasLoneSurrogate("\ud800")).toBe(true);
    expect(hasLoneSurrogate("\udc00x")).toBe(true);
    expect(hasLoneSurrogate("\u{1F600}")).toBe(false);
    expect(igsError(() => canonicalize("\ud800")).code).toBe("INVALID_SCENE");
  });

  it("produces UTF-8 bytes without a BOM or trailing newline", () => {
    const b = canonicalBytes({ a: "\u{1F600}" });
    expect(hex(b)).toBe(hex(new TextEncoder().encode('{"a":"\u{1F600}"}')));
    expect(b[0]).toBe(0x7b);
  });
});

describe("oracle O5 (string stress, frozen file)", () => {
  it("reproduces the frozen bytes from the code-point list", () => {
    const cps = JSON.parse(readFileSync(join(ORACLES, "o5-string-stress.codepoints.json"), "utf8")) as number[];
    const o1 = JSON.parse(textOf("o1-basic.scene.json")) as { nodes: Record<string, CJValue>[]; edges: CJValue[] };
    const node = { ...o1.nodes[0], "x-test": String.fromCodePoint(...cps) } as Record<string, CJValue>;
    const scene = { ...o1, nodes: [node], edges: [] } as unknown as CJValue;
    expect(hex(canonicalBytes(scene))).toBe(hex(bytesOf("o5-string-stress.scene.json")));
  });
});
