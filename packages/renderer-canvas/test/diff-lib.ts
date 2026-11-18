// The bodies of the D rows of design 13.3 (runtime, caller-supplied seeds, kit-style generated models; no files): D01 random models and random intents,
// D02 hostile strings, D03 random states and viewports, D04 random options and byte limits. (D05, pickDrawn against a brute-force reference, is
// packages/display-list/test/pick.test.ts; D06, the harness that catches a probe()-derived readout, is a cross-check test of V7's step.)
// test/differential.test.ts runs a handful of seeds; test/slow/differential-slow.test.ts runs many more.
import { expect } from "vitest";
import { IgrError, initialState, type ElementAddress, type Intent, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, parseDisplayList, readoutFromList, serializeDisplayList, serializeReadout, type DisplayList } from "isongraph-visualize-display-list";
import { readoutFromCanvasStream, recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import { createCanvasRenderer } from "../src/index.js";
import { hostileString, lcg, randomModel, type Rng } from "./gen.js";

const SIZE = { width: 640, height: 480 };
const text = (b: Uint8Array): string => new TextDecoder().decode(b);
const xsRef = (s: string): string => { let o = ""; for (const ch of s) { const c = ch.codePointAt(0)!; o += c === 9 || c === 10 || c === 13 || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000 ? ch : "�"; } return o; };
const drawnLabelRef = (s: string): string => {
  const t = xsRef(s.split("\t").join(" ").split("\n").join(" ").split("\r").join(" "));
  if (t.length <= 24) return t;
  let out = "";
  for (const ch of t) { if (out.length + ch.length > 23) break; out += ch; }
  return out + "…";
};

function randomIntent(m: RenderModel, rng: Rng): Intent {
  const el = (): ElementAddress => (m.edges.length > 0 && rng.int(3) === 0 ? { edge: rng.pick(m.edges).ref } : { node: rng.pick(m.nodes).ref });
  const bogus = (): ElementAddress => ({ node: { id: "i:424242", type: "zz" } });
  const targets = (): ElementAddress[] => Array.from({ length: rng.int(4) }, () => (rng.int(12) === 0 ? bogus() : el()));
  switch (rng.int(12)) {
    case 0: return { type: "select", mode: rng.pick(["replace", "add", "remove", "toggle"] as const), targets: targets() };
    case 1: return { type: "clear-selection" };
    case 2: return { type: "focus", ...(rng.int(4) === 0 ? {} : { target: el() }) };
    case 3: return { type: "focus-step", delta: rng.pick([1, -1] as const) };
    case 4: return { type: rng.pick(["focus-first", "focus-last"] as const) };
    case 5: return { type: "set-hidden", targets: targets(), hidden: rng.int(3) !== 0 };
    case 6: return { type: "pan", dx: rng.int(400) - 200, dy: rng.int(400) - 200 };
    case 7: return { type: "zoom", factor_milli: 100 + rng.int(3000), ...(rng.int(2) === 0 ? { anchor: { x: rng.int(640), y: rng.int(480) } } : {}) };
    case 8: return { type: "fit" };
    case 9: return { type: "set-viewport", center_x: rng.int(2_000_000) - 1_000_000, center_y: rng.int(2_000_000) - 1_000_000, zoom: 10 + rng.int(5000) };
    case 10: return { type: "resize", width: 1 + rng.int(1200), height: 1 + rng.int(900) };
    default: return { type: "select", mode: "replace", targets: [bogus()] };
  }
}

const maxAbs = (list: DisplayList): number => {
  let mx = 0;
  for (const r of list.records) for (let i = 2; i < r.length; i++) if (typeof r[i] === "number" && !(r[0] === "N" && i < 4) && !(r[0] === "E" && i < 4) && !(r[0] === "T" && i === 2)) mx = Math.max(mx, Math.abs(r[i] as number));
  return mx;
};

/** D01: the subject's list equals buildDisplayList of its own state; the reader accepts it; the readouts of the list and of its stream agree; drawn and marked equal probe(). */
export async function d01(seed: number, intents: number, opts: { hostile?: boolean; maxNodes?: number } = {}): Promise<number> {
  const model = await randomModel(seed, opts);
  const rng = lcg(seed * 7919 + 1);
  const r = createCanvasRenderer();
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model);
  let checked = 0;
  for (let i = 0; i <= intents; i++) {
    if (i > 0) { try { r.dispatch(randomIntent(model, rng)); } catch (e) { if (!(e instanceof IgrError)) throw e; } }
    const state = r.getState();
    let list: DisplayList;
    try { list = r.displayList(); } catch (e) { expect(e).toBeInstanceOf(IgrError); expect((e as IgrError).reason).toBe("OUT_OF_RANGE"); continue; }
    expect(list).toEqual(buildDisplayList(model, state));
    const bytes = serializeDisplayList(list);
    expect(text(serializeDisplayList(parseDisplayList(bytes)))).toBe(text(bytes));
    const stream = r.canvasCalls();
    expect(text(serializeReadout(readoutFromCanvasStream(stream, list)))).toBe(text(serializeReadout(readoutFromList(list))));
    const rep = r.probe();
    const ro = readoutFromList(list);
    expect(ro.drawn).toEqual(rep.drawn);
    expect(ro.marked).toEqual(rep.marked);
    expect(text(recordCanvasCalls(list))).toBe(text(stream));
    checked++;
  }
  return checked;
}

