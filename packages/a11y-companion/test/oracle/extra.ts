// Behaviour checks of a11y-companion beyond the oracle rows (audit 32-code-audit-b.md I-2, I-3, I-4, M-2, M-8, M-9, M-13, M-15, M-17), written as plain
// functions with no vitest import so that the SAME checks run in the unit suite (test/extra.test.ts) and against the scratch copies of the mutation harness
// (scripts/mutate.mjs: the `ext:` mutants of scripts/ext-mutants.mjs are killed by these checks, reported as ids U-*). `lib` is the module namespace of
// src/index.ts, `int` the internal modules (util, tree, live, executor) and `mountCompanion` of src/dom/index.ts, imported by path.
import { buildRenderModel, initialState, layoutToScreen, reduce, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { verifyScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import type { Corpus } from "./runner.js";

export interface Check { id: string; run(): Promise<void> }
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const fail = (m: string): never => { throw new Error(m); };
const eq = (a: unknown, b: unknown, what: string): void => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
function rejects(f: () => unknown, code: string, reason: string, what: string): void {
  try { f(); } catch (e) { const k = `${(e as Any).code}/${(e as Any).reason}`; if (k !== `${code}/${reason}`) fail(`${what}: expected ${code}/${reason}, got ${k}`); return; }
  fail(`${what}: expected ${code}/${reason}, got no error`);
}

// ---- a strict fake DOM: the structural members only; removeChild / insertBefore of a non-child throw like a real DOM (NotFoundError) ----
class Doc { activeElement: El | null = null; failNext: string | undefined; createElement(tag: string): El { if (tag !== "div") throw new Error("only div"); return new El(this); } }
class El {
  id = ""; attrs = new Map<string, string>(); children: El[] = []; parentNode: El | null = null; text = "";
  constructor(readonly ownerDocument: Doc) {}
  private trip(op: string): void { if (this.ownerDocument.failNext === op) { this.ownerDocument.failNext = undefined; throw new Error(`injected ${op} failure`); } }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); if (n === "id") this.id = v; }
  set textContent(t: string) { this.text = t; }
  insertBefore(c: El, b: El | null): void {
    this.trip("insertBefore");
    if (b !== null && b.parentNode !== this) throw new Error("NotFoundError: before is not a child");
    if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c);
    c.parentNode = this;
    if (b === null) this.children.push(c); else this.children.splice(this.children.indexOf(b), 0, c);
  }
  removeChild(c: El): void { this.trip("removeChild"); if (c.parentNode !== this) throw new Error("NotFoundError: not a child"); this.children = this.children.filter((x) => x !== c); c.parentNode = null; }
  contains(o: El | null): boolean { for (let e = o; e; e = e.parentNode) if (e === this) return true; return false; }
  focus(): void { this.ownerDocument.activeElement = this; }
  find(id: string): El | undefined { if (this.id === id) return this; for (const c of this.children) { const r = c.find(id); if (r) return r; } return undefined; }
  snap(): unknown { return { a: [...this.attrs].sort(), t: this.text, c: this.children.map((x) => x.snap()) }; }
}

