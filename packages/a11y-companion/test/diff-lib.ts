// The bodies of the D rows of design 15.5 that belong to a11y-companion (runtime tier, caller-supplied seeds, recorded in the test names; the LCG of IGL/1 7.1
// through test/gen.ts):
//   D04  companion items equal buildAccessibleModel(model, state).items in name, description and order, and the window invariants (focus and tab stop present,
//        at most count + 2 items, exactly one tabindex 0);
//   D05  the gate passes (G8 info) on every tree built from a random reachable state, and fails with the expected finding on each of ten random perturbations;
//   D06  invariant I-C1: executing plan(prev, next) on a simulated DOM that already holds the full build of prev gives the DOM of a full build of next, on
//        random state pairs (and window variants).
// Test-only code: nothing here is imported by src/.
import { expect } from "vitest";
import { IgrError, buildAccessibleModel, initialState, reduce, type ElementAddress, type Intent, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import * as ia from "../src/index.js";
import { lcg, randomModel, type Rng } from "./gen.js";
import { invariantHolds, type Impl } from "./oracle/runner.js";

const SIZE = { width: 640, height: 480 };
const impl = ia as unknown as Impl;
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
      : { type: "focus-step", delta: rng.pick([1, -1] as const) };
    try { s = reduce(model, s, intent).state; } catch (e) { if (!(e instanceof IgrError)) throw e; }
  }
  return s;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const codes = (r: { checks: { id: string; findings: { code: string }[] }[] }, id: string): string[] => r.checks.find((c) => c.id === id)!.findings.map((f) => f.code);

export async function d04(seed: number, trials: number, opts: { hostile?: boolean; maxNodes?: number } = {}): Promise<{ trials: number }> {
  const rng = lcg(seed);
  const model = await randomModel(seed, opts);
  for (let t = 0; t < trials; t++) {
    const state = randomState(model, rng);
    const am = buildAccessibleModel(model, state);
    const n = am.items.length;
    const windows: unknown[] = ["auto", "all", { first: 1 + rng.int(Math.max(1, n)), count: rng.int(6) }];
    for (const window of windows) {
      const tree = ia.buildCompanionTree(model, state, { window: window as never });
      expect(tree.list.set_size).toBe(n);
      const fpos = am.items.find((i) => i.focused)?.position;
      const stop = n === 0 ? undefined : fpos ?? 1;
      const positions = tree.items.map((i) => i.position);
      expect(positions, "ascending, each once").toEqual([...new Set(positions)].sort((a, b) => a - b));
      for (const it of tree.items) {
        const k = am.items[it.position - 1]!;
        expect({ name: it.name, description: it.description, address: it.address }).toEqual({ name: k.name, description: k.description, address: k.address });
        expect(it.selected).toBe(k.selected);
        expect(it.tabindex).toBe(it.position === stop ? 0 : -1);
      }
      expect(tree.items.filter((i) => i.tabindex === 0).length).toBe(n === 0 ? 0 : 1);
      if (fpos !== undefined) expect(positions).toContain(fpos);
      if (stop !== undefined) expect(positions).toContain(stop);
      expect(tree.items.length).toBeLessThanOrEqual(tree.list.window.count + 2);
      expect(ia.verifyCompanionTree(model, state, JSON.parse(JSON.stringify(tree)))).toBeDefined();
    }
  }
  return { trials };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Perturb = { name: string; code: string; check: string; apply(t: any): boolean };
const PERTURBATIONS: Perturb[] = [
  { name: "empty name", code: "NAME_EMPTY", check: "G2-NAME", apply: (t: any) => { if (t.items.length === 0) return false; t.items[0].name = ""; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "altered name", code: "NAME_MISMATCH", check: "G2-NAME", apply: (t: any) => { if (t.items.length === 0) return false; t.items[0].name += "!"; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "second tab stop", code: "TABSTOP_COUNT", check: "G3-TRAP", apply: (t: any) => { const o = t.items.find((i: any) => i.tabindex === -1); if (!o) return false; o.tabindex = 0; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "set size", code: "SETSIZE_WRONG", check: "G1-REACH", apply: (t: any) => { t.list.set_size += 1; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "assertive", code: "LIVE_NOT_POLITE", check: "G7-LIVE", apply: (t: any) => { t.live.politeness = "assertive"; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "empty summary", code: "SUMMARY_MISSING", check: "G6-TEXT", apply: (t: any) => { t.container.name = ""; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "status", code: "STATUS_MISMATCH", check: "G6-TEXT", apply: (t: any) => { t.container.description += "x"; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "role", code: "ROLE_MISSING", check: "G2-NAME", apply: (t: any) => { if (t.items.length === 0) return false; t.items[0].roledescription = ""; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "selected", code: "SELECTED_WRONG", check: "G2-NAME", apply: (t: any) => { if (t.items.length === 0) return false; t.items[0].selected = !t.items[0].selected; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: "no live", code: "LIVE_MISSING", check: "G7-LIVE", apply: (t: any) => { delete t.live; return true; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
];

export async function d05(seed: number, trials: number, opts: { hostile?: boolean; maxNodes?: number } = {}): Promise<{ trials: number; perturbed: number }> {
  const rng = lcg(seed);
  const model = await randomModel(seed, opts);
  let perturbed = 0;
  for (let t = 0; t < trials; t++) {
    const state = randomState(model, rng);
    const tree = clone(ia.buildCompanionTree(model, state));
    const gateOf = (tr: unknown): ReturnType<typeof ia.runAccessibilityGate> => ia.runAccessibilityGate({ model, state, tree: tr as never, fidelity: { motion: "none" }, reducedMotion: true, tabStops: tree.items.length === 0 ? 0 : 1 });
    const ok = gateOf(tree);
    // a random viewport may legitimately put the focus off-screen (G12-VIEW, expected: the user asked for that view); nothing else may fail
    expect(ok.checks.filter((c) => c.verdict === "fail").map((c) => c.id).filter((id) => id !== "G12-VIEW"), JSON.stringify(ok.checks.filter((c) => c.verdict === "fail"))).toEqual([]);
    expect(ok.checks.find((c) => c.id === "G8-TARGET")!.verdict).toBe("info");
    for (let k = 0; k < 10; k++) {
      const p = rng.pick(PERTURBATIONS);
      const bad = clone(tree);
      if (!p.apply(bad)) continue;
      const r = gateOf(bad);
      perturbed++;
      expect(r.verdict, p.name).toBe("fail");
      expect(codes(r, p.check), p.name).toContain(p.code);
    }
  }
  return { trials, perturbed };
}

export async function d06(seed: number, trials: number, opts: { hostile?: boolean; maxNodes?: number } = {}): Promise<{ trials: number }> {
  const rng = lcg(seed);
  const model = await randomModel(seed, opts);
  for (let t = 0; t < trials; t++) {
    const a = randomState(model, rng), b = randomState(model, rng);
    const wa = rng.pick(["auto", { first: 1 + rng.int(4), count: rng.int(5) }] as const), wb = rng.pick(["auto", { first: 1 + rng.int(4), count: rng.int(5) }] as const);
    const prev = clone(ia.buildCompanionTree(model, a, { window: wa as never, events: [] }));
    const next = clone(ia.buildCompanionTree(model, b, { window: wb as never, events: rng.int(2) === 0 ? [{ type: "selection-changed", selection: [] }] : [] }));
    // the planner only claims the invariant for trees whose retained items keep their order: items of one model always do
    expect(invariantHolds(impl, prev, next), `trial ${t}`).toBe(true);
    expect(invariantHolds(impl, next, next)).toBe(true);
  }
  return { trials };
}
