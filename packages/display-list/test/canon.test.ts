// Design 4.2: the package's own canonical writer (IGS-CJ/1 strings, keys in UTF-16 order, integers only).
import { describe, expect, it } from "vitest";
import { IgrError } from "isongraph-visualize-renderer-core";
import { canonicalJson, canonicalString, utf8Length } from "../src/canon.js";

describe("canonicalString (IGS/1 5.4)", () => {
  it("escapes quote, backslash and the C0 controls; keeps everything else literal", () => {
    expect(canonicalString('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(canonicalString("\b\t\n\f\r")).toBe('"\\b\\t\\n\\f\\r"');
    expect(canonicalString("\u0000\u0001\u001f")).toBe('"\\u0000\\u0001\\u001f"');
    expect(canonicalString("\u007f  é\u{1F600}")).toBe('"\u007f  é\u{1F600}"');
  });
  it("uses lower-case hex", () => { expect(canonicalString("\u000b")).toBe('"\\u000b"'); });
  it("refuses a lone surrogate (it cannot be written)", () => {
    expect(() => canonicalString("a\ud800")).toThrow(IgrError);
    expect(() => canonicalString("\udc00a")).toThrow(IgrError);
    expect(canonicalString("😀")).toBe('"\u{1F600}"');
  });
});

describe("canonicalJson", () => {
  it("has no whitespace and writes object keys in UTF-16 order", () => {
    expect(canonicalJson({ type: "p", id: "i:1" })).toBe('{"id":"i:1","type":"p"}');
    expect(canonicalJson({ tgt: 1, ord: 2, src: 3, rel: 4 })).toBe('{"ord":2,"rel":4,"src":3,"tgt":1}');
    expect(canonicalJson({ "😀": 1, "￿": 2 })).toBe('{"\u{1F600}":1,"￿":2}');
    expect(canonicalJson(["H", [1, -2, 0], { a: [] }])).toBe('["H",[1,-2,0],{"a":[]}]');
  });
  it("writes integers without leading zeros, fraction or exponent and never -0", () => {
    expect(canonicalJson([0, -0, 1, -1, 1099511627776, Number.MAX_SAFE_INTEGER])).toBe("[0,0,1,-1,1099511627776,9007199254740991]");
  });
  it("refuses a fraction, a non-finite number and an unsafe integer", () => {
    for (const bad of [1.5, NaN, Infinity, 2 ** 53, 1e21]) expect(() => canonicalJson([bad])).toThrow(IgrError);
  });
  it("writes booleans and null", () => { expect(canonicalJson({ a: true, b: null, c: false })).toBe('{"a":true,"b":null,"c":false}'); });
});

describe("utf8Length", () => {
  it("is the exact UTF-8 length", () => {
    expect(utf8Length("")).toBe(0);
    expect(utf8Length("aé€\u{1F600}")).toBe(1 + 2 + 3 + 4);
  });
});