export function companionChecks(lib: Any, int: Any, c: Corpus): Check[] {
  const load = (s: string, l: string): Promise<RenderModel> => buildRenderModel(c.read(s), c.read(l));
  const g9 = (): Promise<RenderModel> => load("scenes/G9.scene.json", "layouts/G9.layout.json");
  const checks: Check[] = [];
  const add = (id: string, run: () => Promise<void>): void => { checks.push({ id, run }); };
  const hide = (m: RenderModel, s: SemanticState, id: string): SemanticState => reduce(m, s, { type: "set-hidden", targets: [{ node: { id, type: "p" } }], hidden: true }).state;

  // ---- I-2: mountCompanion recovers from a DOM exception: a FULL rebuild of the next tree, never a half-applied DOM ----
  const freshSnapshot = (m: RenderModel, s: SemanticState): unknown => { const d = new Doc(), h = new El(d); int.mountCompanion(h).update(m, s); return h.snap(); };
  add("U-MOUNT-throw-mid-plan", async () => {
    const m = await g9(), s0 = initialState(m, { width: 900, height: 600 }), s1 = hide(m, s0, "s:e");
    const d = new Doc(), h = new El(d), errs: unknown[] = [];
    const mc = int.mountCompanion(h, { onError: (e: unknown) => errs.push(e) });
    mc.update(m, s0);
    d.failNext = "removeChild";
    mc.update(m, s1);
    eq(errs.length, 1, "the DOM exception is reported once");
    eq(h.snap(), freshSnapshot(m, s1), "the host holds a full build of the next tree, not a half-applied plan");
    const s2 = hide(m, s1, "s:h");
    mc.update(m, s2);
    eq(errs.length, 1, "the next update works");
    eq(h.snap(), freshSnapshot(m, s2), "and equals a fresh build");
    eq(h.children.length, 1, "one root child only");
  });
  add("U-MOUNT-external-mutation", async () => {
    const m = await g9(), s0 = initialState(m, { width: 900, height: 600 }), s1 = hide(m, s0, "s:e"), s2 = hide(m, s1, "s:h");
    const d = new Doc(), h = new El(d), errs: unknown[] = [];
    const mc = int.mountCompanion(h, { onError: (e: unknown) => errs.push(e) });
    mc.update(m, s0);
    const list = h.find("igc-list")!;
    const victim = list.children.find((x: El) => x.attrs.get("aria-posinset") === "5")!; // the item of e, removed from under the companion by the page
    list.removeChild(victim);
    mc.update(m, s1);
    eq(errs.length > 0, true, "the failure is reported");
    eq(h.snap(), freshSnapshot(m, s1), "the next tree is a full build");
    mc.update(m, s2);
    eq(h.snap(), freshSnapshot(m, s2), "later updates follow");
    // the whole root removed by the page
    h.removeChild(h.children[0]!);
    mc.update(m, s0);
    eq(h.snap(), freshSnapshot(m, s0), "a removed root is rebuilt");
  });
  add("U-MOUNT-itemAddress-copy", async () => {
    const m = await g9(), d = new Doc(), h = new El(d), mc = int.mountCompanion(h);
    mc.update(m, initialState(m, { width: 900, height: 600 }));
    const el = h.find("igc-list")!.children[0]!;
    const a = mc.itemAddress(el);
    a.node.id = "tampered";
    eq(mc.itemAddress(el), { node: { id: "s:a", type: "p" } }, "itemAddress returns a copy");
  });

  // ---- I-3: the gate's exact screen position (3.4, G12) against an independent bigint reference, with the boundary cases ----
  const ref = (vp: Any, x: number, y: number): { X: bigint; Y: bigint } => ({ X: (BigInt(x) - BigInt(vp.center_x)) * BigInt(vp.zoom) + BigInt(vp.width) * 500000n, Y: (BigInt(y) - BigInt(vp.center_y)) * BigInt(vp.zoom) + BigInt(vp.height) * 500000n });
  const floorDiv = (a: bigint, b: bigint): bigint => { let q = a / b; if (a % b !== 0n && a < 0n) q -= 1n; return q; };
  const offscreen = (X: bigint, Y: bigint, vp: Any): boolean => X < 0n || X > BigInt(vp.width) * 1000000n || Y < 0n || Y > BigInt(vp.height) * 1000000n;
  const gateOff = (m: RenderModel, s: SemanticState): boolean => lib.runAccessibilityGate({ model: m, state: s, tree: lib.buildCompanionTree(m, s) }).checks.find((k: Any) => k.id === "G12-VIEW").findings.length > 0;
  const withVp = (s: SemanticState, v: Partial<SemanticState["viewport"]>): SemanticState => ({ ...s, viewport: { ...s.viewport, ...v } });
  add("U-GATE-boundary-node", async () => {
    const m = await g9(), s = reduce(m, initialState(m, { width: 900, height: 600 }), { type: "focus", target: { node: { id: "s:a", type: "p" } } }).state;
    // node a at layout (0, 0); zoom 10; w 900, h 600 (different, so a width/height mixup shows): X = -cx * 10 + 450e6, Y = -cy * 10 + 300e6
    const cases: [number, number, boolean][] = [
      [-45_000_000, 0, false], [-45_000_001, 0, true], [-44_999_999, 0, false],    // right edge X = w e6 exactly: inside (closed), one step beyond: off
      [45_000_000, 0, false], [45_000_001, 0, true],                                // left edge X = 0 exactly
      [0, -30_000_000, false], [0, -30_000_001, true], [0, 30_000_000, false], [0, 30_000_001, true], // bottom and top, Y = h e6 and 0
    ];
    for (const [cx, cy, off] of cases) {
      const vp = { ...s.viewport, center_x: cx, center_y: cy, zoom: 10 };
      const { X, Y } = ref(vp, 0, 0);
      eq(offscreen(X, Y, vp), off, `reference for (${cx}, ${cy})`);
      eq(gateOff(m, withVp(s, { center_x: cx, center_y: cy, zoom: 10 })), off, `gate for (${cx}, ${cy}): X=${X} Y=${Y}`);
    }
  });
  add("U-GATE-boundary-edge", async () => {
    // the G9 scene with a FIXED layout whose coordinates are odd thousandths (x = 1.001 i units), so that edge endpoint sums are odd and the midpoint must round
    const sceneBytes = c.read("scenes/G9.scene.json");
    const { scene } = await verifyScene(sceneBytes);
    const lay = await computeFixedLayout(sceneBytes, scene.nodes.map((nd: Any, i: number) => ({ ref: nd.ref, x: 1.001 * i, y: 0.003 * i + 0.001 })));
    const o1 = await buildRenderModel(sceneBytes, lay.layoutBytes);
    const edge = o1.edges.find((e) => (o1.nodes[e.src]!.x + o1.nodes[e.tgt]!.x) % 2 !== 0)!;
    const a = o1.nodes[edge.src]!, b = o1.nodes[edge.tgt]!;
    const base = reduce(o1, initialState(o1, { width: 900, height: 600 }), { type: "focus", target: { edge: edge.ref } }).state;
    let n = 0, odd = 0;
    for (let z = 1990; z <= 2010; z++) {
      for (const [axis, size] of [["x", 900], ["y", 600]] as const) {
        const pa = axis === "x" ? a.x : a.y, pb = axis === "x" ? b.x : b.y;
        const cx0 = Math.round((pa + pb) / 2 - (size * 500000) / z + (size * 1000000) / z); // centre that puts the midpoint near the far boundary
        for (let d = -3; d <= 3; d++) {
          for (const c0 of [cx0 + d, Math.round((pa + pb) / 2 - (size * 500000) / z) + d]) { // the far boundary and the near one (0)
            const vp = { ...base.viewport, zoom: z, ...(axis === "x" ? { center_x: c0 } : { center_y: c0 }) };
            const A = ref(vp, a.x, a.y), B = ref(vp, b.x, b.y);
            const sum = (axis === "x" ? A.X + B.X : A.Y + B.Y);
            if (sum % 2n !== 0n) odd++;
            const midX = floorDiv(2n * (A.X + B.X) + 2n, 4n), midY = floorDiv(2n * (A.Y + B.Y) + 2n, 4n);
            eq(gateOff(o1, withVp(base, vp)), offscreen(midX, midY, vp), `edge midpoint z=${z} ${axis} c=${c0}`);
            n++;
          }
        }
      }
    }
    if (odd === 0 || n < 100) fail(`the sweep must contain odd midpoint sums (${odd}) and many cases (${n})`);
  });
  add("U-GATE-edge-rounding", async () => {
    // viewport 21 px wide, zoom 11: 21e6 + 1 = 11 * 1,909,091, so with an odd endpoint sum the edge midpoint is EXACTLY X = 0 after half-up rounding
    // (floor division would give -1 and move the focus off-screen)
    const sceneBytes = c.read("scenes/G9.scene.json");
    const { scene } = await verifyScene(sceneBytes);
    const lay = await computeFixedLayout(sceneBytes, scene.nodes.map((nd: Any, i: number) => ({ ref: nd.ref, x: 1.001 * i, y: 0.003 * i + 0.001 })));
    const m = await buildRenderModel(sceneBytes, lay.layoutBytes);
    const edge = m.edges.find((e) => (m.nodes[e.src]!.x + m.nodes[e.tgt]!.x) % 2 !== 0)!;
    const a = m.nodes[edge.src]!, b = m.nodes[edge.tgt]!;
    const base = reduce(m, initialState(m, { width: 21, height: 600 }), { type: "focus", target: { edge: edge.ref } }).state;
    const vp = { ...base.viewport, zoom: 11, center_x: (a.x + b.x + 1_909_091) / 2, center_y: Math.round((a.y + b.y) / 2) };
    const A = ref(vp, a.x, a.y), B = ref(vp, b.x, b.y);
    eq(String(floorDiv(2n * (A.X + B.X) + 2n, 4n)), "0", "the constructed midpoint is exactly X = 0");
    eq(gateOff(m, withVp(base, vp)), false, "a midpoint exactly on the left boundary is inside (closed)");
  });
  add("U-SCREEN-differential", async () => {
    const m = await g9();
    let seed = 99;
    const next = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let i = 0; i < 2000; i++) {
      const vp = { center_x: (next() % 4_000_001) - 2_000_000, center_y: (next() % 4_000_001) - 2_000_000, zoom: 10 + (next() % 20_000), width: 1 + (next() % 2000), height: 1 + (next() % 2000) };
      const x = (next() % 4_000_001) - 2_000_000, y = (next() % 4_000_001) - 2_000_000;
      const { X, Y } = int.screenMicro(vp, x, y);
      const r = ref(vp, x, y);
      if (X !== r.X || Y !== r.Y) fail(`screenMicro differs from the reference at ${JSON.stringify(vp)}`);
      const f = layoutToScreen(vp as Any, { x, y } as Any) as Any;
      if (Math.abs(f.x - Number(X) / 1e6) >= 1e-6 || Math.abs(f.y - Number(Y) / 1e6) >= 1e-6) fail(`layoutToScreen differs by more than 1e-6 at ${JSON.stringify(vp)}`);
    }
    void m;
  });

  // ---- I-4 / M-15: rules the unit tests did not pin ----
  add("U-LIVE-bound", async () => {
    const bound = int.bound as (s: string) => string;
    eq(bound("a".repeat(400)), "a".repeat(400), "400 units are kept");
    eq(bound("a".repeat(401)), "a".repeat(399) + "…", "401 units are cut to 399 plus an ellipsis");
    eq(bound("a".repeat(398) + "\u{1f600}" + "b".repeat(10)), "a".repeat(398) + "…", "a surrogate pair at the cut is never split");
    eq(bound("a".repeat(397) + "\u{1f600}" + "b".repeat(10)), "a".repeat(397) + "\u{1f600}" + "…", "a pair that fits is kept");
  });
  add("U-TREE-depth", async () => {
    const m = await g9(), s = initialState(m, { width: 900, height: 600 });
    const t = JSON.parse(JSON.stringify(lib.buildCompanionTree(m, s))) as Any;
    const nest = (d: number): unknown => { let v: unknown = []; for (let i = 1; i < d; i++) v = [v]; return v; };
    const run = (extra: unknown): unknown => lib.runAccessibilityGate({ model: m, state: s, tree: { ...t, extra } });
    run(nest(8)); // the tree itself is the root; an array nested 8 deep is the deepest accepted
    rejects(() => run(nest(9)), "INVALID_TREE", "SCHEMA", "nesting deeper than 8");
  });
  add("U-EXEC-guards", async () => {
    const run = (ops: unknown[]): void => { const d = new Doc(), h = new El(d); lib.executePlan(d, h, ops); };
    rejects(() => run([["c", "a", "div"], ["p", "@host", "a", ""], ["p", "a", "a", ""]]), "INVALID_PLAN", "SCHEMA", "a child inserted into itself");
    rejects(() => run([["c", "a", "div"], ["c", "b", "div"], ["p", "@host", "a", ""], ["p", "a", "b", ""], ["p", "b", "a", ""]]), "INVALID_PLAN", "SCHEMA", "a parent that is a descendant of the child");
    rejects(() => run([["c", "a", "div"], ["c", "b", "div"], ["p", "@host", "a", ""], ["p", "@host", "b", ""], ["c", "x", "div"], ["p", "a", "x", "b"]]), "INVALID_PLAN", "SCHEMA", "before is not a child of the parent");
    rejects(() => run([["p", "@host", "@host", ""]]), "INVALID_PLAN", "SCHEMA", "the host as a child");
  });
  add("U-GATE-duplicates", async () => {
    const m = await g9(), s = initialState(m, { width: 900, height: 600 });
    const t = JSON.parse(JSON.stringify(lib.buildCompanionTree(m, s))) as Any;
    t.items.push(JSON.parse(JSON.stringify(t.items[1])), JSON.parse(JSON.stringify(t.items[1])));
    const f = lib.runAccessibilityGate({ model: m, state: s, tree: t }).checks.find((k: Any) => k.id === "G1-REACH").findings;
    eq(f, [{ code: "ITEM_DUPLICATE", position: 2 }], "one ITEM_DUPLICATE per duplicated position (design 10 reading, recorded as design question F-B13)");
  });
  add("U-LIVE-counts", async () => {
    const m = await g9(), s = initialState(m, { width: 900, height: 600 });
    for (const type of ["lasso-too-large", "select-all-too-large"]) {
      for (const bad of [1.5, NaN, Infinity, -3, 2 ** 70]) rejects(() => lib.liveText([{ type, count: bad }], m, s), "INVALID_INPUT", "INVALID_VALUE", `${type} count ${bad}`);
      eq(lib.liveText([{ type, count: 8 }], m, s), "Selection too large: 8 elements.", `${type} count 8`);
    }
  });
  add("U-VERIFY-forged", async () => {
    const m = await g9(), s = initialState(m, { width: 900, height: 600 });
    for (const mut of [(t: Any) => { t.list.window.first = 0; }, (t: Any) => { t.list.window.count = -1; }, (t: Any) => { t.id_prefix = "A"; }, (t: Any) => { t.list.window.count = 9999; }]) {
      const t = JSON.parse(JSON.stringify(lib.buildCompanionTree(m, s))) as Any; mut(t);
      rejects(() => lib.verifyCompanionTree(m, s, t), "INVALID_TREE", "INCONSISTENT", "a forged window or prefix");
    }
  });
  add("U-PLAN-options-once", async () => {
    const m = await g9(), s = initialState(m, { width: 900, height: 600 }), t = lib.buildCompanionTree(m, s);
    let reads = 0;
    const o = {}; Object.defineProperty(o, "maxPlanBytes", { enumerable: true, get() { reads++; return 1000; } });
    rejects(() => lib.planCompanionUpdate(undefined, t, o), "INVALID_CONFIG", "SCHEMA", "an accessor is refused");
    eq(reads, 0, "the accessor is never read");
  });
  add("U-GATE-state-snapshot", async () => {
    const m = await g9(), s = initialState(m, { width: 900, height: 600 }), t = lib.buildCompanionTree(m, s);
    const st: Any = { ...s }; let reads = 0;
    Object.defineProperty(st, "focus", { enumerable: true, get() { reads++; return reads === 1 ? undefined : 5; } });
    rejects(() => lib.runAccessibilityGate({ model: m, state: st, tree: t }), "INVALID_INPUT", "SCHEMA", "a state with an accessor");
  });
  return checks;
}
