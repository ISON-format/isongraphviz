// Unit tests of the planner, the guard rule, the reader and the readout beyond the corpus rows: the single-fault property of the W rows (bad/FAULTS.tsv and bad/FAULTS-rev6.tsv are
// the corpus's own record of the rule each bad plan breaks), the arithmetic of A.10, limits, immutability and the shape of an empty plan.
import { describe, expect, it } from "vitest";
import { GUARD_MARGIN, type DisplayList } from "isongraph-visualize-display-list";
import { DEFAULT_GL_LIMITS, GL_FORMAT, GL_SEG, glWitness, parseGlPlan, planGl, readGlPlan, readoutFromGl, serializePlan } from "../src/index.js";
import { clipSegment } from "../src/clip.js";
import { decodeArrows, decodeDiscs, decodeEdges } from "../src/plan.js";
import { errOf, readOracle, readOracleText, sha256, textOf } from "./helpers.js";

const headerLine = (b: Uint8Array): string => textOf(b.slice(0, b.indexOf(10)));

/** The list of A.10 at the list level (placeholder hashes), as the design prints it. */
function farList(): DisplayList {
  const n = (id: string) => ({ id, type: "t" });
  return {
    format: "igr-dl/1", width: 900, height: 600, directed: true,
    artifactSha256: "1".repeat(64), sceneSha256: "2".repeat(64), layoutSha256: "3".repeat(64),
    nodes: [n("s:a"), n("s:b")], edges: [{ ord: "0", rel: "r", src: n("s:a"), tgt: n("s:b") }],
    records: [
      ["E", 3, 0, 0, -2000000000, 300000, 1000000001, 700003],
      ["A", 3, 1000000001, 700003, 999990001, 699999, 999991001, 699000],
      ["N", 1, 0, 1, -2000000000, 300000],
      ["N", 2, 0, 0, 1000000001, 700003],
    ],
  } as unknown as DisplayList;
}

describe("constants", () => {
  it("name the format, the segment count and the ceiling", () => {
    expect([GL_FORMAT, GL_SEG, DEFAULT_GL_LIMITS.maxGlBytes]).toEqual(["igr-gl/1", 16, 268_435_456]);
    expect(GUARD_MARGIN).toBe(256_000);
  });
});

describe("the guard rule on the far edge of Appendix A.10", () => {
  it("clips to the single kind-0 instance (-256000, 566635) -> (1156000, 566823), omits both nodes into cn, omits the arrow and keeps d = 1", () => {
    const plan = planGl(farList());
    const header = JSON.parse(headerLine(serializePlan(plan))) as Record<string, unknown>;
    expect(header["cn"]).toEqual([[1, 1], [2, 0]]);
    expect(header["ce"]).toEqual([]);
    expect(header["d"]).toBe(1);
    expect(header["sizes"]).toEqual({ arrow: 0, disc: 0, edge: 40 });
    expect(header["draws"]).toEqual([{ count: 1, first: 0, layer: 3, program: "edge" }]);
    expect(decodeEdges(plan.buffers.edge)).toEqual([{ c: [-256000, 566635, 0, 0, 0, 0, 1156000, 566823], pid: 3, kind: 0, style: 2, pad: 0 }]);
    expect(decodeArrows(plan.buffers.arrow)).toEqual([]);
    expect(decodeDiscs(plan.buffers.disc)).toEqual([]);
  });
  it("matches the header printed in Appendix A.10 byte for byte", () => {
    const line = headerLine(serializePlan(planGl(farList())));
    expect(line).toBe('{"artifact":"1111111111111111111111111111111111111111111111111111111111111111","ce":[],"cn":[[1,1],[2,0]],"d":1,"draws":[{"count":1,"first":0,"layer":3,"program":"edge"}],"ed":1,"format":"igr-gl/1","g":256000,"h":600,"layout":"3333333333333333333333333333333333333333333333333333333333333333","nd":2,"nt":0,"scene":"2222222222222222222222222222222222222222222222222222222222222222","seg":16,"sizes":{"arrow":0,"disc":0,"edge":40},"stride":{"arrow":28,"disc":16,"edge":40},"w":900}');
  });
  it("the readout of that plan lists both omitted nodes as drawn, the first as selected, both in nodes_far, and the arrow", () => {
    const r = readoutFromGl(planGl(farList()));
    expect(r.drawn.nodes.map((x) => x.id)).toEqual(["s:a", "s:b"]);
    expect(r.marked.selected.nodes.map((x) => x.id)).toEqual(["s:a"]);
    expect(r.nodes_at).toEqual([]);
    expect(r.nodes_far.map((x) => x.id)).toEqual(["s:a", "s:b"]);
    expect(r.arrows.length).toBe(1);
    expect(glWitness(planGl(farList())).elements.nodes.length).toBe(2);
  });
  it("clipSegment: rounds half up (floorDiv would give 566634) and rejects a parallel segment outside the box", () => {
    expect(clipSegment([-2000000000, 300000], [1000000001, 700003], 900, 600, GUARD_MARGIN)).toEqual([-256000, 566635, 1156000, 566823]);
    expect(clipSegment([-20_000_000, -300_000], [20_000_000, -300_000], 900, 600, GUARD_MARGIN)).toBeUndefined(); // p = 0, q < 0 on the top side
    expect(clipSegment([0, 0], [10, 10], 900, 600, GUARD_MARGIN)).toEqual([0, 0, 10, 10]);
    expect(clipSegment([-256000, -256000], [-256000, -256000], 900, 600, GUARD_MARGIN)).toBeUndefined(); // a single point
  });
});

