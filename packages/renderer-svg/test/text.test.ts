// Section 7.1, 7.2, 7.5(a): xs, TEXT, ATTR and the drawn label dl (Appendix A.6).
import { describe, expect, it } from "vitest";
import { ATTR, TEXT, dl, xs } from "../src/text.js";

const sc = (...cps: number[]) => String.fromCodePoint(...cps);

describe("7.1 xs", () => {
  it("keeps TAB, LF, CR, DEL, C1, U+2028, bidi controls, astral scalars", () => {
    for (const s of ["\t", "\n", "\r", "\u007f", "\u0085", "\u2028", "\u2029", "\u202e", "\u2066", "😀", "\ufffd", "\ue000", "\ud7ff"]) expect(xs(s)).toBe(s);
  });
  it("replaces U+0000-0008, 000B, 000C, 000E-001F, FFFE, FFFF by U+FFFD", () => {
    const bad = [0, 1, 8, 0xb, 0xc, 0xe, 0x1f, 0xfffe, 0xffff];
    for (const c of bad) expect(xs("a" + sc(c) + "b")).toBe("a\ufffdb");
    expect(xs("x\u0000y\ufffez")).toBe("x\ufffdy\ufffdz"); // A.6
  });
  it("a lone surrogate (cannot occur in IGS strings) never reaches the output", () => {
    expect(xs("a\ud800b")).toBe("a\ufffdb");
  });
});

describe("7.2 TEXT and ATTR", () => {
  it("TEXT escapes & < > LF CR; TAB literal; quotes literal", () => {
    expect(TEXT(`a<b&"c'>d`)).toBe(`a&lt;b&amp;"c'&gt;d`);
    expect(TEXT("a\nb\tc\r")).toBe("a&#10;b\tc&#13;");
  });
  it("ATTR escapes & < > \" TAB LF CR", () => {
    expect(ATTR(`a<b&"c'>d`)).toBe(`a&lt;b&amp;&quot;c'&gt;d`);
    expect(ATTR("a\nb\tc\r")).toBe("a&#10;b&#9;c&#13;");
  });
  it("neither contains a raw forbidden character for any input", () => {
    const s = "<>&\"'\t\n\r\u0000\u0001\ufffe\u2028]]>-->&#x41;</title>";
    expect(TEXT(s)).not.toMatch(/[<>\n\r]|&(?!(amp|lt|gt|#10|#13);)/);
    expect(ATTR(s)).not.toMatch(/[<>\t\n\r"]|&(?!(amp|lt|gt|quot|#9|#10|#13);)/);
  });
  it("applies xs first", () => { expect(TEXT("a\u0001b")).toBe("a\ufffdb"); expect(ATTR("a\u0001b")).toBe("a\ufffdb"); });
});

describe("7.5(a) dl (A.6)", () => {
  const a = (n: number) => "a".repeat(n);
  it("24 units unchanged; 25 -> 23 + ellipsis", () => {
    expect(dl(a(24))).toBe(a(24));
    expect(dl(a(25))).toBe(a(23) + "\u2026");
    expect(dl(a(23))).toBe(a(23));
  });
  it("never splits a surrogate pair", () => {
    expect(dl(a(22) + "😀")).toBe(a(22) + "😀"); // 24 units
    expect(dl(a(23) + "😀")).toBe(a(23) + "\u2026"); // 25 units
    expect(dl(a(22) + "😀" + "b")).toBe(a(22) + "\u2026"); // pair would end at unit 24 > 23
  });
  it("replaces TAB LF CR by spaces and applies xs", () => {
    expect(dl("a\nb\tc\r")).toBe("a b c ");
    expect(dl("x\u0000y")).toBe("x\ufffdy");
  });
  it("an empty label stays empty; spaces stay spaces", () => { expect(dl("")).toBe(""); expect(dl("   ")).toBe("   "); });
  it("truncated by units, not by grapheme: a combining mark may be cut", () => {
    expect(dl(a(23) + "e\u0301")).toBe(a(23) + "\u2026");
  });
});
