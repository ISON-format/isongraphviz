// Design 4.7: the strict reader beyond the oracle S rows: the lexer, the string-aware nesting scan, the bounds, error shapes, round trips.
import { describe, expect, it } from "vitest";
import { IgrError } from "isongraph-visualize-renderer-core";
import { buildDisplayList, parseDisplayList, serializeDisplayList } from "../src/index.js";
import { bytesOf, initial, loadModel, MIXED20, readOracleText, errOf, readState, textOf } from "./helpers.js";

const G01 = readOracleText("dl/G01.dl");
const parse = (s: string | Uint8Array, limits?: { maxBytes?: number; maxLineUnits?: number }) => parseDisplayList(typeof s === "string" ? bytesOf(s) : s, limits);
const code = (f: () => unknown): string => errOf(f);

describe("the lexer (D1)", () => {
  it("accepts G01 and re-serializes to the same bytes", () => {
    expect(textOf(serializeDisplayList(parse(G01)))).toBe(G01);
  });
  it("rejects a byte order mark, invalid UTF-8 and an overlong encoding", () => {
    expect(code(() => parse(new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf(G01)])))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(new Uint8Array([0xff, 0xfe])))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(new Uint8Array([0xc0, 0x80])))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(new Uint8Array([0xed, 0xa0, 0x80])))).toBe("INVALID_INPUT/SCHEMA"); // an encoded surrogate
  });
  it("only a CR immediately before the LF is a line-boundary byte; a CR inside a line is a JSON syntax error", () => {
    expect(code(() => parse(G01.replace("\n", "\r\n")))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.replace('"i:1"', '"i:1"\r')))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("splits on LF only: U+2028, U+2029 and U+0085 stay inside a string (the X08 list parses)", () => {
    const x08 = readOracleText("dl/X08.dl");
    expect(x08.includes(" ")).toBe(true); // a literal separator inside a string: a reader that splits on it would break the line
    expect(textOf(serializeDisplayList(parse(x08)))).toBe(x08);
  });
  it("an empty input has no header; a file without a final LF is rejected", () => {
    expect(code(() => parse(""))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.slice(0, -1)))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("the nesting scan skips string content: brackets inside a label are legal, depth 4 outside is not (X12 and S32)", () => {
    expect(textOf(serializeDisplayList(parse(readOracleText("dl/X12.dl"))))).toBe(readOracleText("dl/X12.dl"));
    expect(code(() => parse(G01.replace('["n",{"id":"i:1","type":"person"}]', '["n",[[[1]]]]')))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("the line number of the failing line is in the path", () => {
    let err: unknown;
    try { parse(G01.replace('["N",1,0,0,32072,193600]', '["N",1,9,0,32072,193600]')); } catch (e) { err = e; }
    expect((err as IgrError).path).toBe("line 7");
  });
});

describe("the bounds", () => {
  it("maxBytes is the exact UTF-8 length of the whole input, inclusive", () => {
    const n = bytesOf(G01).length;
    expect(() => parse(G01, { maxBytes: n })).not.toThrow();
    expect(code(() => parse(G01, { maxBytes: n - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("maxLineUnits is measured on the raw line (UTF-16 units), inclusive", () => {
    const longest = Math.max(...G01.split("\n").map((l) => l.length));
    expect(() => parse(G01, { maxLineUnits: longest })).not.toThrow();
    expect(code(() => parse(G01, { maxLineUnits: longest - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("the bound is checked before the record rules: an oversized line wins over a schema fault", () => {
    expect(code(() => parse("[" + "9,".repeat(80) + "9]\n", { maxLineUnits: 10 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("a limit that is not a number is refused", () => {
    expect(code(() => parse(G01, { maxBytes: "x" } as never))).toBe("INVALID_INPUT/INVALID_VALUE");
  });
});

describe("the record rules", () => {
  it("rejects every number spelling but the canonical one", () => {
    for (const bad of ["32072.0", "3.2072e4", "+32072", "032072", "-0"]) expect(code(() => parse(G01.replace("32072,193600", `${bad},193600`)))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("rejects an address with keys out of order, spaces, or an extra key", () => {
    expect(code(() => parse(G01.replace('{"id":"i:1","type":"person"}', '{"type":"person","id":"i:1"}')))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.replace('{"id":"i:1","type":"person"}', '{"id":"i:1", "type":"person"}')))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.replace('{"id":"i:1","type":"person"}', '{"id":"i:1","type":"person","x":1}')))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("rejects an id that is neither s: nor a canonical int64, and a type with a colon", () => {
    expect(code(() => parse(G01.split('"i:1"').join('"x:1"')))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.split('"i:1"').join('"i:01"')))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.split('"i:1"').join('"i:9223372036854775808"')))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.split('"person"').join('"per:son"')))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("rejects a header with the wrong shape: nine members, W above 16384, an upper-case hash", () => {
    expect(code(() => parse(G01.replace(",2,1]\n", ",2]\n")))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.replace("900,600,1", "16385,600,1")))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.replace("900,600,1", "900,600,2")))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a T with an empty text, or whose role contradicts its pid, is refused", () => {
    expect(code(() => parse(G01.replace('"KNOWS"]', '""]')))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => parse(G01.replace('["T",3,1,', '["T",3,0,')))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("accepts a list built from any model, including hidden elements and a header-only list", async () => {
    const { model, state } = await initial(MIXED20);
    const s = JSON.parse(JSON.stringify(readState("states/Y12.state.json"))) as typeof state;
    for (const st of [state, s]) {
      const bytes = serializeDisplayList(buildDisplayList(model, st));
      expect(textOf(serializeDisplayList(parse(bytes)))).toBe(textOf(bytes));
    }
    const empty = await loadModel("../oracles-igl/scenes/empty.scene.json", "../oracles-igl/layouts/F07.layout.json");
    const list = buildDisplayList(empty, (await initial({ scene: "../oracles-igl/scenes/empty.scene.json", layout: "../oracles-igl/layouts/F07.layout.json" })).state);
    expect(list.records).toEqual([]);
    expect(parse(serializeDisplayList(list)).records).toEqual([]);
  });
});

// Rule D13 (design 4.7, R31-05, ruled 2026-11-22): at most one E or N record of the whole list has the focus bit (flags 2 or 3); the second such
// record is INVALID_INPUT/SCHEMA at ITS line; D13 is applied after the rules of each record. G01: line 5 is its E, lines 7 and 8 its N records.
describe("D13: at most one E or N record has the focus bit", () => {
  const E = '["E",3,0,0,', N1 = '["N",1,0,0,', N2 = '["N",2,0,0,';
  const withFlags = (edits: { e?: number; n1?: number; n2?: number }): string => {
    let s = G01;
    if (edits.e !== undefined) s = s.replace(E, `["E",3,${edits.e},0,`);
    if (edits.n1 !== undefined) s = s.replace(N1, `["N",1,0,${edits.n1},`);
    if (edits.n2 !== undefined) s = s.replace(N2, `["N",2,0,${edits.n2},`);
    return s;
  };
  const refused = (s: string): { code: string; path: string | undefined } => {
    try { parse(s); } catch (e) { return { code: `${(e as IgrError).code}/${(e as IgrError).reason}`, path: (e as IgrError).path }; }
    return { code: "none", path: undefined };
  };
  it("two N records with the focus bit: refused at the line of the second", () => {
    expect(refused(withFlags({ n1: 2, n2: 2 }))).toEqual({ code: "INVALID_INPUT/SCHEMA", path: "line 8" });
  });
  it("an E and an N with the focus bit: refused at the N (the second in the list)", () => {
    expect(refused(withFlags({ e: 2, n1: 2 }))).toEqual({ code: "INVALID_INPUT/SCHEMA", path: "line 7" });
  });
  it("flags 3 counts as the focus bit like flags 2, in either order", () => {
    expect(refused(withFlags({ n1: 3, n2: 2 })).path).toBe("line 8");
    expect(refused(withFlags({ n1: 2, n2: 3 })).path).toBe("line 8");
    expect(refused(withFlags({ e: 3, n1: 3 })).path).toBe("line 7");
  });
  it("three focus bits: the error is at the second, not the third", () => {
    expect(refused(withFlags({ e: 2, n1: 3, n2: 2 })).path).toBe("line 7");
  });
  it("one focus bit, none, or flags 1 (selected only) on every record are accepted", () => {
    for (const edits of [{ e: 2 }, { n1: 2 }, { n2: 3 }, { e: 3 }, {}, { e: 1, n1: 1, n2: 1 }, { e: 1, n1: 3, n2: 1 }]) {
      expect(refused(withFlags(edits)).code, JSON.stringify(edits)).toBe("none");
    }
  });
  it("a record rule outranks D13 whether the faulty record comes before the first focus record or after the second", () => {
    // after: a T of 25 units (D9, line 9) behind two focused N records
    const after = withFlags({ n1: 2, n2: 2 }).replace('"1"]', `"${"x".repeat(25)}"]`);
    expect(refused(after)).toEqual({ code: "INVALID_INPUT/SCHEMA", path: "line 9" });
    // before: an E with flags 4 (D6, line 5) ahead of two focused N records
    expect(refused(withFlags({ e: 4, n1: 2, n2: 2 }))).toEqual({ code: "INVALID_INPUT/SCHEMA", path: "line 5" });
  });
  it("a list built from a model never has two (the builder and the reader agree): Y03 and Y06 are accepted", () => {
    for (const f of ["dl/Y03.dl", "dl/Y06.dl", "dl/Y16.dl"]) expect(refused(readOracleText(f)).code, f).toBe("none");
  });
});
