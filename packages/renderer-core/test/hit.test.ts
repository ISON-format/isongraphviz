// Hit testing (design section 7; Appendix A.4; vectors H*).
import { describe, expect, it } from "vitest";
import { compileScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel } from "../src/model.js";
import { hitTest, hitTestBruteForce } from "../src/hit.js";
import { reduce } from "../src/reduce.js";
import { initialState } from "../src/state.js";
import { quantizeMilli } from "../src/viewport.js";
import type { ElementAddress, RenderModel, SemanticState } from "../src/types.js";
import { enc, errOf, igl, o1Scene, o4Scene } from "./helpers.js";

const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };

/** A model for a scene with the given FIXED positions (layout units; thousandths are 1000 x). */
async function fixed(scene: Uint8Array, pos: Record<string, [number, number]>): Promise<RenderModel> {
  const { verifyScene } = await import("isongraph-visualize-scene-core");
  const sc = (await verifyScene(scene)).scene;
  const lay = await computeFixedLayout(scene, sc.nodes.map((n) => ({ ref: n.ref, x: pos[n.ref.id.replace(/^s:/, "")]![0], y: pos[n.ref.id.replace(/^s:/, "")]![1] })));
  return buildRenderModel(scene, lay.layoutBytes);
}
const src = (nodes: string[], edges: [string, string][]) => enc(`nodes.person\nid name\n${nodes.map((n) => `${n} N${n}`).join("\n")}\n\nedges.KNOWS\nsource target\n${edges.map(([a, b]) => `:person:${a} :person:${b}`).join("\n")}\n`);
const scene = async (nodes: string[], edges: [string, string][]) => (await compileScene(src(nodes, edges), "ison-v1")).sceneBytes;
/** State with the viewport centred on layout point (cx, cy) in layout units, zoom 1000 (1 px per unit), 900x600. */
const view = (m: RenderModel, cx: number, cy: number, zoom = 1000, w = 900, h = 600): SemanticState => ({ ...initialState(m, { width: w, height: h }), viewport: { center_x: cx * 1000, center_y: cy * 1000, width: w, height: h, zoom } });
const hit = (m: RenderModel, s: SemanticState, x: number, y: number): ElementAddress | undefined => hitTest(m, s, { x, y });
const addr = (a: ElementAddress | undefined): string => (a === undefined ? "none" : "node" in a ? "n:" + a.node.id : `e:${a.edge.src.id}>${a.edge.tgt.id}`);

describe("Appendix A.4 hit testing in the A.2 viewport", () => {
  it("(32.0, 193.5) hits node i:1 ; (500, 308) hits the KNOWS edge ; (500, 300) misses", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const s = initialState(m, { width: 900, height: 600 });
    expect(hit(m, s, 32.0, 193.5)).toEqual({ node: I1 });
    const e = hit(m, s, 500, 308);
    expect(e && "edge" in e && e.edge.rel).toBe("KNOWS");
    expect(hit(m, s, 500, 300)).toBeUndefined();
    expect(hit(m, s, 867.928, 406.4)).toEqual({ node: ANN });
  });
  it("returns fresh address objects, never the model's frozen refs", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const r = hit(m, initialState(m, { width: 900, height: 600 }), 32, 193.5) as { node: object };
    expect(r.node).not.toBe(m.nodes[0]!.ref);
    expect(Object.isFrozen(r.node)).toBe(false);
  });
});