describe("planGl", () => {
  it("refuses a plan over maxBytes (inclusive) with RESOURCE_LIMIT/BYTES_LIMIT and validates its limits argument", () => {
    const len = serializePlan(planGl(farList())).length;
    expect(planGl(farList(), { maxBytes: len }).header.nd).toBe(2);
    expect(errOf(() => planGl(farList(), { maxBytes: len - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(errOf(() => planGl(farList(), { maxBytes: -1 }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => planGl(farList(), { maxBytes: 1.5 }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => planGl(farList(), { bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => planGl(farList(), [] as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("refuses a number that float32 could not hold exactly (the guard rule keeps every number below 2^24)", () => {
    const l = farList();
    // a node at the very limit of the node box (guard box expanded by 22000) is emitted, exact; one m-px further is omitted
    const one = (x: number): DisplayList => ({ ...l, edges: [], nodes: [l.nodes[0]!], directed: false, records: [["N", 1, 0, 0, x, 300000]] }) as unknown as DisplayList;
    expect(decodeDiscs(planGl(one(1_178_000)).buffers.disc)[0]!.x).toBe(1_178_000);
    expect(decodeDiscs(planGl(one(1_178_001)).buffers.disc)).toEqual([]);
  });
  it("an empty list is the header alone, with no draws and zero-length buffers", () => {
    const empty = { ...farList(), nodes: [], edges: [], records: [], directed: true } as unknown as DisplayList;
    const bytes = serializePlan(planGl(empty));
    expect(textOf(bytes).split("\n").length).toBe(2);
    expect(JSON.parse(textOf(bytes).split("\n")[0]!).draws).toEqual([]);
  });
  it("does not retain or modify the list: planning twice gives the same bytes", () => {
    const l = farList();
    const a = serializePlan(planGl(l)), b = serializePlan(planGl(l));
    expect(sha256(a)).toBe(sha256(b));
  });
});

describe("the reader: the single-fault property of the W rows (design 7.2: 'each single-fault in the W rows')", () => {
  // the corpus records the rule of each bad plan in bad/FAULTS.tsv (W02-W46) and, since design rev 6, in the NEW file bad/FAULTS-rev6.tsv (W48, W49): both are read
  const faultsOf = (p: string): [string, string][] => readOracleText(p).split("\n").slice(1).filter((l) => l !== "").map((l) => l.split("\t") as [string, string]);
  const faults = [...faultsOf("bad/FAULTS.tsv"), ...faultsOf("bad/FAULTS-rev6.tsv")];
  it("there is one entry per reject row W02-W46 and W48-W49 (W47 and W50 are the accept rows and have none): the entries are exactly the W rows with an error cell", () => {
    const rejects = readOracleText("EXPECT.tsv").split("\n").slice(1).map((l) => l.split("\t")).filter((c) => c[1] === "W" && c[7] !== undefined && c[7] !== "").map((c) => c[0]);
    expect(faults.map((f) => f[0])).toEqual(rejects);
    expect(faults.map((f) => f[0])).toEqual([...Array.from({ length: 45 }, (_, i) => `W${String(i + 2).padStart(2, "0")}`), "W48", "W49"]);
  });
  for (const [id, rule] of faults) {
    it(`${id}: rejected by ${rule}, and accepted when only ${rule} is skipped`, () => {
      const bytes = readOracle(`bad/${id}.glplan`);
      expect(() => parseGlPlan(bytes), `${id} strict`).toThrow(new RegExp(`${rule}:`));
      expect(() => readGlPlan(bytes, { skip: [rule] }), `${id} with ${rule} skipped`).not.toThrow();
    });
  }
  it("every rule skipped (lenient) reads every bad plan; the lexer is never skipped", () => {
    for (const [id] of faults) expect(() => readGlPlan(readOracle(`bad/${id}.glplan`), { lenient: true }), id).not.toThrow();
    expect(() => readGlPlan(new TextEncoder().encode("{}"), { lenient: true })).toThrow(/no LF/);
    expect(() => readGlPlan(new TextEncoder().encode("{}\r\n"), { lenient: true })).toThrow(/CR/);
  });
});

describe("the reader: bounds and lexing", () => {
  const g01 = readOracle("plan/G01.glplan");
  it("is bounded: maxBytes (BYTES_LIMIT at path cv.read) and maxLineUnits", () => {
    expect(errOf(() => parseGlPlan(g01, { maxBytes: g01.length - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(errOf(() => parseGlPlan(g01, { maxBytes: g01.length }))).toBe("none");
    expect(errOf(() => parseGlPlan(g01, { maxLineUnits: 100 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("rejects a non-bytes argument, a missing header LF, a CRLF, a blank line, an indented line and nesting deeper than 3", () => {
    expect(errOf(() => parseGlPlan("x" as never))).toBe("INVALID_INPUT/SCHEMA");
    const text = textOf(g01.slice(0, 836)); // the prefix block: header, table, labels
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
    const buffers = g01.slice(836);
    const cat = (s: string): Uint8Array => { const h = enc(s); const o = new Uint8Array(h.length + buffers.length); o.set(h); o.set(buffers, h.length); return o; };
    expect(errOf(() => parseGlPlan(enc(text.split("\n")[0]!)))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => parseGlPlan(cat(text.replace("\n", "\r\n"))))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => parseGlPlan(cat(text.replace("\n", "\n\n"))))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => parseGlPlan(cat(text + ""))), "the untouched prefix parses").toBe("none");
    expect(errOf(() => parseGlPlan(cat(text.split("\n").map((l, i) => (i === 2 ? " " + l : l)).join("\n"))))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a text label of brackets is legal for the nesting scan (string content does not count)", () => {
    const base = textOf(g01.slice(0, 836));
    const replaced = base.replace('"1"]', '"[[[[}}}}"]');
    const buffers = g01.slice(836);
    const h = new TextEncoder().encode(replaced);
    const o = new Uint8Array(h.length + buffers.length);
    o.set(h); o.set(buffers, h.length);
    const plan = parseGlPlan(o);
    expect(plan.texts[0]![5]).toBe("[[[[}}}}");
    expect(serializePlan(plan)).toEqual(o);
  });
});
