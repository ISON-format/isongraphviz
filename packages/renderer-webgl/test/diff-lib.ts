// The bodies of the D rows of design 13.4 (runtime, caller-supplied seeds, kit-style generated models; no files): D01 random models and scripts, D02 states
// with coordinates around 2^24 and far elements, D03 random labels and options, D04 the executor against a recording fake, D05 the guard rule's exact clip
// against a brute-force reference. test/differential.test.ts runs a handful of seeds; test/slow/differential-slow.test.ts runs many more.
import { expect } from "vitest";
import { IgrError, initialState, type ElementAddress, type Intent, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { GUARD_MARGIN, buildDisplayList, readoutFromList, serializeReadout, type DisplayList } from "isongraph-visualize-display-list";
import { createGlResources, createWebglRenderer, executePlan, parseGlPlan, planGl, readoutFromGl, serializePlan } from "../src/index.js";
import { clipSegment } from "../src/clip.js";
import { decodeDiscs, decodeEdges } from "../src/plan.js";
import { createFakeGl } from "./fake-gl.js";
import { lcg, randomModel, type Rng } from "./gen.js";

const SIZE = { width: 640, height: 480 };
const text = (b: Uint8Array): string => new TextDecoder().decode(b);

function randomIntent(m: RenderModel, rng: Rng): Intent {
  const el = (): ElementAddress => (m.edges.length > 0 && rng.int(3) === 0 ? { edge: rng.pick(m.edges).ref } : { node: rng.pick(m.nodes).ref });
  const targets = (): ElementAddress[] => Array.from({ length: rng.int(4) }, () => el());
  switch (rng.int(9)) {
    case 0: return { type: "select", mode: rng.pick(["replace", "add", "remove", "toggle"] as const), targets: targets() };
    case 1: return { type: "clear-selection" };
    case 2: return { type: "focus", ...(rng.int(4) === 0 ? {} : { target: el() }) };
    case 3: return { type: "focus-step", delta: rng.pick([1, -1] as const) };
    case 4: return { type: "set-hidden", targets: targets(), hidden: rng.int(3) !== 0 };
    case 5: return { type: "pan", dx: rng.int(400) - 200, dy: rng.int(400) - 200 };
    case 6: return { type: "zoom", factor_milli: 100 + rng.int(3000) };
    case 7: return { type: "fit" };
    default: return { type: "resize", width: 1 + rng.int(1200), height: 1 + rng.int(900) };
  }
}

/** Every number of a plan is an integer below 2^24 (the guard rule's lemma, 7.3). */
export function planNumbers(plan: ReturnType<typeof planGl>): number[] {
  const out: number[] = [];
  for (const e of decodeEdges(plan.buffers.edge)) out.push(...e.c);
  for (const d of decodeDiscs(plan.buffers.disc)) out.push(d.x, d.y);
  const a = new DataView(plan.buffers.arrow.buffer, plan.buffers.arrow.byteOffset, plan.buffers.arrow.byteLength);
  for (let o = 0; o + 28 <= plan.buffers.arrow.length; o += 28) for (let k = 0; k < 6; k++) out.push(a.getFloat32(o + 4 * k, true));
  return out;
}

/** D01: the renderer's plan equals planGl of its own list; the reader accepts the bytes; the readout of the plan equals the readout of the list. */
export async function d01(seed: number, intents: number, opts: { hostile?: boolean; maxNodes?: number } = {}): Promise<number> {
  const model = await randomModel(seed, opts);
  const rng = lcg(seed * 7919 + 3);
  const r = createWebglRenderer();
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model);
  let checked = 0;
  for (let i = 0; i <= intents; i++) {
    if (i > 0) { try { r.dispatch(randomIntent(model, rng)); } catch (e) { if (!(e instanceof IgrError)) throw e; } }
    let list: DisplayList;
    try { list = r.displayList(); } catch (e) { expect(e).toBeInstanceOf(IgrError); continue; }
    const plan = r.plan();
    // independent of the renderer's own composition: the plan of a list built from the model and the state directly
    expect(text(serializePlan(plan))).toBe(text(serializePlan(planGl(buildDisplayList(model, r.getState())))));
    const bytes = r.planBytes();
    const parsed = parseGlPlan(bytes);
    expect(text(serializePlan(parsed))).toBe(text(bytes));
    expect(text(serializeReadout(readoutFromGl(parsed)))).toBe(text(serializeReadout(readoutFromList(list))));
    const rep = r.probe();
    const ro = readoutFromGl(plan);
    expect(ro.drawn).toEqual(rep.drawn);
    expect(ro.marked).toEqual(rep.marked);
    checked++;
  }
  return checked;
}

