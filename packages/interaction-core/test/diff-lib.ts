// The bodies of the D rows of design 15.5 (runtime tier, caller-supplied seeds, recorded in the report; the LCG of IGL/1 7.1 through test/gen.ts):
//   D01  property I1 on random transcripts: every intent output of `step` is accepted by the real reducer (through a real headless renderer: the closed loop
//        of design 16 (5)), with the two stated exceptions, and the renderer's probe() stays equal to its state (the loop never produces an invalid state);
//   D02  I2 (the pan telescoping sum), I3 (no mutation, round trip, the invariants of 5.1) and I4 (ranges) over random event streams;
//   D03  spatial navigation against a test-local brute force of 7.2 and its invariants (drawn, p > 0, tier order), and I5 (the reveal).
// Test-only code: nothing here is imported by src/.
import { expect } from "vitest";
import { IgrError, initialState, layoutToScreen, reduce, type ElementAddress, type Intent, type RenderModel, type Renderer, type SemanticState } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import { COORD_MAX_MILLI, createMachine, parseMachine, resolveNavigation, serializeMachine, serializeStep, step, type MachineState, type Output } from "../src/index.js";
import { lcg, randomModel, type Rng } from "./gen.js";

export interface Report { events: number; intents: number; exceptions: number }

const SIZE = { width: 640, height: 480 };
const frozen = <T>(v: T): T => { if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) frozen((v as Record<string, unknown>)[k]); Object.freeze(v); } return v; };
const TOKENS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", "Escape", "Tab", "ContextMenu", "F10", "Space", "e", "s", "t", "m", "a", "+", "-", "=", "0", "x", "Delete"];

const addr = (m: RenderModel, rng: Rng): ElementAddress => (m.edges.length > 0 && rng.int(3) === 0 ? { edge: rng.pick(m.edges).ref } : { node: rng.pick(m.nodes).ref });

/** A random valid state: a few random intents through the real reducer. */
export function randomState(model: RenderModel, rng: Rng): SemanticState {
  let s = initialState(model, SIZE);
  for (let i = rng.int(8); i > 0; i--) {
    const k = rng.int(7);
    const intent: Intent =
      k === 0 ? { type: "select", mode: rng.pick(["replace", "add", "toggle"] as const), targets: [addr(model, rng), addr(model, rng)] }
      : k === 1 ? { type: "focus", target: addr(model, rng) }
      : k === 2 ? { type: "set-hidden", targets: [addr(model, rng)], hidden: true }
      : k === 3 ? { type: "set-viewport", center_x: rng.int(2_000_001) - 1_000_000, center_y: rng.int(2_000_001) - 1_000_000, zoom: 10 + rng.int(20_000) }
      : k === 4 ? { type: "zoom", factor_milli: 500 + rng.int(2000) }
      : k === 5 ? { type: "pan", dx: rng.int(400) - 200, dy: rng.int(400) - 200 }
      : { type: "fit" };
    try { s = reduce(model, s, intent).state; } catch (e) { if (!(e instanceof IgrError)) throw e; }
  }
  return s;
}

/** One random event for the machine (valid by construction except when `bad` is true); `t` is advanced by the caller. */
function randomEvent(model: RenderModel, rng: Rng, t: number, open: Map<number, "mouse" | "touch">): unknown {
  const coord = (): number => (rng.int(12) === 0 ? (rng.int(2) === 0 ? -COORD_MAX_MILLI : COORD_MAX_MILLI) : rng.int(1_400_000) - 200_000);
  const mods = (): number => (rng.int(3) === 0 ? rng.int(16) : 0);
  switch (rng.int(11)) {
    case 0: case 1: { // pointerdown
      const id = rng.int(4);
      const ptype = rng.pick(["mouse", "touch", "pen"] as const);
      const target = rng.int(4) === 0 ? {} : rng.int(8) === 0 ? { target: { node: { id: "s:nope", type: "p" } } } : { target: addr(model, rng) };
      open.set(id, ptype === "touch" ? "touch" : "mouse");
      return { type: "pointerdown", t, id, ptype, button: rng.int(6) === 0 ? 1 + rng.int(2) : 0, x: coord(), y: coord(), mods: mods(), ...target };
    }
    case 2: case 3: case 4: return { type: "pointermove", t, id: rng.int(4), x: coord(), y: coord(), mods: mods() };
    case 5: return rng.int(4) === 0 ? { type: "pointercancel", t, id: rng.int(4) } : { type: "pointerup", t, id: rng.int(4), x: coord(), y: coord(), mods: mods() };
    case 6: return { type: "wheel", t, x: coord(), y: coord(), dy: rng.int(8) === 0 ? (rng.int(2) === 0 ? -(2 ** 40) : 2 ** 40) : rng.int(400_000) - 200_000, unit: rng.int(3), mods: mods() };
    case 7: case 8: return { type: "key", t, key: rng.pick(TOKENS), mods: rng.pick([0, 0, 0, 1, 2, 4, 8, 3]) };
    case 9: return rng.int(2) === 0 ? { type: "tick", t } : { type: "contextmenu", t, x: coord(), y: coord(), mods: mods(), ...(rng.int(2) === 0 ? { target: addr(model, rng) } : {}) };
    default: return { type: "dblclick", t, x: coord(), y: coord(), mods: 0 };
  }
}

