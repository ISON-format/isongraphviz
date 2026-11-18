// Design 3.4(e) (D-DRAW) and 4.4(g): xs, the flat label and the drawn label dl(s).
import { describe, expect, it } from "vitest";
import { LABEL_MAX_UNITS, dl, flatLabel, xs } from "../src/text.js";

describe("xs: the XML-safe substitution without escaping", () => {
  it("replaces exactly the scalars XML cannot carry by U+FFFD", () => {
    const illegal = [0x0, 0x1, 0x8, 0xb, 0xc, 0xe, 0x1f, 0xfffe, 0xffff];
    for (const c of illegal) expect(xs("a" + String.fromCharCode(c) + "b")).toBe("a�b");
    for (const c of [0x9, 0xa, 0xd, 0x20, 0x7f, 0x2028, 0x202e, 0xfffd]) expect(xs("a" + String.fromCharCode(c))).toBe("a" + String.fromCharCode(c));
  });
  it("keeps astral pairs and replaces lone surrogates", () => {
    expect(xs("\u{1F600}")).toBe("\u{1F600}");
    expect(xs("a\ud800b")).toBe("a�b");
    expect(xs("a\udc00")).toBe("a�");
    expect(xs("\ud83d")).toBe("�");
  });
  it("does not escape markup", () => { expect(xs("<a href=\"x\">&amp;</a>")).toBe("<a href=\"x\">&amp;</a>"); });
});

describe("flatLabel and dl", () => {
  it("TAB, LF and CR become spaces", () => { expect(flatLabel("a\tb\nc\rd")).toBe("a b c d"); });
  it("keeps a label of at most 24 units unchanged", () => {
    expect(dl("x".repeat(24))).toBe("x".repeat(24));
    expect(LABEL_MAX_UNITS).toBe(24);
  });
  it("cuts a 25 unit label to 23 units plus the ellipsis", () => { expect(dl("x".repeat(25))).toBe("x".repeat(23) + "…"); });
  it("never splits a surrogate pair: the whole-scalar prefix of at most 23 units", () => {
    const s = "x".repeat(22) + "\u{1F600}" + "y";
    expect(dl(s)).toBe("x".repeat(22) + "…");
    const t = "x".repeat(21) + "\u{1F600}" + "yyy";
    expect(dl(t)).toBe("x".repeat(21) + "\u{1F600}" + "…");
  });
  it("does not trim or normalise", () => {
    expect(dl("  a  ")).toBe("  a  ");
    expect(dl("é")).toBe("é");
  });
});