describe("node geometry on a fixed layout", () => {
  const two = async () => fixed(await scene(["a", "b"], [["a", "b"]]), { a: [0, 0], b: [20, 0] });
  it("H01 the centre hits; H02/H03/H04/H05 the closed 12 px boundary and the quantizer (q applied once, then x 1000)", async () => {
    const m = await fixed(await scene(["a"], []), { a: [0, 0] });
    const s = view(m, 0, 0); // node at screen (450, 300)
    expect(addr(hit(m, s, 450, 300))).toBe("n:s:a");
    expect(addr(hit(m, s, 462, 300))).toBe("n:s:a"); // H02 exactly 12 px
    expect(addr(hit(m, s, 462 + 2 ** -11, 300))).toBe("n:s:a"); // H03 q = 12000
    expect(addr(hit(m, s, 462 + 2 ** -10, 300))).toBe("none"); // H04 q = 12001
    expect(addr(hit(m, s, 438 - 2 ** -11, 300))).toBe("n:s:a"); // H05 left: 437.99951171875 -> 438000
    expect(addr(hit(m, s, 438 - 2 ** -10, 300))).toBe("none");
    expect(addr(hit(m, s, 450, 312))).toBe("n:s:a");
    expect(addr(hit(m, s, 450, 300 - 12 - 2 ** -10))).toBe("none");
    // a diagonal exactly on the circle: 3-4-5 triangle scaled by 2.4 = (7.2, 9.6) is NOT exact in binary; use (12, 0) and (0, -12) only
    expect(addr(hit(m, s, 450, 288))).toBe("n:s:a");
  });
  it("H06 the nearest of two nodes wins; H07 an exact tie goes to the lowest index", async () => {
    const m = await two();
    const s = view(m, 10, 0); // a at (440, 300), b at (460, 300)
    expect(addr(hit(m, s, 452, 300))).toBe("n:s:b");
    expect(addr(hit(m, s, 448, 300))).toBe("n:s:a");
    expect(addr(hit(m, s, 450, 300))).toBe("n:s:a"); // equal distance, lowest index
    expect(m.nodes[0]!.ref.id).toBe("s:a");
  });
  it("H08 a node beats an edge", async () => {
    const m = await two();
    const s = view(m, 10, 0);
    expect(addr(hit(m, s, 443, 303))).toBe("n:s:a");
  });
  it("H13 a hidden node cannot be hit; H14 an edge with a hidden endpoint cannot be hit", async () => {
    const m = await two();
    const s = view(m, 10, 0);
    const hidden = reduce(m, s, { type: "set-hidden", targets: [{ node: m.nodes[0]!.ref }], hidden: true }).state;
    expect(addr(hit(m, hidden, 440, 300))).toBe("none");
    expect(addr(hit(m, hidden, 450, 303))).toBe("n:s:b"); // within b's radius
    const wide = await fixed(await scene(["a", "b"], [["a", "b"]]), { a: [-100, 0], b: [100, 0] });
    const ws = view(wide, 0, 0); // a at (350, 300), b at (550, 300)
    expect(addr(hit(wide, ws, 450, 300))).toBe("e:s:a>s:b");
    const hidden2 = reduce(wide, ws, { type: "set-hidden", targets: [{ node: wide.nodes[1]!.ref }], hidden: true }).state;
    expect(addr(hit(wide, hidden2, 350, 303))).toBe("n:s:a");
    expect(addr(hit(wide, hidden2, 450, 300))).toBe("none"); // the edge a-b is effectively hidden
    expect(addr(hit(wide, hidden2, 550, 300))).toBe("none");
  });
});