const ranges = (m: MachineState): void => {
  expect(Math.abs(m.wheel_acc)).toBeLessThan(100_000);
  expect(m.rem_x).toBeGreaterThanOrEqual(-500); expect(m.rem_x).toBeLessThanOrEqual(499);
  expect(m.rem_y).toBeGreaterThanOrEqual(-500); expect(m.rem_y).toBeLessThanOrEqual(499);
};

/** D01 + the closed loop: the machine drives a real headless renderer; every emitted intent is accepted by the real reducer. Returns counts. */
export async function d01(seed: number, steps: number, opts: { hostile?: boolean; maxNodes?: number } = {}): Promise<Report> {
  const model = await randomModel(seed, opts);
  const rng = lcg(seed * 7919 + 3);
  const renderer: Renderer = createHeadlessRenderer();
  await renderer.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await renderer.loadScene(model, randomState(model, rng));
  const rep: Report = { events: 0, intents: 0, exceptions: 0 };
  let machine = createMachine();
  let t = 0;
  const open = new Map<number, "mouse" | "touch">();
  for (let i = 0; i < steps; i++) {
    t += rng.int(3) === 0 ? 0 : rng.int(700);
    const ev = randomEvent(model, rng, t, open);
    const state = renderer.getState();
    let r;
    try { r = step(machine, frozen(ev), model, frozen(state), { wrap: rng.int(2) === 0, reveal: rng.int(4) !== 0, maxTargets: rng.int(5) === 0 ? 3 : undefined } as never); } catch (e) {
      // the only errors a valid event stream may raise are the stated event errors (a coordinate that is exactly at the domain is valid)
      throw new Error(`step threw for ${JSON.stringify(ev)}: ${String(e)}`);
    }
    rep.events++;
    machine = r.machine;
    ranges(machine);
    for (const out of r.outputs) {
      if (out.kind !== "intent") continue;
      rep.intents++;
      try { renderer.dispatch(out.intent); } catch (e) {
        // I1 allows exactly two exceptions: the stored-result range check (a viewport centre near 2^53) and TARGET_LIMIT when the host limit is lower
        if (e instanceof IgrError && (e.reason === "OUT_OF_RANGE" || e.reason === "TARGET_LIMIT")) { rep.exceptions++; continue; }
        throw new Error(`intent ${JSON.stringify(out.intent)} of ${JSON.stringify(ev)} was refused by the reducer: ${String(e)}`);
      }
    }
    const probe = renderer.probe();
    expect(probe.state).toEqual(renderer.getState());
    if (i % 17 === 0) renderer.dispatch({ type: "fit" });
  }
  await renderer.dispose();
  return rep;
}

