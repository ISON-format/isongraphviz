// The bodies of the D rows of design 15.4 (runtime, caller seeds): D01 random models and intent scripts, D02 hostile strings, D03 random states and
// viewports, D04 random limits. test/differential.test.ts runs a handful of seeds; test/slow/differential-slow.test.ts runs many more.
import { expect } from "vitest";
import { IgrError, hitTest, initialState, reduce, type ElementAddress, type Intent, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { decodeElementId, elementDomId, pickElement, readSvg, renderSvg, renderSvgDetailed, writeSvg, createSvgRenderer, svgWitness } from "../src/index.js";
import { hostileString, lcg, randomModel, type Rng } from "./gen.js";

const P = "igr";
const SIZE = { width: 640, height: 480 };
const xsRef = (s: string): string => { let o = ""; for (const ch of s) { const c = ch.codePointAt(0)!; o += c === 9 || c === 10 || c === 13 || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000 ? ch : "�"; } return o; };

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

/** The checks of D01 on one committed state. */
function checkCommitted(model: RenderModel, state: SemanticState, svg: string, probeDrawn: { nodes: unknown[]; edges: unknown[] }, accessible: { name: string; selected: boolean; focused: boolean; address: ElementAddress }[], rng: Rng): void {
  expect(svg).toBe(renderSvg(model, state, { maxDrawnLabelUnits: 1_048_576 }));
  const ro = readSvg(svg);
  // RT-A
  expect(ro.nodes.map((n) => n.address)).toEqual(probeDrawn.nodes);
  expect(ro.edges.map((e) => e.address)).toEqual(probeDrawn.edges);
  for (const n of ro.nodes) expect(decodeElementId(P, n.id)).toEqual({ node: n.address });
  // RT-B for every drawn element
  for (const n of ro.nodes) expect(pickElement(model, state, P, { targetId: n.id })).toEqual({ node: n.address });
  for (const e of ro.edges) expect(pickElement(model, state, P, { targetId: e.id })).toEqual({ edge: e.address });
  // RT-C(a): a geometric hit is drawn
  const drawn = new Set([...ro.nodes.map((n) => n.id), ...ro.edges.map((e) => e.id)]);
  for (let k = 0; k < 6; k++) {
    const h = hitTest(model, state, { x: rng.float() * state.viewport.width, y: rng.float() * state.viewport.height });
    if (h !== undefined) expect(drawn.has(elementDomId(P, h))).toBe(true);
  }
  // names (after xs), selected, focused, tabindex equal the accessible model and the marks
  const items = [...accessible.filter((i) => "node" in i.address), ...accessible.filter((i) => "edge" in i.address)];
  expect(items).toHaveLength(ro.nodes.length + ro.edges.length);
  const flat = [...ro.nodes, ...ro.edges];
  flat.forEach((r, i) => { expect(r.name).toBe(xsRef(items[i]!.name)); expect(r.selected).toBe(items[i]!.selected); expect(r.focused).toBe(items[i]!.focused); });
  const zeros = flat.filter((r) => r.tabindex === "0");
  expect(zeros).toHaveLength(flat.length > 0 ? 1 : 0);
  if (state.focus !== undefined) expect(zeros[0]!.focused).toBe(true);
}

export async function d01(seed: number, intents: number): Promise<void> {
  const model = await randomModel(seed);
  const rng = lcg(seed * 7919 + 13);
  const r = createSvgRenderer();
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model);
  for (let k = 0; k < intents; k++) {
    const intent = randomIntent(model, rng);
    try { r.dispatch(intent); } catch (e) { expect(e).toBeInstanceOf(IgrError); }
    const rep = r.probe();
    checkCommitted(model, r.getState(), r.svg(), rep.drawn, rep.accessible.items, rng);
    if (k % 25 === 0) { const w = svgWitness(r.svg()); expect(w.elements.nodes).toEqual(rep.drawn.nodes); expect(w.elements.edges).toEqual(rep.drawn.edges); }
  }
}