/** D02: states around and beyond 2^24 milli-pixels: every plan number is below 2^24, every clipped segment lies in the guard box, the readout equals the list's. Returns what it reached. */
export async function d02(seed: number): Promise<{ states: number; clipped: number; omittedNodes: number; omittedEdges: number }> {
  const model = await randomModel(seed, { maxNodes: 14 });
  const rng = lcg(seed ^ 0xd02);
  const out = { states: 0, clipped: 0, omittedNodes: 0, omittedEdges: 0 };
  for (let k = 0; k < 24; k++) {
    const size = { width: rng.pick([1, 64, 640, 4000]), height: rng.pick([1, 48, 480, 3000]) };
    const base = initialState(model, size);
    const state: SemanticState = { ...base, viewport: { ...base.viewport, zoom: rng.pick([1000, 10_000, 100_000]), center_x: rng.int(2_000_000) - 1_000_000, center_y: rng.int(2_000_000) - 1_000_000 } };
    let list: DisplayList;
    try { list = buildDisplayList(model, state); } catch (e) { expect(e).toBeInstanceOf(IgrError); continue; }
    const plan = planGl(list);
    out.states++;
    for (const v of planNumbers(plan)) { expect(Number.isInteger(v) && Math.abs(v) < 2 ** 24).toBe(true); }
    const gx = 1000 * size.width + GUARD_MARGIN, gy = 1000 * size.height + GUARD_MARGIN;
    const edges = decodeEdges(plan.buffers.edge);
    const clippedPids = new Set<number>();
    for (const e of list.records) if (e[0] === "E" && (e.slice(4) as number[]).some((v) => Math.abs(v) >= 2 ** 24)) clippedPids.add(e[1]);
    for (const e of edges) {
      if (!clippedPids.has(e.pid)) continue;
      out.clipped++;
      expect(e.kind).toBe(0);
      for (const [x, y] of [[e.c[0]!, e.c[1]!], [e.c[6]!, e.c[7]!]] as const) {
        expect(x).toBeGreaterThanOrEqual(-GUARD_MARGIN); expect(x).toBeLessThanOrEqual(gx);
        expect(y).toBeGreaterThanOrEqual(-GUARD_MARGIN); expect(y).toBeLessThanOrEqual(gy);
      }
    }
    out.omittedNodes += plan.header.cn.length; out.omittedEdges += plan.header.ce.length;
    expect(text(serializeReadout(readoutFromGl(plan)))).toBe(text(serializeReadout(readoutFromList(list))));
    expect(text(serializePlan(parseGlPlan(serializePlan(plan))))).toBe(text(serializePlan(plan)));
  }
  return out;
}

/** D03: random labels and options: the buffers do not change (only `nt` and the text lines do). */
export async function d03(seed: number): Promise<void> {
  const model = await randomModel(seed, { hostile: seed % 2 === 0, maxNodes: 18 });
  const rng = lcg(seed ^ 0xd03);
  const state = initialState(model, SIZE);
  const base = planGl(buildDisplayList(model, state));
  for (const o of [{ labels: false }, { edgeLabels: false }, { maxDrawnLabelUnits: rng.pick([0, 1, 5, 24, 100]) }, { labels: rng.int(2) === 0, edgeLabels: rng.int(2) === 0, maxDrawnLabelUnits: rng.pick([0, 3, 50]) }]) {
    const p = planGl(buildDisplayList(model, state, o));
    for (const b of ["edge", "disc", "arrow"] as const) expect(Array.from(p.buffers[b])).toEqual(Array.from(base.buffers[b]));
    expect(p.header.draws).toEqual(base.header.draws);
    expect(p.header.nt).toBe(p.texts.length);
    expect(text(serializePlan(parseGlPlan(serializePlan(p))))).toBe(text(serializePlan(p)));
  }
}

