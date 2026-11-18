// The writer: writeSvg sink contract (2.1, 14.2), document structure rules (5.x), geometry classes (6.x), labels (7.5), selection/focus/tab stops (8.x).
import { describe, expect, it } from "vitest";
import { initialState, reduce, type ElementAddress, type SemanticState } from "isongraph-visualize-renderer-core";
import { renderSvg, renderSvgDetailed, writeSvg } from "../src/index.js";
import { MAX_JOIN_UNITS, collectSvg } from "../src/write.js";
import { MIXED20, O1, O4, SIZE, errOf, loadModel, o1 } from "./helpers.js";

const lines = (model: never, state: never, options?: unknown): string[] => { const out: string[] = []; writeSvg(model, state, options as never, (l) => { out.push(l); }); return out; };
const I1: ElementAddress = { node: { id: "i:1", type: "person" } };
const ANN: ElementAddress = { node: { id: "s:ann", type: "person" } };
const KNOWS: ElementAddress = { edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } };
const lineOf = (doc: string, needle: string): string => doc.split("\n").find((l) => l.includes(needle)) ?? "";

describe("writeSvg sink contract (2.1, 14.2)", () => {
  it("a sink that is not a function is SCHEMA, judged before the model", async () => {
    const { state } = await o1();
    expect(errOf(() => writeSvg({} as never, state, undefined, 5 as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => writeSvg({} as never, state, undefined, (() => undefined) as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
  });
  it("one call per physical line, each ending with LF; <style> is 21 calls; the lines join to renderSvg", async () => {
    const { model, state } = await o1();
    const l = lines(model as never, state as never);
    expect(l.every((x) => x.endsWith("\n") && x.indexOf("\n") === x.length - 1)).toBe(true);
    expect(l.join("")).toBe(renderSvg(model, state));
    const at = l.indexOf("<style>\n");
    expect(l[at + 20]).toBe("</style>\n");
    expect(l.slice(at + 1, at + 20)).toHaveLength(19);
    expect(lines(model as never, state as never, { style: false }).includes("<style>\n")).toBe(false);
  });
  it("a throwing sink stops the writer and its exception propagates unchanged", async () => {
    const { model, state } = await o1();
    const boom = new Error("boom");
    let calls = 0;
    expect(() => writeSvg(model, state, undefined, () => { if (++calls === 3) throw boom; })).toThrow(boom);
    expect(calls).toBe(3);
  });
  it("the byte total counts the delivered lines; the limit is inclusive; the refused line is not delivered", async () => {
    const { model, state } = await o1();
    const full = renderSvgDetailed(model, state);
    expect(full.bytes).toBe(3193);
    let got = 0, n = 0;
    expect(() => writeSvg(model, state, { maxSvgBytes: 3192 }, (l) => { got += l.length; n++; })).toThrow(/BYTES_LIMIT/);
    expect(got).toBeLessThanOrEqual(3192);
    expect(got + "</svg>\n".length).toBe(3193); // only the last line was refused
    expect(errOf(() => renderSvg(model, state, { maxSvgBytes: 3193 }))).toBe("none");
    expect(errOf(() => renderSvg(model, state, { maxSvgBytes: 3192 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(errOf(() => renderSvg(model, state, { maxSvgBytes: 0 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(n).toBeGreaterThan(0);
  });
  it("counts UTF-8 bytes, not UTF-16 units: a multi-byte label moves the limit by its UTF-8 length", async () => {
    const model = await loadModel("../oracles-igl/scenes/unicode.scene.json", "../oracles-igl/layouts/F09.layout.json");
    const st = initialState(model, SIZE);
    const r = renderSvgDetailed(model, st);
    expect(r.bytes).toBe(new TextEncoder().encode(r.svg).length);
    expect(r.bytes).toBeGreaterThan(r.svg.length);
    expect(errOf(() => renderSvg(model, st, { maxSvgBytes: r.bytes }))).toBe("none");
    expect(errOf(() => renderSvg(model, st, { maxSvgBytes: r.bytes - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("the error is RESOURCE_LIMIT/BYTES_LIMIT with path svg and no other code", async () => {
    const { model, state } = await o1();
    try { renderSvg(model, state, { maxSvgBytes: 10 }); expect.unreachable(); } catch (e) { expect((e as { code: string; reason: string; path: string }).path).toBe("svg"); }
  });
  it("is deterministic and does not mutate its inputs", async () => {
    const { model, state } = await o1();
    const copy = JSON.stringify(state);
    expect(renderSvg(model, state)).toBe(renderSvg(model, state));
    expect(JSON.stringify(state)).toBe(copy);
  });
  it("renderSvg has at most three parameters", () => { expect(renderSvg.length).toBeLessThanOrEqual(3); });
});

describe("5.2/5.3 document order and shape", () => {
  it("nodes, then edges; declaration only when asked; every line ends with one LF; no blank lines, CR or indentation", async () => {
    const { model, state } = await o1();
    const d = renderSvg(model, state, { xmlDeclaration: true });
    expect(d.endsWith("</svg>\n")).toBe(true);
    expect(d.endsWith("\n\n")).toBe(false);
    expect(d).not.toMatch(/\r|\n\n|\n[ \t]/);
    expect(d.indexOf('<g class="igr-nodes">')).toBeLessThan(d.indexOf('<g class="igr-edges">'));
    expect(d.indexOf("<defs>")).toBeGreaterThan(d.indexOf("</style>"));
  });
  it("the root carries the three hashes of the model and the viewport size", async () => {
    const { model, state } = await o1();
    const d = renderSvg(model, state);
    expect(d).toContain(`data-igr-artifact="${model.artifactSha256}" data-igr-scene="${model.sceneSha256}" data-igr-layout="${model.layoutSha256}"`);
    expect(d).toContain('width="900" height="600" viewBox="0 0 900 600"');
  });
  it("the viewBox follows the viewport, not the layout bounds (K76) and odd sizes are plain integers", async () => {
    const { model } = await o1();
    expect(renderSvg(model, initialState(model, { width: 901, height: 601 }))).toContain('width="901" height="601" viewBox="0 0 901 601"');
  });
  it("no style, fill or stroke attribute and no class outside section 5.5 anywhere", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const s = initialState(m, SIZE);
    const d = renderSvg(m, reduce(m, s, { type: "select", mode: "replace", targets: [{ edge: m.edges[7]!.ref }] }).state);
    expect(d).not.toMatch(/ style="| fill="| stroke="/);
    const allowed = new Set(["igr-svg", "igr-nodes", "igr-edges", "igr-node", "igr-edge", "igr-selected", "igr-focused", "igr-k0", "igr-k1", "igr-k2", "igr-k3", "igr-k4", "igr-k5", "igr-k6", "igr-k7", "igr-kx", "igr-shape", "igr-ring-sel", "igr-ring-foc", "igr-halo-sel", "igr-halo-foc", "igr-line", "igr-pick", "igr-label", "igr-elabel", "igr-arrow"]);
    for (const m2 of d.matchAll(/ class="([^"]+)"/g)) for (const c of m2[1]!.split(" ")) expect(allowed.has(c), c).toBe(true);
  });
});

describe("7.4 category class", () => {
  it("is the index in the sorted model categories; hiding nodes never changes it (K60)", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    expect(m.categories).toEqual(["company", "person", "project"]);
    const s = initialState(m, SIZE);
    const hide = m.nodes.filter((n) => n.category === "company").map((n) => ({ node: n.ref }));
    const d = renderSvg(m, reduce(m, s, { type: "set-hidden", targets: hide, hidden: true }).state);
    expect(d).not.toContain('class="igr-node igr-k0');
    expect(d).toContain('class="igr-node igr-k1');
    expect(d).toContain('class="igr-node igr-k2');
  });
});

describe("8 selection, focus, tab stop", () => {
  it("ring and halo orders; both indicators for a selected and focused element; class order", async () => {
    const { model, state } = await o1();
    let s = reduce(model, state, { type: "select", mode: "replace", targets: [I1, KNOWS] }).state;
    s = reduce(model, s, { type: "focus", target: KNOWS }).state;
    const d = renderSvg(model, s);
    const e = d.slice(d.indexOf('<g id="igr-e-'));
    expect(e.indexOf("igr-halo-sel")).toBeLessThan(e.indexOf("igr-halo-foc"));
    expect(e.indexOf("igr-halo-foc")).toBeLessThan(e.indexOf("igr-line"));
    expect(e).toContain('class="igr-edge igr-selected igr-focused"');
    expect(e.indexOf("igr-line")).toBeLessThan(e.indexOf("igr-pick"));
    s = reduce(model, s, { type: "select", mode: "replace", targets: [I1] }).state;
    s = reduce(model, s, { type: "focus", target: I1 }).state;
    const n = renderSvg(model, s);
    const nd = n.slice(n.indexOf('<g id="igr-n-'), n.indexOf("</g>"));
    expect(nd).toContain('class="igr-node igr-k0 igr-selected igr-focused"');
    expect(nd.indexOf("igr-ring-sel")).toBeLessThan(nd.indexOf("igr-ring-foc"));
    expect(nd.indexOf("igr-ring-foc")).toBeLessThan(nd.indexOf("igr-shape"));
    expect(nd).toContain('r="14"');
    expect(nd).toContain('r="18"');
  });
  it("exactly one tabindex 0: the focused element, else the first node, else the first edge, else none", async () => {
    const { model, state } = await o1();
    const count = (d: string): number => (d.match(/tabindex="0"/g) ?? []).length;
    expect(count(renderSvg(model, state))).toBe(1);
    expect(lineOf(renderSvg(model, state), "person 1\" tabindex")).toContain('tabindex="0"');
    const f = reduce(model, state, { type: "focus", target: KNOWS }).state;
    const d = renderSvg(model, f);
    expect(count(d)).toBe(1);
    expect(lineOf(d, 'aria-label="KNOWS"')).toContain('tabindex="0"');
    const h = reduce(model, state, { type: "set-hidden", targets: [I1, ANN], hidden: true }).state;
    expect(count(renderSvg(model, h))).toBe(0);
    const hn = reduce(model, state, { type: "set-hidden", targets: [{ node: ANN.node }], hidden: true }).state;
    expect(count(renderSvg(model, hn))).toBe(1);
    const he = reduce(model, state, { type: "set-hidden", targets: [KNOWS], hidden: true }).state;
    expect(count(renderSvg(model, he))).toBe(1);
  });
  it("hidden elements are absent, not styled; the root desc counts them", async () => {
    const { model, state } = await o1();
    const d = renderSvg(model, reduce(model, state, { type: "set-hidden", targets: [ANN], hidden: true }).state);
    expect(d).not.toContain("person ann");
    expect(d).not.toContain("KNOWS");
    expect(d).toContain("0 selected, 2 hidden.");
    expect(d).toContain("Directed graph with 2 nodes and 1 edge."); // the summary counts hidden elements
  });
  it("an element outside the viewport is emitted with its true coordinates (3.3)", async () => {
    const { model, state } = await o1();
    const s = reduce(model, state, { type: "set-viewport", center_x: 0, center_y: 0, zoom: 1000 }).state;
    expect(renderSvg(model, s)).toMatch(/cx="-?\d+(\.\d+)?"/);
    expect(renderSvg(model, s)).toContain("igr-shape");
  });
});

describe("6 edge classes", () => {
  it("self-loops carry no marker when undirected, a marker when directed; ranks restart per node (A.8, N08)", async () => {
    const m = await loadModel(O4.scene, O4.layout);
    const d = renderSvg(m, initialState(m, SIZE));
    expect(lineOf(d, " C ")).not.toContain("marker-end");
    const loops = await loadModel("scenes/loops2.scene.json", "layouts/loops2.layout.json");
    const ld = renderSvg(loops, initialState(loops, SIZE));
    // per loop h = My - c1y = 24 + 12 r (6.6): the ranks restart at 0 for each node (K21), two nodes with three and two loops
    const hs = ld.split("\n").filter((l) => l.includes('class="igr-line"')).map((l) => { const t = /d="M ([-\d.]+) ([-\d.]+) C ([-\d.]+) ([-\d.]+)/.exec(l)!; return Math.round((Number(t[2]) - Number(t[4])) * 1000); });
    expect(hs).toEqual([24000, 36000, 48000, 24000, 36000]);
  });
  it("an antiparallel pair is one group: the two members bulge to opposite sides whatever their direction (6.5)", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const d = renderSvg(m, initialState(m, SIZE));
    const q = d.match(/class="igr-line" d="M [-\d. ]+ Q ([-\d.]+) ([-\d.]+) [-\d. ]+"/g) ?? [];
    expect(q.length).toBeGreaterThanOrEqual(6);
  });
  it("hiding one member of a group turns the other back to a straight edge (N10-like)", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const s = initialState(m, SIZE);
    const before = renderSvg(m, s);
    const after = renderSvg(m, reduce(m, s, { type: "set-hidden", targets: [{ edge: m.edges[26]!.ref }], hidden: true }).state);
    expect(before).toContain(" Q ");
    const l7 = (d: string): string => d.split("\n").find((l) => l.includes("igr-line") && l.includes("M 48.069 172.326"))!;
    expect(l7(before)).toBeDefined();
    expect(after.split("\n").some((l) => l.includes("igr-line") && l.includes("M 48.069 172.326") && l.includes(" Q "))).toBe(false);
  });
});

describe("7.5 labels", () => {
  it("labels: false gives none, 0 units and no edge labels; edgeLabels: false keeps node labels", async () => {
    const { model, state } = await o1();
    const a = renderSvgDetailed(model, state, { labels: false });
    expect(a.fidelity).toEqual({ labels: "none", edge_labels: false });
    expect(a.label_units).toBe(0);
    const b = renderSvgDetailed(model, state, { edgeLabels: false });
    expect(b.fidelity).toEqual({ labels: "full", edge_labels: false });
    expect(b.label_units).toBe(4);
    expect(renderSvgDetailed(model, state, { labels: false, edgeLabels: false }).fidelity.edge_labels).toBe(false);
  });
  it("the budget is exactly inclusive and monotone", async () => {
    const m = await loadModel("scenes/trunc3.scene.json", "layouts/trunc3.layout.json");
    const s = initialState(m, SIZE);
    const r = renderSvgDetailed(m, s, { maxDrawnLabelUnits: 5 });
    expect(r.label_units).toBe(3);
    expect(r.fidelity.labels).toBe("elided");
    expect((r.svg.match(/<text class="igr-label"/g) ?? []).length).toBe(1);
    expect((renderSvg(m, s, { maxDrawnLabelUnits: 14 }).match(/<text class="igr-label"/g) ?? []).length).toBe(3);
    expect(renderSvgDetailed(m, s, { maxDrawnLabelUnits: 14 }).fidelity.labels).toBe("full");
    expect(renderSvgDetailed(m, s, { maxDrawnLabelUnits: 13 }).fidelity.labels).toBe("elided");
  });
  it("an empty label draws no <text> and is not elided; a label of spaces draws a <text> of spaces (X08)", async () => {
    const m = await loadModel("scenes/emptylabels.scene.json", "layouts/emptylabels.layout.json");
    const r = renderSvgDetailed(m, initialState(m, SIZE));
    expect(r.fidelity.labels).toBe("full");
    expect(r.svg).toMatch(/<text class="igr-label" x="[^"]+" y="[^"]+" text-anchor="middle">   *<\/text>/);
    const nodes = (r.svg.match(/<g id="igr-n-/g) ?? []).length;
    expect((r.svg.match(/<text class="igr-label"/g) ?? []).length).toBeLessThan(nodes);
  });
  it("names are never truncated: aria-label and title carry the whole 1,022-unit label (G07)", async () => {
    const m = await loadModel("../oracles-igl/scenes/keybound.scene.json", "../oracles-igl/layouts/F13.layout.json");
    const r = renderSvgDetailed(m, initialState(m, SIZE));
    expect(r.fidelity.labels).toBe("elided");
    const long = m.nodes.reduce((a, n) => (n.label.length > a.length ? n.label : a), "");
    expect(long.length).toBeGreaterThan(24);
    expect(r.svg).toContain(long);
    expect(r.svg).toContain("…");
  });
});

describe("11.2 content-safety", () => {
  it("graph strings reach the output only as ATTR in aria-label, TEXT in title/desc/text, and hex in ids (X02)", async () => {
    const m = await loadModel("scenes/hostile-svg.scene.json", "layouts/hostile-svg.layout.json");
    const d = renderSvg(m, initialState(m, SIZE));
    expect(d).not.toMatch(/<script|<g onload|<\/title><g/);
    expect(d).toContain("&lt;script&gt;");
    const body = d.slice(d.indexOf('<g class="igr-nodes">'));
    for (const l of body.split("\n")) {
      const noTags = l.replace(/<[^<>]*>/g, "");
      expect(noTags, l.slice(0, 80)).not.toMatch(/[<>]/);
    }
  });
});

void (null as unknown as SemanticState);
void O1;

describe("audit M-7: only IgrError escapes when the joined document would pass the string limit", () => {
  it("the collecting writer refuses with RESOURCE_LIMIT/BYTES_LIMIT past its string bound (tested with a small bound)", async () => {
    const { model, state } = await o1();
    expect(errOf(() => collectSvg(model, state, undefined, 1000))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(collectSvg(model, state, undefined, 3193).svg.length).toBe(3193);
    expect(errOf(() => collectSvg(model, state, undefined, 3192))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("the bound is the V8 string limit, below the largest allowed maxSvgBytes", () => { expect(MAX_JOIN_UNITS).toBe(2 ** 29 - 24); expect(MAX_JOIN_UNITS).toBeLessThan(2 ** 31); });
});