/** D02: I2 (pan telescoping), I3 (no mutation; round trip; the invariants of 5.1 hold after every event) and I4 (ranges) over random streams. */
export async function d02(seed: number, steps: number): Promise<Report> {
  const model = await randomModel(seed, { maxNodes: 12 });
  const rng = lcg(seed * 104729 + 11);
  const rep: Report = { events: 0, intents: 0, exceptions: 0 };
  // I2: a drag from the press to the last move
  for (let k = 0; k < 6; k++) {
    const state = randomState(model, rng);
    const x0 = rng.int(2_000_000) - 1_000_000, y0 = rng.int(2_000_000) - 1_000_000;
    let m = step(createMachine(), { type: "pointerdown", t: 0, id: 0, ptype: "mouse", button: 0, x: x0, y: y0, mods: 0 }, model, state).machine;
    let sx = 0, sy = 0, xl = x0, yl = y0, t = 0;
    const n = 1 + rng.int(12);
    for (let i = 0; i < n; i++) {
      t += 1 + rng.int(20);
      xl = rng.int(3) === 0 ? xl + rng.int(1200) - 600 : rng.int(2_000_000) - 1_000_000;
      yl = rng.int(3) === 0 ? yl + rng.int(1200) - 600 : rng.int(2_000_000) - 1_000_000;
      const r = step(m, { type: "pointermove", t, id: 0, x: xl, y: yl, mods: 0 }, model, state);
      for (const o of r.outputs) if (o.kind === "intent" && o.intent.type === "pan") { sx += o.intent.dx; sy += o.intent.dy; rep.intents++; }
      m = r.machine;
    }
    const up = step(m, { type: "pointerup", t: t + 1, id: 0, x: xl, y: yl, mods: 0 }, model, state);
    if (m.gesture === "pan") {
      const floorDiv = (a: number, b: number): number => Math.floor(a / b);
      expect(sx).toBe(floorDiv(2 * (xl - x0) + 1000, 2000));
      expect(sy).toBe(floorDiv(2 * (yl - y0) + 1000, 2000));
      expect(up.outputs).toEqual([]);
    } else expect(sx + sy).toBe(0);
  }
  // I3 and I4 over a random stream
  let machine = createMachine();
  let t = 0;
  const open = new Map<number, "mouse" | "touch">();
  let state = randomState(model, rng);
  for (let i = 0; i < steps; i++) {
    t += rng.int(3) === 0 ? 0 : rng.int(700);
    const ev = frozen(randomEvent(model, rng, t, open));
    const before = serializeMachine(machine);
    const r = step(frozen(machine), ev, model, frozen(state));
    expect(serializeMachine(machine)).toEqual(before); // the argument is not mutated
    const bytes = serializeMachine(r.machine);
    expect(serializeMachine(parseMachine(bytes))).toEqual(bytes); // round trip; parseMachine enforces the invariants of 5.1
    expect(new TextDecoder().decode(bytes)).not.toContain("null"); // no null in any serializer output (3.1)
    expect(new TextDecoder().decode(serializeStep(r))).not.toContain("null");
    ranges(r.machine);
    machine = r.machine;
    rep.events++;
    for (const o of r.outputs) if (o.kind === "intent") { try { state = reduce(model, state, o.intent).state; } catch (e) { if (!(e instanceof IgrError)) throw e; rep.exceptions++; } }
    if (rng.int(10) === 0) state = randomState(model, rng);
  }
  return rep;
}

/** The brute force of 7.2 for a spatial move, written differently from src: Number arithmetic (the products stay below 2^53), sorting, no tier variable. */
function bruteSpatial(model: RenderModel, state: SemanticState, dir: "left" | "right" | "up" | "down"): ElementAddress | undefined {
  const hidden = new Set(state.hidden.nodes.map((n) => JSON.stringify([n.type, n.id])));
  const hiddenN = new Set<number>();
  model.nodes.forEach((n, i) => { if (hidden.has(JSON.stringify([n.ref.type, n.ref.id]))) hiddenN.add(i); });
  const f = state.focus!;
  let ox: number, oy: number, self = -1;
  if ("node" in f) { const i = model.nodes.findIndex((n) => n.ref.id === f.node.id && n.ref.type === f.node.type); ox = model.nodes[i]!.x; oy = model.nodes[i]!.y; self = i; }
  else {
    const e = model.edges.find((x) => JSON.stringify(x.ref) === JSON.stringify(f.edge))!;
    const a = model.nodes[e.src]!, b = model.nodes[e.tgt]!;
    ox = Math.floor((a.x + b.x + 1) / 2); oy = Math.floor((a.y + b.y + 1) / 2); // divRound(a + b, 2) = floor((a + b + 1) / 2)
  }
  const cands = model.nodes.filter((_n, i) => !hiddenN.has(i) && i !== self).map((n) => {
    const dx = n.x - ox, dy = n.y - oy;
    const [p, s] = dir === "right" ? [dx, Math.abs(dy)] : dir === "left" ? [-dx, Math.abs(dy)] : dir === "down" ? [dy, Math.abs(dx)] : [-dy, Math.abs(dx)];
    return { n, p, s, tier: s <= p ? 1 : 2 };
  }).filter((c) => c.p > 0);
  cands.sort((a, b) => a.tier - b.tier || a.p * a.p + a.s * a.s - (b.p * b.p + b.s * b.s) || a.s - b.s || a.n.index - b.n.index);
  const w = cands[0];
  return w === undefined ? undefined : { node: w.n.ref };
}