/** D04: executePlan against a recording fake: the instance count of every draw equals the plan's, and the layer-3 instance pids plus `ce` are exactly the drawn edges. */
export async function d04(seed: number): Promise<void> {
  const model = await randomModel(seed, { maxNodes: 16 });
  const rng = lcg(seed ^ 0xd04);
  const base = initialState(model, SIZE);
  const state: SemanticState = rng.int(2) === 0 ? base : { ...base, viewport: { ...base.viewport, zoom: rng.pick([3000, 30_000]), center_x: rng.int(400_000) - 200_000, center_y: rng.int(400_000) - 200_000 } };
  let list: DisplayList;
  try { list = buildDisplayList(model, state); } catch (e) { expect(e).toBeInstanceOf(IgrError); return; }
  const plan = planGl(list);
  const log: string[] = [];
  const gl = createFakeGl({ log });
  const res = createGlResources(gl);
  log.length = 0;
  executePlan(gl, plan, res, { widthPx: plan.header.w, heightPx: plan.header.h, ink: [34, 34, 34] });
  const draws = log.filter((l) => l.startsWith('["drawArraysInstanced"')).map((l) => (JSON.parse(l) as unknown[])[4] as number);
  expect(draws).toEqual(plan.header.draws.map((d) => d.count));
  const layer3 = plan.header.draws.find((d) => d.layer === 3);
  const edges = decodeEdges(plan.buffers.edge);
  const pids = new Set<number>();
  if (layer3) for (let i = layer3.first; i < layer3.first + layer3.count; i++) pids.add(edges[i]!.pid);
  for (const [pid] of plan.header.ce) pids.add(pid);
  const nd = list.nodes.length;
  expect([...pids].sort((a, b) => a - b)).toEqual(list.edges.map((_, i) => nd + i + 1));
}

/** D05: the exact clip against a brute-force reference at random points: no drawn point outside the clipped geometry by more than 1 m-px, and the result is empty only when the exact clip is. */
export function d05(seed: number, segments: number): number {
  const rng = lcg(seed ^ 0xd05);
  const W = 900, H = 600;
  const gx0 = -GUARD_MARGIN, gx1 = 1000 * W + GUARD_MARGIN, gy0 = -GUARD_MARGIN, gy1 = 1000 * H + GUARD_MARGIN;
  const big = (): number => (rng.int(2) === 0 ? rng.int(4_000_000_000) - 2_000_000_000 : rng.int(4_000_000) - 2_000_000);
  let points = 0;
  for (let s = 0; s < segments; s++) {
    const p0: [number, number] = [big(), big()], p1: [number, number] = [big(), big()];
    const got = clipSegment(p0, p1, W, H, GUARD_MARGIN);
    // brute force: the parameters of the exact line, sampled; a sample is inside when its position lies in the box
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const inside = (t: number): boolean => { const x = p0[0] + dx * t, y = p0[1] + dy * t; return x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1; };
    let anyInside = false;
    for (let i = 0; i <= 4000 && !anyInside; i++) anyInside = inside(i / 4000);
    // the result is empty only when the exact clip is: no sample of the exact segment lies inside the guard box (the sampling misses a sliver, never the reverse)
    if (got === undefined) { expect(anyInside, `a clip that rejected a segment that has a sample inside the box: ${p0} -> ${p1}`).toBe(false); continue; }
    // the clipped end points lie in the box (up to the half m-px of the rounding) and on the exact line
    for (const [x, y] of [[got[0], got[1]], [got[2], got[3]]] as const) {
      expect(x).toBeGreaterThanOrEqual(gx0 - 1); expect(x).toBeLessThanOrEqual(gx1 + 1);
      expect(y).toBeGreaterThanOrEqual(gy0 - 1); expect(y).toBeLessThanOrEqual(gy1 + 1);
      const cross = Math.abs(dx * (y - p0[1]) - dy * (x - p0[0])) / Math.max(1, Math.hypot(dx, dy));
      expect(cross).toBeLessThanOrEqual(1);
    }
    // sampled points of the exact line that lie inside the box are near the clipped segment
    const gdx = got[2] - got[0], gdy = got[3] - got[1];
    const glen2 = gdx * gdx + gdy * gdy;
    for (let i = 0; i < 40; i++) {
      const t = rng.float();
      if (!inside(t)) continue;
      const x = p0[0] + dx * t, y = p0[1] + dy * t;
      const u = glen2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - got[0]) * gdx + (y - got[1]) * gdy) / glen2));
      expect(Math.hypot(x - (got[0] + gdx * u), y - (got[1] + gdy * u))).toBeLessThanOrEqual(1.5);
      points++;
    }
  }
  return points;
}
