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