/** D02: hostile strings over all scalar classes: lists are accepted by the reader, the texts equal dl(label) of the model, the addresses resolve. */
export async function d02(seed: number): Promise<void> {
  const model = await randomModel(seed, { hostile: true, maxNodes: 12 });
  const state = initialState(model, SIZE);
  const list = buildDisplayList(model, state);
  const parsed = parseDisplayList(serializeDisplayList(list));
  expect(parsed.records).toEqual(list.records);
  const nd = list.nodes.length;
  for (const r of list.records) {
    if (r[0] !== "T") continue;
    const label = r[2] === 0 ? model.nodes.find((n) => n.ref.id === list.nodes[r[1] - 1]!.id && n.ref.type === list.nodes[r[1] - 1]!.type)!.label : model.edges.find((e) => JSON.stringify(e.ref) === JSON.stringify(list.edges[r[1] - nd - 1]))!.label;
    expect(r[5]).toBe(drawnLabelRef(label));
  }
  for (const n of list.nodes) expect(model.nodes.some((x) => x.ref.id === n.id && x.ref.type === n.type)).toBe(true);
}

/** D03: random states and viewports (extreme centres, zooms 10 and 100000, sizes 1 and 16384): no exception but a documented IgrError; the refusal of 3.5 follows the node centres. */
export async function d03(seed: number, cases: number): Promise<number> {
  const model = await randomModel(seed, { maxNodes: 15 });
  const rng = lcg(seed ^ 0xd03);
  let refused = 0;
  for (let k = 0; k < cases; k++) {
    const size = { width: rng.pick([1, 2, 640, 16384]), height: rng.pick([1, 2, 480, 16384]) };
    const zoom = rng.pick([10, 100, 1000, 100000]);
    const base = initialState(model, size);
    const state: SemanticState = { ...base, viewport: { ...base.viewport, zoom, center_x: rng.pick([0, 2 ** 53 - 1, -(2 ** 53 - 1), 1_000_000_000_000, -1_000_000_000_000, rng.int(2_000_000) - 1_000_000]), center_y: rng.pick([0, 2 ** 53 - 1, -(2 ** 53 - 1), rng.int(2_000_000) - 1_000_000]) } };
    let list: DisplayList | undefined, err: unknown;
    try { list = buildDisplayList(model, state); } catch (e) { err = e; }
    // an independent bound on the node centres in milli-pixels
    let far = 0n, near = 0n;
    for (const n of model.nodes) {
      const X = (BigInt(n.x) - BigInt(state.viewport.center_x)) * BigInt(zoom) + BigInt(size.width) * 500000n, Y = (BigInt(n.y) - BigInt(state.viewport.center_y)) * BigInt(zoom) + BigInt(size.height) * 500000n;
      const ax = (X < 0n ? -X : X) / 1000n, ay = (Y < 0n ? -Y : Y) / 1000n;
      const a = ax > ay ? ax : ay;
      if (a > far) far = a;
      near = far;
    }
    const LIMIT = 2n ** 40n;
    if (err !== undefined) {
      expect(err).toBeInstanceOf(IgrError);
      expect((err as IgrError).code).toBe("INVALID_INPUT");
      expect((err as IgrError).reason).toBe("OUT_OF_RANGE");
      expect((err as IgrError).path).toBe("dl.coord");
      // everything else a list emits lies within 1,000 px (1e6 m-px) of a node centre: label +24 px, arrowhead 10 px, loops and parallel offsets under 600 px
      expect(far, "a refusal needs a node centre within 1,000 px of the limit or beyond it").toBeGreaterThan(LIMIT - 1_000_000n);
      refused++;
    } else {
      expect(maxAbs(list!)).toBeLessThanOrEqual(2 ** 40);
      expect(far, "a list that was built has every node centre within the limit (m-px, rounded)").toBeLessThanOrEqual(LIMIT + 1n);
    }
    void near;
  }
  return refused;
}

/** D04: random options: refusal iff the byte length exceeds the limit; elision follows 4.4(g). */
export async function d04(seed: number): Promise<void> {
  const model = await randomModel(seed, { hostile: seed % 2 === 0, maxNodes: 20 });
  const rng = lcg(seed ^ 0xd04);
  const state = initialState(model, SIZE);
  const dlOpts = { labels: rng.int(4) !== 0, edgeLabels: rng.int(3) !== 0, maxDrawnLabelUnits: rng.pick([0, 1, 5, 24, 100, 1_048_576]) };
  const list = buildDisplayList(model, state, dlOpts);
  const bytes = serializeDisplayList(list);
  expect(() => serializeDisplayList(list, { maxBytes: bytes.length })).not.toThrow();
  expect(() => serializeDisplayList(list, { maxBytes: bytes.length - 1 })).toThrow(/BYTES_LIMIT/);
  const labels = list.records.filter((r) => r[0] === "T").map((r) => r[5] as string);
  if (!dlOpts.labels) expect(labels).toEqual([]);
  let total = 0;
  for (const l of labels) total += l.length;
  expect(total).toBeLessThanOrEqual(dlOpts.maxDrawnLabelUnits);
  if (dlOpts.maxDrawnLabelUnits === 0) return; // a renderer cannot declare a capacity of 0 (options.ts); the list above is the pure part
  const r = createCanvasRenderer({ dl: dlOpts, maxDlBytes: bytes.length });
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model);
  expect(text(r.displayListBytes())).toBe(text(bytes));
  const small = createCanvasRenderer({ dl: dlOpts, maxDlBytes: bytes.length - 1 });
  await small.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await small.loadScene(model);
  expect(() => small.displayListBytes()).toThrow(/BYTES_LIMIT/);
}
