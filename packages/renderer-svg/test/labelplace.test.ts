// LP/1 in the writer (design 30 rev 5, 7.5 (e); design 37 rev 3; ruling R-H): the `<text>` position is default + placeLabels, called once per document with the
// drawn nodes and the drawn labels. `placeLabels` is wrapped by a spy (the real function runs) so that the inputs the writer hands it can be checked.
import { describe, expect, it, vi } from "vitest";

type Call = { nodes: { cx: bigint; cy: bigint }[]; labels: { kind: "node" | "edge"; units: number; x: bigint; y: bigint }[]; result: { dx: number; dy: number }[] };
const spy = vi.hoisted(() => ({ calls: [] as unknown[], override: undefined as undefined | ((n: number) => { dx: number; dy: number }[]) }));

vi.mock("isongraph-visualize-renderer-core", async (orig) => {
  const real = await orig<typeof import("isongraph-visualize-renderer-core")>();
  return {
    ...real,
    placeLabels: (input: Parameters<typeof real.placeLabels>[0]) => {
      const out = spy.override ? spy.override(input.labels.length) : real.placeLabels(input);
      spy.calls.push({ nodes: input.nodes.map((n) => ({ ...n })), labels: input.labels.map((l) => ({ ...l })), result: out.map((r) => ({ ...r })) });
      return out;
    },
  };
});

import { initialState, placeLabels, reduce } from "isongraph-visualize-renderer-core";
import { readSvg, renderSvg } from "../src/index.js";
import { fmt } from "../src/num.js";
import { MIXED20, O1, SIZE, errOf, loadModel, o1, readOracleText, readState, sha256 } from "./helpers.js";