/** D03: spatial navigation against the brute force, and I5 (the reveal leaves the focused element within 1 px of the closed margin box). */
export async function d03(seed: number, trials: number): Promise<Report> {
  const model = await randomModel(seed, { maxNodes: 40, hostile: seed % 2 === 0, ...(seed % 3 === 0 ? { grid: 200 } : {}) }); // a coarse grid on every third seed: ties
  const rng = lcg(seed * 15485863 + 5);
  const rep: Report = { events: 0, intents: 0, exceptions: 0 };
  for (let k = 0; k < trials; k++) {
    let state = randomState(model, rng);
    try { state = reduce(model, state, { type: "focus", target: addr(model, rng) }).state; } catch (e) { if (!(e instanceof IgrError)) throw e; }
    if (state.focus === undefined) continue;
    const dir = rng.pick(["left", "right", "up", "down"] as const);
    const outs = resolveNavigation(model, state, { type: "nav-spatial", dir, extend: false }, { reveal: false }).outputs;
    const want = bruteSpatial(model, state, dir);
    if (want === undefined) expect(outs).toEqual([{ kind: "nav", event: { type: "nav-boundary", nav: "spatial", dir } }]);
    else expect(outs).toEqual([{ kind: "intent", intent: { type: "focus", target: want } }]);
    rep.events++;
    // I5 over the machine: a navigation key with the reveal on
    const key = rng.pick(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "PageDown", "PageUp", "Home", "End", "e", "s", "t"]);
    const r = step(createMachine(), { type: "key", t: 0, key, mods: 0 }, model, state);
    const focusIntent = r.outputs.find((o): o is Extract<Output, { kind: "intent" }> => o.kind === "intent" && o.intent.type.startsWith("focus"));
    if (focusIntent === undefined) continue;
    let after = state;
    for (const o of r.outputs) if (o.kind === "intent") { after = reduce(model, after, o.intent).state; rep.intents++; }
    if (after.focus === undefined) continue;
    const vp = after.viewport;
    const at = (n: { x: number; y: number }) => layoutToScreen(vp, n);
    let px: number, py: number;
    if ("node" in after.focus) { const f = after.focus.node; const n = model.nodes.find((q) => q.ref.id === f.id && q.ref.type === f.type)!; ({ x: px, y: py } = at(n)); }
    else {
      const f = after.focus.edge;
      const e = model.edges.find((q) => JSON.stringify(q.ref) === JSON.stringify(f))!;
      const a = at(model.nodes[e.src]!), b = at(model.nodes[e.tgt]!);
      px = (a.x + b.x) / 2; py = (a.y + b.y) / 2;
    }
    const m = Math.min(24, Math.floor((Math.min(vp.width, vp.height) - 1) / 2));
    const panned = r.outputs.some((o) => o.kind === "intent" && o.intent.type === "pan");
    const moved = JSON.stringify(after.focus) !== JSON.stringify(state.focus);
    if (moved) {
      // I5: after the focus intent and the appended reveal pan the focused element is within 1 px of the closed margin box; with no pan it was inside already
      const slack = panned ? 1 : 1e-6;
      expect(px).toBeGreaterThanOrEqual(m - slack); expect(px).toBeLessThanOrEqual(vp.width - m + slack);
      expect(py).toBeGreaterThanOrEqual(m - slack); expect(py).toBeLessThanOrEqual(vp.height - m + slack);
    }
  }
  return rep;
}