export async function d02(seed: number): Promise<void> {
  const model = await randomModel(seed, { hostile: true, maxNodes: 12 });
  const rng = lcg(seed + 99);
  let state = initialState(model, SIZE);
  for (let k = 0; k < 4; k++) {
    const doc = renderSvg(model, state);
    const ro = readSvg(doc); // the document is accepted by the strict reader
    const items = [...model.nodes.map((n) => xsRef(`${n.category} ${n.label}`)), ...model.edges.map((e) => xsRef(e.label))];
    const visible = [...ro.nodes, ...ro.edges];
    expect(visible.length).toBeLessThanOrEqual(items.length);
    for (const n of ro.nodes) { const mn = model.nodes.find((x) => JSON.stringify(x.ref) === JSON.stringify(n.address))!; expect(n.name).toBe(xsRef(`${mn.category} ${mn.label}`)); }
    for (const e of ro.edges) { const me = model.edges.find((x) => JSON.stringify(x.ref) === JSON.stringify(e.address))!; expect(e.name).toBe(xsRef(me.label)); }
    for (const n of ro.nodes) expect(decodeElementId(P, n.id)).toEqual({ node: n.address });
    // structural scan: no `<` outside tag starts and no raw LF inside a value
    for (const line of doc.split("\n").slice(0, -1)) {
      expect(line.length).toBeGreaterThan(0);
      const stripped = line.replace(/<\/?[A-Za-z][^<>]*>/g, "");
      expect(stripped).not.toMatch(/[<>\r]/);
      expect(line).not.toMatch(/ [a-z-]+="[^"]*[<>\n\r\t][^"]*"/);
    }
    try { state = reduce(model, state, randomIntent(model, rng)).state; } catch (e) { expect(e).toBeInstanceOf(IgrError); }
  }
}

export async function d03(seed: number): Promise<void> {
  const model = await randomModel(seed, { maxNodes: 8 });
  const rng = lcg(seed + 5);
  const extremes = [{ width: 1, height: 1 }, { width: 16384, height: 16384 }, { width: 1, height: 16384 }, { width: 900, height: 600 }];
  for (const sz of extremes) {
    for (const zoom of [10, 100000, 1000]) {
      const cx = rng.pick([0, 2 ** 40, -(2 ** 40), 2 ** 52, -(2 ** 52), 123_456_789]), cy = rng.pick([0, 2 ** 40, -(2 ** 40), 2 ** 52 - 1, 7]);
      let state = initialState(model, sz);
      try { state = reduce(model, state, { type: "set-viewport", center_x: cx, center_y: cy, zoom }).state; } catch (e) { expect(e).toBeInstanceOf(IgrError); }
      let a: string;
      try { a = renderSvg(model, state); } catch (e) { expect(e).toBeInstanceOf(IgrError); continue; }
      expect(renderSvg(model, state)).toBe(a);
      expect(() => readSvg(a)).not.toThrow();
      for (const m of a.matchAll(/ (?:cx|cy|x|y|d)="([^"]*)"/g)) expect(m[1]).toMatch(/^[MLQCz0-9. -]+$/);
    }
  }
}

export async function d04(seed: number): Promise<void> {
  const model = await randomModel(seed, { hostile: true, maxNodes: 10 });
  const rng = lcg(seed + 1);
  const state = initialState(model, SIZE);
  const full = renderSvgDetailed(model, state);
  const len = new TextEncoder().encode(full.svg).length;
  expect(full.bytes).toBe(len);
  for (const limit of [len, len - 1, Math.floor(len / 2), 0, len + 1, rng.int(len + 1)]) {
    let got = 0, error = "none";
    try { writeSvg(model, state, { maxSvgBytes: limit }, (l) => { got += new TextEncoder().encode(l).length; }); } catch (e) { error = e instanceof IgrError ? `${e.code}/${e.reason}` : "other"; }
    expect(error).toBe(len > limit ? "RESOURCE_LIMIT/BYTES_LIMIT" : "none");
    expect(got).toBeLessThanOrEqual(limit);
    if (len > limit) expect(error).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect((() => { try { renderSvg(model, state, { maxSvgBytes: limit }); return "none"; } catch (e) { return `${(e as IgrError).code}/${(e as IgrError).reason}`; } })()).toBe(len > limit ? "RESOURCE_LIMIT/BYTES_LIMIT" : "none");
  }
  // label budget: units never exceed the limit; fewer units never draw more text; elided iff something was cut or omitted
  let prevTexts = Infinity;
  for (const lim of [full.label_units + 5, full.label_units, full.label_units - 1, Math.floor(full.label_units / 2), 1, 0].filter((x) => x >= 0)) {
    const r = renderSvgDetailed(model, state, { maxDrawnLabelUnits: lim });
    const texts = (r.svg.match(/<text class="igr-e?label"/g) ?? []).length;
    expect(r.label_units).toBeLessThanOrEqual(lim);
    expect(texts).toBeLessThanOrEqual(prevTexts);
    prevTexts = texts;
    if (lim >= full.label_units) expect(r.fidelity.labels).toBe(full.fidelity.labels);
  }
  void hostileString;
}