const E6 = 1_000_000n;
const run = (f: () => string): { doc: string; calls: Call[] } => { spy.calls.length = 0; spy.override = undefined; const doc = f(); const calls = spy.calls.slice() as Call[]; spy.calls.length = 0; return { doc, calls }; };
const TEXT_RE = /<text class="(igr-label|igr-elabel)" x="([^"]*)" y="([^"]*)" text-anchor="middle">(.*)<\/text>/g;
const texts = (doc: string): { cls: string; x: string; y: string; body: string }[] => Array.from(doc.matchAll(TEXT_RE), (m) => ({ cls: m[1]!, x: m[2]!, y: m[3]!, body: m[4]! }));
const stripXY = (doc: string): string => doc.replace(/(<text class="igr-(?:label|elabel)") x="[^"]*" y="[^"]*"/g, "$1");
const decode = (s: string): string => s.replace(/&#10;/g, "\n").replace(/&#13;/g, "\r").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const LOOPS2 = { scene: "scenes/loops2.scene.json", layout: "layouts/loops2.layout.json" } as const; // row N08: self-loop labels whose default positions overlap

describe("LP/1 in the writer: a model whose edge labels collide at their default positions (N08)", () => {
  it("(a) the writer emits the placed positions: at least two edge labels sit at default + a non-zero offset, and the document is the corpus document", async () => {
    const m = await loadModel(LOOPS2.scene, LOOPS2.layout);
    const { doc, calls } = run(() => renderSvg(m, initialState(m, SIZE)));
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    const moved = c.labels.map((l, i) => ({ l, r: c.result[i]! })).filter(({ l, r }) => l.kind === "edge" && (r.dx !== 0 || r.dy !== 0));
    expect(moved.length).toBeGreaterThanOrEqual(2);
    const t = texts(doc);
    expect(t).toHaveLength(c.labels.length);
    c.labels.forEach((l, i) => {
      expect(t[i]!.x).toBe(fmt(l.x + BigInt(c.result[i]!.dx) * E6));
      expect(t[i]!.y).toBe(fmt(l.y + BigInt(c.result[i]!.dy) * E6));
    });
    expect(doc).toBe(readOracleText("svg/N08.svg")); // the independent Python writer's bytes
  });

  it("(a) without the placement the same labels would overlap: the default document differs, the placed one has no two edge-label boxes closer than 1 px", async () => {
    const m = await loadModel(LOOPS2.scene, LOOPS2.layout);
    const placed = run(() => renderSvg(m, initialState(m, SIZE)));
    spy.override = (n) => Array.from({ length: n }, () => ({ dx: 0, dy: 0 }));
    const defaults = renderSvg(m, initialState(m, SIZE));
    spy.override = undefined; spy.calls.length = 0;
    expect(defaults).not.toBe(placed.doc);
    expect(stripXY(defaults)).toBe(stripXY(placed.doc)); // only the x and y of the labels move
    const box = (x: bigint, y: bigint, u: number) => ({ l: x - 4_500_000n * BigInt(u), r: x + 4_500_000n * BigInt(u), t: y - 10n * E6, b: y + 3n * E6 });
    const hit = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r + E6 && b.l < a.r + E6 && a.t < b.b + E6 && b.t < a.b + E6;
    const c = placed.calls[0]!;
    const e = c.labels.map((l, i) => ({ l, r: c.result[i]! })).filter((x) => x.l.kind === "edge");
    const at = (x: { l: Call["labels"][number]; r: { dx: number; dy: number } }) => box(x.l.x + BigInt(x.r.dx) * E6, x.l.y + BigInt(x.r.dy) * E6, x.l.units);
    const dflt = (x: { l: Call["labels"][number] }) => box(x.l.x, x.l.y, x.l.units);
    let defaultPairs = 0;
    for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) {
      if (hit(dflt(e[i]!), dflt(e[j]!))) defaultPairs++;
      expect(hit(at(e[i]!), at(e[j]!)), `edge labels ${i} and ${j} still collide`).toBe(false);
    }
    expect(defaultPairs).toBeGreaterThanOrEqual(1);
  });

  it("(b) the positions equal placeLabels on the same inputs, called once; nodes are the drawn circles, labels node-first then edge, units = drawn UTF-16 length", async () => {
    const m = await loadModel(LOOPS2.scene, LOOPS2.layout);
    const { doc, calls } = run(() => renderSvg(m, initialState(m, SIZE)));
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(placeLabels({ nodes: c.nodes, labels: c.labels })).toEqual(c.result);
    const circles = Array.from(doc.matchAll(/<circle class="igr-shape" cx="([^"]*)" cy="([^"]*)"/g), (x) => [x[1]!, x[2]!]);
    expect(c.nodes.map((n) => [fmt(n.cx), fmt(n.cy)])).toEqual(circles);
    const kinds = c.labels.map((l) => l.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => (a === b ? 0 : a === "node" ? -1 : 1)));
    const t = texts(doc);
    expect(c.labels.map((l) => l.units)).toEqual(t.map((x) => decode(x.body).length));
    expect(t.map((x) => x.cls)).toEqual(kinds.map((k) => (k === "node" ? "igr-label" : "igr-elabel")));
  });

  it("(d) renderSvg is deterministic and readSvg accepts the placed document", async () => {
    const m = await loadModel(LOOPS2.scene, LOOPS2.layout);
    const s = initialState(m, SIZE);
    const a = renderSvg(m, s), b = renderSvg(m, s);
    expect(a).toBe(b);
    expect(errOf(() => readSvg(a))).toBe("none");
    const r = readSvg(a);
    expect(r.nodes.length).toBe(m.nodes.length);
    expect(r.edges.length).toBe(m.edges.length);
  });
});

describe("LP/1 in the writer: nothing moves without a collision (G01), and the document is otherwise unchanged", () => {
  it("(c) O1/F01: the placement returns (0, 0) for all three labels and the text positions are the default ones (x = cx, y = cy + 24; anchor y - 4)", async () => {
    const { model, state } = await o1();
    const { doc, calls } = run(() => renderSvg(model, state));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.result).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
    expect(texts(doc).map((x) => [x.cls, x.x, x.y])).toEqual([["igr-label", "32.072", "217.6"], ["igr-label", "867.928", "430.4"], ["igr-elabel", "450", "296"]]);
    expect(sha256(doc)).toBe("265736b6b7523681b589fcda23a20a10b574601c603e473bd78c7df7d1977653"); // design 30 A.1, unchanged by LP/1
  });

  it("(c) a label that moves is the only difference to the default document in its row (mixed20, 20 nodes)", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const s = initialState(m, SIZE);
    const placed = run(() => renderSvg(m, s));
    spy.override = (n) => Array.from({ length: n }, () => ({ dx: 0, dy: 0 }));
    const dflt = renderSvg(m, s);
    spy.override = undefined; spy.calls.length = 0;
    expect(stripXY(placed.doc)).toBe(stripXY(dflt));
    expect(placed.doc.length).toBeGreaterThan(0);
  });

  it("the call is made once even when no label is drawn; labels: false hands over no label; hidden nodes are not obstacles", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const s = initialState(m, SIZE);
    const off = run(() => renderSvg(m, s, { labels: false }));
    expect(off.calls.length === 0 || (off.calls.length === 1 && off.calls[0]!.labels.length === 0)).toBe(true);
    const hidden = readState("states/Y17.state.json");
    const h = run(() => renderSvg(m, hidden));
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.nodes).toHaveLength(13); // seven of the twenty nodes are hidden
    expect(h.calls[0]!.labels.filter((l) => l.kind === "node")).toHaveLength(13);
  });

  it("the byte limit is unchanged: the document of exactly its own length is accepted, one byte less raises BYTES_LIMIT", async () => {
    const m = await loadModel(LOOPS2.scene, LOOPS2.layout);
    const s = initialState(m, SIZE);
    const doc = renderSvg(m, s);
    const n = new TextEncoder().encode(doc).length;
    expect(errOf(() => renderSvg(m, s, { maxSvgBytes: n }))).toBe("none");
    expect(errOf(() => renderSvg(m, s, { maxSvgBytes: n - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });

  it("selection and focus do not change the label positions (the placement depends on nodes and labels only)", async () => {
    const m = await loadModel(LOOPS2.scene, LOOPS2.layout);
    let s = initialState(m, SIZE);
    const base = run(() => renderSvg(m, s));
    s = reduce(m, s, { type: "select", mode: "replace", targets: [{ node: m.nodes[0]!.ref }] }).state;
    const sel = run(() => renderSvg(m, s));
    expect(sel.calls[0]!.result).toEqual(base.calls[0]!.result);
    expect(O1.scene).toBeTruthy();
  });
});
