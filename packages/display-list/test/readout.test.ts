// Design 9: the readout, readoutFromSvgReadout and compareReadouts beyond the oracle R rows.
import { describe, expect, it } from "vitest";
import { buildDisplayList, compareReadouts, readoutFromList, readoutFromSvgReadout, serializeReadout, assembleReadout, inGuardBox, type Readout } from "../src/index.js";
import { MIXED20, O1, errOf, initial, readOracleText, textOf } from "./helpers.js";
import { scrapeSvg } from "./oracle/svg-scrape.js";

async function readoutOf(m: { scene: string; layout: string }): Promise<Readout> {
  const i = await initial(m);
  return readoutFromList(buildDisplayList(i.model, i.state));
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("readoutFromList and serializeReadout (9.1)", () => {
  it("the bytes are the canonical JSON followed by one LF, keys in UTF-16 order", async () => {
    const b = textOf(serializeReadout(await readoutOf(O1)));
    expect(b.endsWith("}\n")).toBe(true);
    expect(b.startsWith('{"arrows":')).toBe(true);
    expect(Object.keys(JSON.parse(b) as object)).toEqual(["arrows", "drawn", "igr", "label_units", "labels", "layout_sha256", "marked", "nodes_at", "nodes_far", "scene_sha256", "xr"]);
  });
  it("label_units counts UTF-16 units, drawn is in scene order, an unfocused readout has no marked.focus key", async () => {
    const r = await readoutOf(MIXED20);
    expect(r.label_units).toBe([...r.labels.nodes, ...r.labels.edges].reduce((s, l) => s + l.text.length, 0));
    expect("focus" in r.marked).toBe(false);
  });
});

describe("the guard box (9.1)", () => {
  it("is closed: -256000 and 1000 W + 256000 are inside, one milli-pixel beyond is not", () => {
    expect(inGuardBox(-256000, -256000, 900, 600)).toBe(true);
    expect(inGuardBox(-256001, 0, 900, 600)).toBe(false);
    expect(inGuardBox(1156000, 856000, 900, 600)).toBe(true);
    expect(inGuardBox(1156001, 0, 900, 600)).toBe(false);
    expect(inGuardBox(0, 856001, 900, 600)).toBe(false);
  });
  it("assembleReadout puts a node outside the box into nodes_far without its coordinates", () => {
    const a = { id: "i:1", type: "t" }, b = { id: "i:2", type: "t" };
    const r = assembleReadout({ scene_sha256: "0".repeat(64), layout_sha256: "1".repeat(64), width: 900, height: 600, nodes: [{ address: a, x: 0, y: 0 }, { address: b, x: 5_000_000, y: 0 }], edges: [], selectedNodes: [], selectedEdges: [], arrows: [], labelNodes: [], labelEdges: [] });
    expect(r.nodes_at).toEqual([{ address: a, x: 0, y: 0 }]);
    expect(r.nodes_far).toEqual([b]);
    expect(r.drawn.nodes).toEqual([a, b]);
  });
});

describe("readoutFromSvgReadout (9.2)", () => {
  const svg = scrapeSvg(readOracleText("../oracles-svg/svg/G01.svg"));
  it("equals the readout of the list for the V5 document of G01", async () => {
    expect(textOf(serializeReadout(readoutFromSvgReadout(svg as never)))).toBe(textOf(serializeReadout(await readoutOf(O1))));
  });
  it("the required fields are exact, any other key is ignored", () => {
    const extra = { ...clone(svg), title: "x", idPrefix: "igr", nodes: svg.nodes.map((n) => ({ ...n, id: "igr-n-1", tabindex: "0" })) };
    expect(() => readoutFromSvgReadout(extra as never)).not.toThrow();
    for (const k of ["scene_sha256", "layout_sha256", "width", "height", "directed", "nodes", "edges"]) {
      const o = clone(svg) as unknown as Record<string, unknown>;
      delete o[k];
      expect(errOf(() => readoutFromSvgReadout(o as never)), k).toBe("INVALID_INPUT/SCHEMA");
    }
    const o = clone(svg);
    (o.nodes[0] as unknown as Record<string, unknown>)["selected"] = "yes";
    expect(errOf(() => readoutFromSvgReadout(o as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => readoutFromSvgReadout(null as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a printed number becomes milli-pixels by an exact decimal parse, never through a float", () => {
    const base = clone(svg);
    const run = (cx: string): number => { const o = clone(base); o.nodes[0]!.cx = cx; return readoutFromSvgReadout(o as never).nodes_at[0]!.x; };
    expect(run("32.072")).toBe(32072);
    expect(run("-0.001")).toBe(-1);
    expect(run("4.35")).toBe(4350);
    expect(run("1.001")).toBe(1001);
    expect(run("0.007")).toBe(7);
    expect(run("867.928")).toBe(867928);
    expect(run("0.1")).toBe(100);
    expect(run("12")).toBe(12000);
  });
  it("refuses what 30 3.2 never prints: trailing zeros, exponent, -0, empty, plus sign, leading zero", () => {
    const base = clone(svg);
    for (const bad of ["1.0", "1.50", "1e3", "-0", "", "+1", "01", ".5", "1.", "1.0005", "abc", " 1"]) {
      const o = clone(base); o.nodes[0]!.cx = bad;
      expect(errOf(() => readoutFromSvgReadout(o as never)), JSON.stringify(bad)).toBe("INVALID_INPUT/SCHEMA");
    }
  });
});

describe("compareReadouts (9.4)", () => {
  it("equal readouts agree", async () => {
    const r = await readoutOf(O1);
    expect(compareReadouts([{ renderer: "a", readout: r }, { renderer: "b", readout: clone(r) }])).toEqual({ agree: true, differences: [] });
  });
  it("one differing text: its path and the renderer that differs from the majority", async () => {
    const r = await readoutOf(O1);
    const c = clone(r); c.labels.nodes[0]!.text = "X";
    expect(compareReadouts([{ renderer: "a", readout: r }, { renderer: "b", readout: c }, { renderer: "c", readout: clone(r) }])).toEqual({ agree: false, differences: [{ path: "labels.nodes[0].text", renderers: ["b"] }] });
  });
  it("a tie goes to the value of the first-listed renderer", async () => {
    const r = await readoutOf(O1);
    const c = clone(r); c.labels.nodes[0]!.text = "X";
    expect(compareReadouts([{ renderer: "b", readout: c }, { renderer: "a", readout: r }])).toEqual({ agree: false, differences: [{ path: "labels.nodes[0].text", renderers: ["a"] }] });
  });
  it("different hashes are not comparable", async () => {
    const r = await readoutOf(O1);
    const c = clone(r); c.scene_sha256 = "f".repeat(64);
    expect(compareReadouts([{ renderer: "a", readout: r }, { renderer: "b", readout: c }])).toEqual({ comparable: false });
  });
  it("the entries are validated in order: V1 schema, V2 version, V3 consistency; the first failing entry wins", async () => {
    const r = await readoutOf(O1);
    const run = (e: unknown): string => errOf(() => compareReadouts(e as never));
    expect(run([])).toBe("INVALID_REPORT/SCHEMA");
    expect(run("x")).toBe("INVALID_REPORT/SCHEMA");
    expect(run([{ renderer: 1, readout: r }])).toBe("INVALID_REPORT/SCHEMA");
    expect(run([{ renderer: "a", readout: r, extra: 1 }])).toBe("INVALID_REPORT/SCHEMA");
    const v2 = clone(r); v2.xr = "igr-xr/2" as never;
    expect(run([{ renderer: "a", readout: v2 }])).toBe("INVALID_REPORT/UNSUPPORTED_VERSION");
    const v1 = clone(r) as unknown as Record<string, unknown>; delete v1["arrows"]; v1["xr"] = "igr-xr/2";
    expect(run([{ renderer: "a", readout: v1 }])).toBe("INVALID_REPORT/SCHEMA");
    const v3 = clone(r); v3.nodes_far = [v3.nodes_at[0]!.address]; // a node in both lists: not a partition
    expect(run([{ renderer: "a", readout: v3 }])).toBe("INVALID_REPORT/INCONSISTENT");
    const v3b = clone(r); v3b.arrows[0] = { ...v3b.arrows[0]!, rel: "OTHER" };
    expect(run([{ renderer: "a", readout: v3b }])).toBe("INVALID_REPORT/INCONSISTENT");
    const bad = clone(r); bad.scene_sha256 = "F".repeat(64);
    expect(run([{ renderer: "a", readout: r }, { renderer: "b", readout: bad }])).toBe("INVALID_REPORT/SCHEMA");
  });
  it("takes a snapshot: an accessor or a __proto__ key in the caller's object is refused", async () => {
    const r = await readoutOf(O1);
    const acc = { renderer: "a", get readout() { return r; } };
    expect(errOf(() => compareReadouts([acc] as never))).toBe("INVALID_REPORT/SCHEMA");
    expect(errOf(() => compareReadouts(JSON.parse('[{"renderer":"a","__proto__":{}}]') as never))).toBe("INVALID_REPORT/SCHEMA");
  });
});
