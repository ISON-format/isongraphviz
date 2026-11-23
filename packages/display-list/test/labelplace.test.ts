// Design 37 (LP/1) wired into design 31 4.1/4.4(g): the T records are written at the placed positions. The expectation is computed here from the
// default positions (design 4.4(g): node (cx, cy + 24 px), edge (ax, ay - 4 px)) and `placeLabels` itself, never from the builder's own T records.
import { describe, expect, it } from "vitest";
import { effectiveVisibility, placeLabels, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, parseDisplayList, serializeDisplayList, type DlOptions } from "../src/index.js";
import { degenerate, distance, isDegenerate, straight } from "../src/geometry.js";
import { divRound, screenMicro } from "../src/num.js";
import { LABEL_DY, ELABEL_DY } from "../src/constants.js";
import { MIXED20, O1, initial, loadModel, readState } from "./helpers.js";

const E6 = 1_000_000n;
const m = (v: bigint): number => Number(divRound(v, 1000n));

interface Def { kind: "node" | "edge"; text: string; x: bigint; y: bigint }

/** The default (unplaced) label positions in the order of the label pass, for graphs whose drawn edges are straight or degenerate (no loop, no parallel pair). */
function defaults(model: RenderModel, state: SemanticState, options: DlOptions | undefined): { nodes: { cx: bigint; cy: bigint }[]; labels: Def[] } {
  const list = buildDisplayList(model, state, options);
  const vis = effectiveVisibility(model, state);
  const pos = model.nodes.map((n) => screenMicro(state.viewport, n.x, n.y));
  const nodes = model.nodes.filter((n) => vis.nodes[n.index]).map((n) => ({ cx: pos[n.index]!.x, cy: pos[n.index]!.y }));
  const texts = list.records.filter((r) => r[0] === "T");
  const labels: Def[] = [];
  const nodeOrder = model.nodes.filter((n) => vis.nodes[n.index]);
  const edgeOrder = model.edges.filter((e) => vis.edges[e.index]);
  for (const t of texts) {
    if (t[2] === 0) {
      const n = nodeOrder[(t[1] as number) - 1]!;
      labels.push({ kind: "node", text: t[5] as string, x: pos[n.index]!.x, y: pos[n.index]!.y + BigInt(LABEL_DY) * E6 });
    } else {
      const e = edgeOrder[(t[1] as number) - nodeOrder.length - 1]!;
      expect(e.src).not.toBe(e.tgt);
      const A = pos[e.src]!, B = pos[e.tgt]!;
      const g = isDegenerate(distance(A, B)) ? degenerate(A, B) : straight(A, B);
      labels.push({ kind: "edge", text: t[5] as string, x: g.ax, y: g.ay - BigInt(ELABEL_DY) * E6 });
    }
  }
  return { nodes, labels };
}

/** The T records the placement rule demands, as `[x, y]` milli-pixels in record order. */
function expected(model: RenderModel, state: SemanticState, options?: DlOptions): { want: [number, number][]; moved: number } {
  const d = defaults(model, state, options);
  const off = placeLabels({ nodes: d.nodes, labels: d.labels.map((l) => ({ kind: l.kind, units: l.text.length, x: l.x, y: l.y })) });
  expect(off.length).toBe(d.labels.length);
  let moved = 0;
  const want = d.labels.map((l, i): [number, number] => {
    if (off[i]!.dx !== 0 || off[i]!.dy !== 0) moved++;
    return [m(l.x + BigInt(off[i]!.dx) * E6), m(l.y + BigInt(off[i]!.dy) * E6)];
  });
  return { want, moved };
}
const tPositions = (model: RenderModel, state: SemanticState, options?: DlOptions): [number, number][] =>
  buildDisplayList(model, state, options).records.filter((r) => r[0] === "T").map((r) => [r[3] as number, r[4] as number]);
const defaultOnly = (model: RenderModel, state: SemanticState, options?: DlOptions): [number, number][] =>
  defaults(model, state, options).labels.map((l): [number, number] => [m(l.x), m(l.y)]);