describe("edge geometry (H09-H12, H25)", () => {
  it("H09 a long edge is hit although both endpoints are far away (pruning by endpoint offsets would miss it)", async () => {
    const m = await fixed(await scene(["a", "b"], [["a", "b"]]), { a: [-1000, 0], b: [1000, 0] });
    const s = view(m, 0, 0); // a at -550 px, b at 1450 px: both more than 380 px from (450, 303)
    expect(addr(hit(m, s, 450, 303))).toBe("e:s:a>s:b");
    expect(addr(hit(m, s, 450, 307))).toBe("none");
  });
  it("H10/H25 exactly 6 px from a horizontal edge hits; 6 + 2^-11 hits (q = 6000); 6 + 2^-10 misses (q = 6001)", async () => {
    const m = await fixed(await scene(["a", "b"], [["a", "b"]]), { a: [-1000, 0], b: [1000, 0] });
    const s = view(m, 0, 0);
    expect(addr(hit(m, s, 450, 306))).toBe("e:s:a>s:b");
    expect(addr(hit(m, s, 450, 306 + 2 ** -11))).toBe("e:s:a>s:b");
    expect(addr(hit(m, s, 450, 306 + 2 ** -10))).toBe("none");
    expect(addr(hit(m, s, 450, 294))).toBe("e:s:a>s:b");
    expect(addr(hit(m, s, 450, 294 - 2 ** -10))).toBe("none");
  });
  it("H11 beyond a segment end there is no edge hit (rev 3): 4 and 7 px beyond the node wins, 13 px beyond nothing", async () => {
    const m = await fixed(await scene(["a", "b"], [["a", "b"]]), { a: [0, 0], b: [100, 0] });
    const s = view(m, 50, 0); // a at (400,300), b at (500,300)
    expect(addr(hit(m, s, 390, 300))).toBe("n:s:a");
    expect(addr(hit(m, s, 396, 300))).toBe("n:s:a"); // 4 px beyond
    expect(addr(hit(m, s, 393, 300))).toBe("n:s:a"); // 7 px beyond
    expect(addr(hit(m, s, 387, 300))).toBe("none"); // 13 px beyond the end
    expect(addr(hit(m, s, 450, 300))).toBe("e:s:a>s:b");
  });
  it("H12 two edges at an exact rational tie go to the lowest edge index", async () => {
    const m = await fixed(await scene(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]]), { a: [-1000, 0], b: [1000, 0], c: [-1000, 10], d: [1000, 10] });
    const s = view(m, 0, 0);
    const r = hit(m, s, 450, 305)!;
    expect("edge" in r && r.edge).toEqual(m.edges[0]!.ref);
  });
  it("H12b the smaller exact distance wins, compared as fractions (non-integral squared distances)", async () => {
    // two non-parallel edges crossing near the pointer; any float shortcut would mis-order near-equal fractions
    const m = await fixed(await scene(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]]), { a: [-1000, 0], b: [1000, 7], c: [-1000, 9], d: [1000, 3] });
    const s = view(m, 0, 0);
    for (let y = 296; y <= 312; y += 0.25) expect(addr(hitTest(m, s, { x: 450, y }))).toBe(addr(hitTestBruteForce(m, s, { x: 450, y })));
  });
  it("H15 a self-loop and H16 coincident endpoints are not pointer-hittable", async () => {
    const o4 = await buildRenderModel(o4Scene(), igl("layouts/F02.layout.json"));
    const s = initialState(o4, { width: 900, height: 600 });
    for (let x = 0; x <= 900; x += 7) for (let y = 0; y <= 600; y += 7) {
      const r = hit(o4, s, x, y);
      if (r && "edge" in r) expect(r.edge.src).not.toEqual(r.edge.tgt);
    }
    const m = await fixed(await scene(["a", "b"], [["a", "b"]]), { a: [0, 0], b: [0, 0] });
    const s2 = view(m, 0, 0);
    for (let d = 0; d <= 40; d += 1) { const r = hit(m, s2, 450 + d, 300 + (d % 3)); expect(r === undefined || "node" in r).toBe(true); }
  });
  it("H20 an undirected scene hits edges the same way", async () => {
    const m = await buildRenderModel(o4Scene(), igl("layouts/F02.layout.json"));
    expect(m.directed).toBe(false);
    const s = initialState(m, { width: 900, height: 600 });
    let edges = 0;
    for (let x = 0; x <= 900; x += 3) for (let y = 0; y <= 600; y += 3) { const r = hit(m, s, x, y); if (r && "edge" in r) edges++; }
    expect(edges).toBeGreaterThan(0);
  });
});

