// The hand-written UTF-8 of src/utf8.ts against the platform's TextEncoder and TextDecoder (the core entries use neither).
import { describe, expect, it } from "vitest";
import { utf8Decode, utf8Encode } from "../src/utf8.js";
import { lcg } from "./gen.js";

describe("utf8Encode", () => {
  it("equals TextEncoder over every scalar class, the edges of each length and lone surrogates", () => {
    const samples = ["", "a", "\u007f", "\u0080", "߿", "ࠀ", "￿", "퟿", "", "\u{10000}", "\u{10ffff}", " ", "a\ud800b", "\udc00", "\ud83d", "x😀y", "\u0000"];
    for (const s of samples) expect(Array.from(utf8Encode(s)), JSON.stringify(s)).toEqual(Array.from(new TextEncoder().encode(s)));
  });
  it("equals TextEncoder over random strings", () => {
    const rng = lcg(5);
    for (let i = 0; i < 300; i++) {
      let s = "";
      for (let k = rng.int(12); k > 0; k--) s += String.fromCharCode(rng.pick([rng.int(0x80), rng.int(0x800), rng.int(0x10000)]));
      expect(Array.from(utf8Encode(s))).toEqual(Array.from(new TextEncoder().encode(s)));
    }
  });
});

describe("utf8Decode", () => {
  it("is the inverse of the encoding for well-formed strings", () => {
    for (const s of ["", "abc", "é€\u{1F600}", "  \u0085", "\u0000\u001f\u007f"]) expect(utf8Decode(utf8Encode(s))).toBe(s);
  });
  it("keeps a BOM as U+FEFF (the readers refuse it before decoding)", () => { expect(utf8Decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("﻿A"); });
  it("refuses a truncated, overlong, surrogate, out-of-range or stray continuation sequence, as a fatal TextDecoder does", () => {
    const bad = [[0xc3], [0xe2, 0x82], [0xf0, 0x9f, 0x98], [0xc0, 0x80], [0xc1, 0xbf], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80], [0x80], [0xbf], [0xff], [0xc3, 0x28]];
    for (const b of bad) {
      expect(utf8Decode(new Uint8Array(b)), b.map((x) => x.toString(16)).join(" ")).toBeUndefined();
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(b))).toThrow();
    }
  });
  it("decodes a long input in chunks without changing the result", () => {
    const s = "éa".repeat(20000);
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });
});