describe("LP/1 in the display list (design 37, 31 4.4(g))", () => {
  it("(a) colliding default node labels: the T records sit at the positions placeLabels returns for the same inputs", async () => {
    const { model, state } = await initial(MIXED20, { width: 120, height: 90 });
    const opts = { edgeLabels: false };
    const e = expected(model, state, opts);
    expect(e.moved).toBeGreaterThan(5); // the layout crowds at this size
    expect(tPositions(model, state, opts)).toEqual(e.want);
    expect(tPositions(model, state, opts)).not.toEqual(defaultOnly(model, state, opts));
  });
  it("(a) edge labels take part: node labels first, then edge labels, in one call; edge default is (ax, ay - 4 px)", async () => {
    const { model, state } = await initial(O1, { width: 24, height: 24 });
    const e = expected(model, state);
    const got = tPositions(model, state);
    expect(got).toEqual(e.want);
    const kinds = buildDisplayList(model, state).records.filter((r) => r[0] === "T").map((r) => r[2]);
    expect(kinds).toEqual([0, 0, 1]);
    expect(e.moved).toBeGreaterThan(0);
  });
  it("(a) the placement uses the drawn nodes only: a hidden node is not an obstacle", async () => {
    const { model, state } = await initial(MIXED20, { width: 120, height: 90 });
    const hidden = JSON.parse(JSON.stringify(state)) as SemanticState;
    hidden.hidden.nodes = [model.nodes[3]!.ref, model.nodes[7]!.ref, model.nodes[11]!.ref];
    const e = expected(model, hidden, { edgeLabels: false });
    expect(e.moved).toBeGreaterThan(0);
    expect(tPositions(model, hidden, { edgeLabels: false })).toEqual(e.want);
    expect(tPositions(model, hidden, { edgeLabels: false }).length).toBe(model.nodes.length - 3);
  });
  it("(b) no collision: the positions are the old defaults", async () => {
    for (const fx of [O1, MIXED20]) {
      const { model, state } = await initial(fx);
      const e = expected(model, state);
      if (fx === O1) expect(e.moved).toBe(0);
      if (e.moved === 0) expect(tPositions(model, state)).toEqual(defaultOnly(model, state));
    }
    const { model, state } = await initial(O1);
    const t = buildDisplayList(model, state).records.filter((r) => r[0] === "T");
    const n = buildDisplayList(model, state).records.filter((r) => r[0] === "N");
    expect(t.length).toBeGreaterThan(0);
    expect(t[0]).toEqual(["T", 1, 0, n[0]![4], (n[0]![5] as number) + 24000, t[0]![5]]);
  });
  it("(b) labels:false emits no T and needs no placement", async () => {
    const { model, state } = await initial(MIXED20, { width: 400, height: 300 });
    expect(buildDisplayList(model, state, { labels: false }).records.some((r) => r[0] === "T")).toBe(false);
  });
  it("(c) deterministic: the same inputs give the same bytes, repeatedly and after other builds", async () => {
    const { model, state } = await initial(MIXED20, { width: 400, height: 300 });
    const a = serializeDisplayList(buildDisplayList(model, state));
    buildDisplayList(model, state, { edgeLabels: false });
    const b = serializeDisplayList(buildDisplayList(model, state));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
  it("(d) the strict reader accepts the placed lists and they re-serialize to themselves", async () => {
    for (const size of [{ width: 400, height: 300 }, { width: 120, height: 90 }, { width: 900, height: 600 }]) {
      const { model, state } = await initial(MIXED20, size);
      const bytes = serializeDisplayList(buildDisplayList(model, state));
      const again = serializeDisplayList(parseDisplayList(bytes));
      expect(Buffer.from(again).equals(Buffer.from(bytes))).toBe(true);
    }
  });
  it("(e) the offset is added to the micro-pixel default before the milli rounding: a fractional case where rounding first changes the result", async () => {
    const model = await loadModel("scenes/lpfrac.scene.json", "layouts/lpfrac.layout.json");
    const state = readState("states/G12.state.json");
    const e = expected(model, state);
    expect(e.moved).toBe(1); // the second label collides in micro-pixels (9.99999 px apart) and is moved by candidate 2
    expect(tPositions(model, state)).toEqual(e.want);
    // the same placement run on the milli-rounded defaults sees 10 px, no collision, and moves nothing: the lists differ
    const d = defaults(model, state, undefined);
    const rounded = placeLabels({ nodes: d.nodes.map((n) => ({ cx: BigInt(m(n.cx)) * 1000n, cy: BigInt(m(n.cy)) * 1000n })), labels: d.labels.map((l) => ({ kind: l.kind, units: l.text.length, x: BigInt(m(l.x)) * 1000n, y: BigInt(m(l.y)) * 1000n })) });
    expect(rounded.every((r) => r.dx === 0 && r.dy === 0)).toBe(true);
    expect(tPositions(model, state)).not.toEqual(defaultOnly(model, state));
  });
});