describe("viewport rectangle (H17) and input domain (H18)", () => {
  it("H17 outside the closed rectangle has no hit; exactly on the border still hits", async () => {
    const m = await fixed(await scene(["a"], []), { a: [0, 0] });
    const left = view(m, 450, 0); // node at screen x = 0
    expect(addr(hit(m, left, 0, 300))).toBe("n:s:a");
    expect(addr(hit(m, left, -0.5, 300))).toBe("none"); // within 12 px of the node but outside the viewport
    expect(addr(hit(m, left, 0, 300))).toBe("n:s:a");
    const right = view(m, -450, 0); // node at x = 900
    expect(addr(hit(m, right, 900, 300))).toBe("n:s:a");
    expect(addr(hit(m, right, 900.5, 300))).toBe("none");
    const top = view(m, 0, 300); expect(addr(hit(m, top, 450, 0))).toBe("n:s:a"); expect(addr(hit(m, top, 450, -1))).toBe("none");
    const bottom = view(m, 0, -300); expect(addr(hit(m, bottom, 450, 600))).toBe("n:s:a"); expect(addr(hit(m, bottom, 450, 601))).toBe("none");
  });
  it("H26 the border is tested on the QUANTIZED point: -2^-11 px (q = 0) is inside, -2^-10 px (q = -1) is outside; likewise w + 2^-11 inside and w + 2^-10 outside", async () => {
    const m = await fixed(await scene(["a"], []), { a: [0, 0] });
    const left = view(m, 450, 0); // node on the left border: screen (0, 300)
    expect(addr(hit(m, left, -(2 ** -11), 300))).toBe("n:s:a");
    expect(addr(hit(m, left, -(2 ** -10), 300))).toBe("none");
    const right = view(m, -450, 0); // node at x = 900
    expect(addr(hit(m, right, 900 + 2 ** -11, 300))).toBe("n:s:a");
    expect(addr(hit(m, right, 900 + 2 ** -10, 300))).toBe("none");
    const top = view(m, 0, 300), bottom = view(m, 0, -300);
    expect(addr(hit(m, top, 450, -(2 ** -11)))).toBe("n:s:a"); expect(addr(hit(m, top, 450, -(2 ** -10)))).toBe("none");
    expect(addr(hit(m, bottom, 450, 600 + 2 ** -11))).toBe("n:s:a"); expect(addr(hit(m, bottom, 450, 600 + 2 ** -10))).toBe("none");
    expect(hitTestBruteForce(m, left, { x: -(2 ** -10), y: 300 })).toBeUndefined();
  });
  it("H18 NaN, Infinity, 2^40 and non-numbers are INVALID_INPUT", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const s = initialState(m, { width: 900, height: 600 });
    expect(errOf(() => hitTest(m, s, { x: NaN, y: 0 }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(errOf(() => hitTest(m, s, { x: 0, y: -Infinity }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(errOf(() => hitTest(m, s, { x: 2 ** 40, y: 0 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => hitTest(m, s, { x: 0, y: 2 ** 31 + 1 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => hitTest(m, s, { x: "1" as never, y: 0 }))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => hitTest(m, s, null as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => hitTest(m, s, { x: 2 ** 31, y: 0 }))).toBe("no error");
    expect(errOf(() => hitTest({} as never, s, { x: 0, y: 0 }))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    let reads = 0;
    expect(errOf(() => hitTest(m, s, { get x() { reads++; return 32; }, y: 193.5 }))).toBe("no error");
    expect(reads).toBe(1);
  });
});

describe("zoom independence and exactness (H19, H21, H23)", () => {
  it("H19 the radius is 12 CSS px at zoom min, default and max", async () => {
    const m = await fixed(await scene(["a"], []), { a: [0, 0] });
    for (const z of [10, 1000, 100000]) {
      const s = view(m, 0, 0, z);
      expect(addr(hit(m, s, 462, 300)), String(z)).toBe("n:s:a");
      expect(addr(hit(m, s, 462 + 2 ** -10, 300)), String(z)).toBe("none");
    }
  });
  it("H21 after a pan the hit moves with the content", async () => {
    const m = await fixed(await scene(["a"], []), { a: [0, 0] });
    const s = view(m, 0, 0);
    const p = reduce(m, s, { type: "pan", dx: 100, dy: 0 }).state;
    expect(addr(hit(m, p, 550, 300))).toBe("n:s:a");
    expect(addr(hit(m, p, 450, 300))).toBe("none");
  });
  it("H23 extreme coordinates and zoom use exact integers (no float drift at 2^53 scale)", async () => {
    const m = await buildRenderModel(o1Scene(), igl("verify/V45.layout.json"));
    const big = m.nodes.find((n) => Math.abs(n.x) > 2 ** 52 || Math.abs(n.y) > 2 ** 52)!;
    const s: SemanticState = { ...initialState(m, { width: 900, height: 600 }), viewport: { center_x: big.x, center_y: big.y, width: 900, height: 600, zoom: 100000 } };
    expect(addr(hit(m, s, 450, 300))).toBe("n:" + big.ref.id);
    expect(addr(hit(m, s, 462, 300))).toBe("n:" + big.ref.id);
    expect(addr(hit(m, s, 462 + 2 ** -10, 300))).toBe("none");
  });
  it("H22 a unicode scene", async () => {
    const m = await buildRenderModel(igl("scenes/unicode.scene.json"), igl("layouts/F09.layout.json"));
    const s = initialState(m, { width: 900, height: 600 });
    const n = m.nodes[0]!;
    const X = (n.x - s.viewport.center_x) * s.viewport.zoom / 1e6 + 450, Y = (n.y - s.viewport.center_y) * s.viewport.zoom / 1e6 + 300;
    expect(hit(m, s, X, Y)).toBeDefined();
  });
});

describe("H24 pruning equals brute force", () => {
  // an independent exact implementation with plain BigInt rationals, written differently from src/hit.ts
  const reference = (m: RenderModel, s: SemanticState, x: number, y: number): string => {
    const z = BigInt(s.viewport.zoom);
    const P = [BigInt(quantizeMilli(x)) * 1000n, BigInt(quantizeMilli(y)) * 1000n] as const;
    const W = BigInt(s.viewport.width) * 1_000_000n, H = BigInt(s.viewport.height) * 1_000_000n;
    if (P[0] < 0n || P[1] < 0n || P[0] > W || P[1] > H) return "none";
    const pos = m.nodes.map((n) => [(BigInt(n.x) - BigInt(s.viewport.center_x)) * z + BigInt(s.viewport.width) * 500_000n, (BigInt(n.y) - BigInt(s.viewport.center_y)) * z + BigInt(s.viewport.height) * 500_000n] as const);
    const hidN = new Set(s.hidden.nodes.map((r) => r.id)), hidE = new Set(s.hidden.edges.map((e) => JSON.stringify(e)));
    const visN = m.nodes.map((n) => !hidN.has(n.ref.id));
    let best: { d: bigint; i: number } | undefined;
    m.nodes.forEach((_, i) => {
      if (!visN[i]) return;
      const dx = pos[i]![0] - P[0], dy = pos[i]![1] - P[1];
      const d = dx * dx + dy * dy;
      if (d <= 144_000_000_000_000n && (!best || d < best.d)) best = { d, i };
    });
    if (best) return "n:" + m.nodes[best.i]!.ref.id;
    let be: { num: bigint; den: bigint; j: number } | undefined;
    m.edges.forEach((e, j) => {
      if (!visN[e.src] || !visN[e.tgt] || hidE.has(JSON.stringify(e.ref))) return;
      const A = pos[e.src]!, B = pos[e.tgt]!;
      if (A[0] === B[0] && A[1] === B[1]) return;
      const Dx = B[0] - A[0], Dy = B[1] - A[1], L2 = Dx * Dx + Dy * Dy;
      const tn = (P[0] - A[0]) * Dx + (P[1] - A[1]) * Dy;
      if (tn <= 0n || tn >= L2) return; // rev 3: a candidate edge requires 0 < tn < L2 (no endpoint branch)
      const cross = (P[0] - A[0]) * Dy - (P[1] - A[1]) * Dx;
      const num = cross * cross, den = L2;
      if (num > 36_000_000_000_000n * den) return;
      if (!be || num * be.den < be.num * den) be = { num, den, j };
    });
    if (be) { const r = m.edges[be.j]!.ref; return `e:${r.src.id}>${r.tgt.id}:${r.ord}`; }
    return "none";
  };
  const show = (a: ElementAddress | undefined) => (a === undefined ? "none" : "node" in a ? "n:" + a.node.id : `e:${a.edge.src.id}>${a.edge.tgt.id}:${a.edge.ord}`);
  for (const [name, sceneBytes, layoutBytes] of [["F04 mixed20", igl("scenes/mixed20.scene.json"), igl("layouts/F04.layout.json")], ["F09 unicode", igl("scenes/unicode.scene.json"), igl("layouts/F09.layout.json")], ["F02 undirected", o4Scene(), igl("layouts/F02.layout.json")]] as const) {
    it(`lattice over ${name}: pruned = brute force = independent reference, at several zooms and with hidden elements`, async () => {
      const m = await buildRenderModel(sceneBytes, layoutBytes);
      let s = initialState(m, { width: 900, height: 600 });
      const variants: SemanticState[] = [s];
      variants.push(reduce(m, s, { type: "zoom", factor_milli: 3000, anchor: { x: 300, y: 200 } }).state);
      variants.push(reduce(m, s, { type: "zoom", factor_milli: 200 }).state);
      if (m.nodes.length > 2) variants.push(reduce(m, s, { type: "set-hidden", targets: [{ node: m.nodes[1]!.ref }], hidden: true }).state);
      if (m.edges.length > 0) variants.push(reduce(m, s, { type: "set-hidden", targets: [{ edge: m.edges[0]!.ref }], hidden: true }).state);
      let hits = 0;
      for (const v of variants) for (let x = -2; x <= 902; x += 11.5) for (let y = -2; y <= 602; y += 9.25) {
        const a = show(hitTest(m, v, { x, y })), b = show(hitTestBruteForce(m, v, { x, y })), c = reference(m, v, x, y);
        if (a !== b || a !== c) throw new Error(`${name} (${x}, ${y}): pruned ${a} brute ${b} reference ${c}`);
        if (a !== "none") hits++;
      }
      expect(hits).toBeGreaterThan(0);
      s = variants[0]!;
    });
  }
});
