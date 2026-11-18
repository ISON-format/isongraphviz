// The mutants harness (design 13.1 / 13.3 K): each mutant is a conformance subject built on the reference headless renderer with ONE rule broken.
// Every mutant must fail the check it names. (K37/K38 are corpus tampering, tested in kit.test.ts; K54 is a core-function mutant, see mutants.test.ts.)
import { createHeadlessRenderer } from "../../src/headless/index.js";
import { IgrError } from "../../src/errors.js";
import { initialState, serializeState } from "../../src/state.js";
import { divRound, floorDiv, fitBounds, defaultPadding, quantizeMilli, S, clampZoom } from "../../src/viewport.js";
import { reduce } from "../../src/reduce.js";
import { graphSummary, summaryText } from "../../src/a11y.js";
import type { ConformanceSubject } from "../../src/conformance/run.js";
import type { CapabilityManifest, ElementAddress, RenderModel, RenderReport, Renderer, RendererEnvironment, SemanticEvent, SemanticState } from "../../src/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = Omit<Partial<Renderer>, "dispatch"> & { dispatch?: (i: any) => readonly SemanticEvent[] };
export class Ctx {
  base: Renderer = createHeadlessRenderer();
  model: RenderModel | undefined;
  env: RendererEnvironment | undefined;
  /** Rewrites the environment handed to the inner renderer (listener mutants). */
  wrapEnv: (e: RendererEnvironment) => RendererEnvironment = (e) => e;
  statePatch: (s: SemanticState) => SemanticState = (s) => s;
  reportPatch: (r: RenderReport, c: Ctx) => RenderReport = (r) => r;
  stale: SemanticState["selection"] | undefined;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function subject(over: (c: Ctx) => Loose, manifest?: (m: CapabilityManifest) => CapabilityManifest): ConformanceSubject {
  const ref = createHeadlessRenderer().manifest;
  const mf = manifest ? manifest(clone(ref)) : ref;
  return {
    manifest: mf,
    create: async () => {
      const c = new Ctx();
      const r: Renderer = {
        manifest: mf,
        initialize: (e) => { c.env = e; return c.base.initialize(c.wrapEnv(e)); },
        loadScene: async (m, i) => { await c.base.loadScene(m, i); c.model = m; },
        applySceneDelta: (d) => c.base.applySceneDelta(d),
        dispatch: (i) => c.base.dispatch(i),
        getState: () => c.statePatch(c.base.getState()),
        hitTest: (p) => c.base.hitTest(p),
        setReducedMotion: (x) => c.base.setReducedMotion(x),
        render: () => c.base.render(),
        probe: () => { const rep = c.base.probe(); rep.state = c.statePatch(rep.state); return c.reportPatch(rep, c); },
        export: (f) => c.base.export(f),
        dispose: () => c.base.dispose(),
      };
      Object.assign(r, over(c) as Partial<Renderer>);
      return r;
    },
  };
}

const probeMut = (f: (rep: RenderReport, c: Ctx) => void) => (c: Ctx): Loose => { c.reportPatch = (rep) => { f(rep, c); return rep; }; return {}; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isAnyIntent = (i: unknown, type: string): i is any => typeof i === "object" && i !== null && (i as { type?: unknown }).type === type;

// ----- hit geometry mutant (a parameterized copy of the normative function) -----
export interface HitOpts {
  radius?: number; tol?: number; nodeOpen?: boolean; edgeOpen?: boolean; borderOpen?: boolean; rawBorder?: boolean; edgesFirst?: boolean; tieHighest?: boolean;
  pointer?: "k44" | "k45" | "k78"; pruneByEndpoints?: boolean;
}
export function mutatedHit(m: RenderModel, s: SemanticState, p: { x: number; y: number }, o: HitOpts): ElementAddress | undefined {
  const z = BigInt(s.viewport.zoom), vp = s.viewport;
  const q = (v: number): bigint => (o.pointer === "k78" ? BigInt((() => { const s = v * 1000, f = Math.floor(s); return s - f > 0.5 ? f + 1 : f; })()) * 1000n : o.pointer === "k44" ? BigInt(quantizeMilli(v * 1000)) * 1000n : o.pointer === "k45" ? BigInt(Math.round(v)) * 1_000_000n : BigInt(quantizeMilli(v)) * 1000n);
  const Px = q(p.x), Py = q(p.y);
  const W = BigInt(vp.width) * S, H = BigInt(vp.height) * S;
  if (o.rawBorder) { if (p.x < 0 || p.y < 0 || p.x > vp.width || p.y > vp.height) return undefined; }
  else if (o.borderOpen ? (Px <= 0n || Py <= 0n || Px >= W || Py >= H) : (Px < 0n || Py < 0n || Px > W || Py > H)) return undefined;
  const hidN = new Set(s.hidden.nodes.map((r) => r.id)), hidE = new Set(s.hidden.edges.map((e) => JSON.stringify(e)));
  const visN = m.nodes.map((n) => !hidN.has(n.ref.id));
  const X = m.nodes.map((n) => (BigInt(n.x) - BigInt(vp.center_x)) * z + BigInt(vp.width) * 500_000n), Y = m.nodes.map((n) => (BigInt(n.y) - BigInt(vp.center_y)) * z + BigInt(vp.height) * 500_000n);
  const R2 = (BigInt(o.radius ?? 12) * S) ** 2n, T2 = (BigInt(o.tol ?? 6) * S) ** 2n;
  const nodes = (): ElementAddress | undefined => {
    let best = -1, bd = 0n;
    m.nodes.forEach((_, i) => {
      if (!visN[i]) return;
      const dx = X[i]! - Px, dy = Y[i]! - Py, d = dx * dx + dy * dy;
      if (!(o.nodeOpen ? d < R2 : d <= R2)) return;
      if (best < 0 || (o.tieHighest ? d <= bd : d < bd)) { best = i; bd = d; }
    });
    return best >= 0 ? { node: { ...m.nodes[best]!.ref } } : undefined;
  };
  const edges = (): ElementAddress | undefined => {
    let best = -1, bn = 0n, bdn = 1n;
    m.edges.forEach((e, j) => {
      if (!visN[e.src] || !visN[e.tgt] || hidE.has(JSON.stringify(e.ref))) return;
      const Ax = X[e.src]!, Ay = Y[e.src]!, Bx = X[e.tgt]!, By = Y[e.tgt]!;
      if (Ax === Bx && Ay === By) return;
      if (o.pruneByEndpoints) { const near = (x: bigint, y: bigint) => Math.abs(Number(x - Px)) / 1e6 <= 7 && Math.abs(Number(y - Py)) / 1e6 <= 7; if (!near(Ax, Ay) && !near(Bx, By)) return; }
      const Dx = Bx - Ax, Dy = By - Ay, L2 = Dx * Dx + Dy * Dy, tn = (Px - Ax) * Dx + (Py - Ay) * Dy;
      if (tn <= 0n || tn >= L2) return;
      const cross = (Px - Ax) * Dy - (Py - Ay) * Dx, num = cross * cross;
      if (!(o.edgeOpen ? num < T2 * L2 : num <= T2 * L2)) return;
      if (best < 0 || (o.tieHighest ? num * bdn <= bn * L2 : num * bdn < bn * L2)) { best = j; bn = num; bdn = L2; }
    });
    return best >= 0 ? { edge: JSON.parse(JSON.stringify(m.edges[best]!.ref)) as never } : undefined;
  };
  return o.edgesFirst ? (edges() ?? nodes()) : (nodes() ?? edges());
}
const hitMutant = (o: HitOpts) => (c: Ctx): Loose => ({ hitTest: (p) => { const st = c.base.getState(); return mutatedHit(c.model!, st, p, o); } });

// ----- viewport mutants: compute a wrong viewport and install it through set-viewport (the event shape is the same) -----
function viewportMutant(compute: (st: SemanticState, intent: Record<string, any>, m: RenderModel) => { center_x: number; center_y: number; zoom: number } | undefined, only: string[]) {
  return (c: Ctx): Loose => ({
    dispatch: (intent) => {
      if (!only.some((t) => isAnyIntent(intent, t))) return c.base.dispatch(intent);
      const st = c.base.getState();
      const ref = reduce(c.model!, st, intent).state.viewport; // refuses what the reference refuses
      const mut = compute(st, intent as Record<string, any>, c.model!);
      if (!mut || (mut.center_x === ref.center_x && mut.center_y === ref.center_y && mut.zoom === ref.zoom)) return c.base.dispatch(intent);
      return c.base.dispatch({ type: "set-viewport", ...mut });
    },
  });
}
const trunc = (a: bigint, b: bigint): bigint => a / b;
const divRoundDown = (a: bigint, b: bigint): bigint => -divRound(-a, b); // ties toward minus infinity

// ----- traversal mutants -----
function focusMutant(order: (items: ElementAddress[]) => ElementAddress[], wrap: boolean) {
  return (c: Ctx): Loose => ({
    dispatch: (intent) => {
      if (!(isAnyIntent(intent, "focus-step") || isAnyIntent(intent, "focus-first") || isAnyIntent(intent, "focus-last"))) return c.base.dispatch(intent);
      const items = order(c.base.probe().accessible.items.map((i) => i.address));
      if (items.length === 0) return [];
      const st = c.base.getState();
      const key = (a: ElementAddress) => JSON.stringify(a);
      const at = st.focus ? items.findIndex((a) => key(a) === key(st.focus as ElementAddress)) : -1;
      let target: number;
      if (isAnyIntent(intent, "focus-first")) target = 0;
      else if (isAnyIntent(intent, "focus-last")) target = items.length - 1;
      else if (at < 0) target = intent["delta"] === 1 ? 0 : items.length - 1;
      else {
        target = at + (intent["delta"] as number);
        if (target < 0 || target >= items.length) {
          if (!wrap) return [{ type: "traversal-boundary", end: target < 0 ? "start" : "end" }];
          target = (target + items.length) % items.length;
        }
      }
      return c.base.dispatch({ type: "focus", target: items[target]! });
    },
  });
}

export const MUTANTS: Record<string, { check: string; subject: () => ConformanceSubject }> = {
  K02: { check: "CHK-ID", subject: () => subject(probeMut((r) => { r.drawn.nodes.pop(); })) },
  K03: { check: "CHK-ID", subject: () => subject(probeMut((r) => { r.drawn.nodes.push(r.drawn.nodes[0]!); })) },
  K04: { check: "CHK-ID", subject: () => subject(probeMut((r) => { r.drawn.nodes = r.drawn.nodes.map((_, i) => ({ id: String(i), type: "node" })); })) },
  K05: { check: "CHK-ID", subject: () => subject(probeMut((r) => { r.drawn.nodes.push({ id: "i:99999", type: "person" }); })) },
  K06: { check: "CHK-STATE", subject: () => subject(probeMut((r) => { r.scene_sha256 = "f".repeat(64); })) },
  K07: { check: "CHK-STATE", subject: () => subject(probeMut((r) => { r.state.selection.nodes.reverse(); r.marked.selected.nodes.reverse(); })) },
  K08: { check: "CHK-STATE", subject: () => subject((c) => {
    c.statePatch = (s) => (c.stale ? { ...s, selection: clone(c.stale) } : s);
    c.reportPatch = (r) => { if (c.stale) r.marked.selected = clone(c.stale); return r; };
    return { dispatch: (i) => {
      if (isAnyIntent(i, "set-hidden") && i["hidden"] === true) { const before = c.base.getState().selection; const ev = c.base.dispatch(i); c.stale = before; return ev; }
      if (isAnyIntent(i, "select") || isAnyIntent(i, "clear-selection")) c.stale = undefined;
      return c.base.dispatch(i);
    } };
  }) },
  K09: { check: "CHK-SEL", subject: () => subject((c) => ({ dispatch: (i) => c.base.dispatch(isAnyIntent(i, "select") && i["mode"] === "toggle" ? ({ ...i, mode: "add" } as never) : i) })) },
  K10: { check: "CHK-SEL", subject: () => subject((c) => ({ dispatch: (i) => c.base.dispatch(i).map((e) => (e.type === "selection-changed" ? ({ ...e, pointer: { x: 1, y: 2 } } as unknown as SemanticEvent) : e)) })) },
  K11: { check: "CHK-SEL", subject: () => subject((c) => ({ dispatch: (i) => c.base.dispatch(i).map((e) => (e.type === "selection-changed" ? { ...e, selection: e.selection.slice(-1) } : e)) })) },
  K12: { check: "CHK-FOCUS", subject: () => subject(probeMut((r) => { if (r.marked.focus) delete r.marked.focus; else r.marked.focus = { node: r.drawn.nodes[0]! }; })) },
  K13: { check: "CHK-FOCUS", subject: () => subject(focusMutant((items) => [...items.filter((a) => "edge" in a), ...items.filter((a) => "node" in a)], false)) },
  K14: { check: "CHK-FOCUS", subject: () => subject(focusMutant((items) => items, true)) },
  K15: { check: "CHK-LABEL", subject: () => subject(probeMut((r) => { for (const i of r.accessible.items) { i.name = i.name.trim(); if (i.description) i.description = i.description.trim(); } })) },
  K16: { check: "CHK-LABEL", subject: () => subject(probeMut((r) => { for (const i of r.accessible.items) i.name = i.name.normalize("NFC"); })) },
  K17: { check: "CHK-LABEL", subject: () => subject(probeMut((r) => { for (const i of r.accessible.items) delete i.description; })) },
  K18: { check: "CHK-LABEL", subject: () => subject(probeMut((r) => { r.accessible.summary = r.accessible.summary.replace(/\b1 node\b/, "1 nodes").replace(/\b1 edge\b/, "1 edges"); })) },
  K19: { check: "CHK-VIS", subject: () => subject(probeMut((r, c) => { r.drawn = { nodes: c.model!.nodes.map((n) => ({ ...n.ref })), edges: c.model!.edges.map((e) => JSON.parse(JSON.stringify(e.ref)) as never) }; })) },
  K20: { check: "CHK-VIS", subject: () => subject(probeMut((r, c) => { const hid = new Set(r.state.hidden.edges.map((e) => JSON.stringify(e))); r.drawn.edges = c.model!.edges.filter((e) => !hid.has(JSON.stringify(e.ref))).map((e) => JSON.parse(JSON.stringify(e.ref)) as never); })) },
  K21: { check: "CHK-VIEW", subject: () => subject((c) => ({ dispatch: (i) => c.base.dispatch(isAnyIntent(i, "pan") ? { ...i, dx: -i["dx"], dy: -i["dy"] } as never : i) })) },
  K22: { check: "CHK-VIEW", subject: () => subject((c) => {
    let override: number | undefined;
    c.statePatch = (s) => (override === undefined ? s : { ...s, viewport: { ...s.viewport, zoom: override } });
    return { dispatch: (i) => {
      if (isAnyIntent(i, "zoom")) { const z = BigInt(c.base.getState().viewport.zoom); const raw = divRound(z * BigInt(i["factor_milli"]), 1000n); const ev = c.base.dispatch(i); override = raw === clampZoom(raw) ? undefined : Number(raw); return ev; }
      if (isAnyIntent(i, "set-viewport") || isAnyIntent(i, "fit")) override = undefined;
      return c.base.dispatch(i);
    } };
  }) },
  K23: { check: "CHK-VIEW", subject: () => subject((c) => ({ dispatch: (i) => c.base.dispatch(isAnyIntent(i, "fit") ? { type: "fit" } : i) })) },
  K24: { check: "CHK-VIEW", subject: () => subject((c) => ({ dispatch: (i) => { const ev = c.base.dispatch(i); if (isAnyIntent(i, "resize")) return [...ev, ...c.base.dispatch({ type: "set-viewport", center_x: 0, center_y: 0, zoom: c.base.getState().viewport.zoom })]; return ev; } })) },
  K25: { check: "CHK-HIT", subject: () => subject(hitMutant({ radius: 11 })) },
  K26: { check: "CHK-HIT", subject: () => subject(hitMutant({ edgesFirst: true })) },
  K27: { check: "CHK-HIT", subject: () => subject(hitMutant({ tieHighest: true })) },
  K28: { check: "CHK-CAP", subject: () => subject(() => ({}), (m) => { (m.capabilities as Record<string, unknown>)["scene.apply-delta"] = { status: "supported" }; return m; }) },
  K29: { check: "CHK-CAP", subject: () => subject(probeMut((r) => { r.fidelity.labels = "elided"; })) },
  K30: { check: "CHK-CAP", subject: () => subject(probeMut((r) => { r.fidelity.motion = "full"; })) },
  K31: { check: "CHK-LIFE", subject: () => subject((c) => { let n = 0; return { initialize: async (e) => { if (++n > 1) return; await c.base.initialize(c.wrapEnv(e)); } }; }) },
  K32: { check: "CHK-LIFE", subject: () => subject((c) => { let n = 0; return { dispose: async () => { if (++n > 1) throw new IgrError("INVALID_LIFECYCLE", "DISPOSED"); await c.base.dispose(); } }; }) },
  K33: { check: "CHK-LIFE", subject: () => subject((c) => ({
    loadScene: async (m, i) => {
      try { await c.base.loadScene(m, i); c.model = m; }
      catch (e) { c.base = createHeadlessRenderer(); await c.base.initialize(c.wrapEnv(c.env!)); throw e; } // the failed load destroys the previous scene
    },
  })) },
  K34: { check: "CHK-LIFE", subject: () => subject((c) => { c.wrapEnv = (e) => ({ ...e, onEvent: (ev) => { e.onEvent?.(ev); e.onEvent?.(ev); } }); return {}; }) },
  K35: { check: "CHK-LIFE", subject: () => subject((c) => {
    const buffer: SemanticEvent[] = [];
    c.wrapEnv = (e) => ({ ...e, onEvent: (ev) => { buffer.push(ev); } });
    return { dispatch: (i) => { const ev = c.base.dispatch(i); for (const x of buffer.splice(0).reverse()) c.env?.onEvent?.(x); return ev; } };
  }) },
  K36: { check: "CHK-DELTA", subject: () => subject(() => ({ applySceneDelta: () => Promise.resolve(undefined as never) })) },
  K41: { check: "CHK-VIEW", subject: () => subject(viewportMutant((st, i) => ({ center_x: Number(BigInt(st.viewport.center_x) - trunc(BigInt(i["dx"]) * S, BigInt(st.viewport.zoom))), center_y: Number(BigInt(st.viewport.center_y) - trunc(BigInt(i["dy"]) * S, BigInt(st.viewport.zoom))), zoom: st.viewport.zoom }), ["pan"])) },
  K42: { check: "CHK-VIEW", subject: () => subject(viewportMutant((st, i) => ({ center_x: Number(BigInt(st.viewport.center_x) - divRoundDown(BigInt(i["dx"]) * S, BigInt(st.viewport.zoom))), center_y: Number(BigInt(st.viewport.center_y) - divRoundDown(BigInt(i["dy"]) * S, BigInt(st.viewport.zoom))), zoom: st.viewport.zoom }), ["pan"])) },
  K43: { check: "CHK-VIEW", subject: () => subject(viewportMutant((st, i) => {
    if (!i["anchor"]) return undefined;
    const z = BigInt(st.viewport.zoom), z2 = clampZoom(divRound(z * BigInt(i["factor_milli"]), 1000n));
    const u = 2n * BigInt(i["anchor"].x) - BigInt(st.viewport.width), v = 2n * BigInt(i["anchor"].y) - BigInt(st.viewport.height);
    return { center_x: Number(BigInt(st.viewport.center_x) + divRound(u * S * (z2 - z), 2n * z * z2)), center_y: Number(BigInt(st.viewport.center_y) + divRound(v * S * (z2 - z), 2n * z * z2)), zoom: Number(z2) }; // one rounding instead of two
  }, ["zoom"])) },
  K44: { check: "CHK-HIT", subject: () => subject(hitMutant({ pointer: "k44" })) },
  K45: { check: "CHK-HIT", subject: () => subject(hitMutant({ pointer: "k45" })) },
  K46: { check: "CHK-HIT", subject: () => subject(hitMutant({ nodeOpen: true })) },
  K47: { check: "CHK-HIT", subject: () => subject(hitMutant({ edgeOpen: true })) },
  K48: { check: "CHK-HIT", subject: () => subject(hitMutant({ tol: 5 })) },
  K49: { check: "CHK-HIT", subject: () => subject(hitMutant({ tol: 7 })) },
  K50: { check: "CHK-HIT", subject: () => subject(hitMutant({ borderOpen: true })) },
  K51: { check: "CHK-LABEL", subject: () => subject(probeMut((r, c) => { r.accessible.summary = summaryWithCap(c.model!, 9); })) },
  K52: { check: "CHK-LABEL", subject: () => subject(probeMut((r) => { r.accessible.summary = r.accessible.summary.replace(/and (\d+) more/, (_m, n: string) => `and ${Number(n) + 1} more`); })) },
  K53: { check: "CHK-LABEL", subject: () => subject(probeMut((r) => { r.accessible.status = r.accessible.status.replace(" selected,", " chosen,"); })) },
  K55: { check: "CHK-VIS", subject: () => subject((c) => {
    let hiddenSel: SemanticState["selection"] | undefined;
    return { dispatch: (i) => {
      if (isAnyIntent(i, "set-hidden") && i["hidden"] === true) { hiddenSel = c.base.getState().selection; return c.base.dispatch(i); }
      if (isAnyIntent(i, "set-hidden") && i["hidden"] === false && hiddenSel) {
        const ev = c.base.dispatch(i);
        const targets = [...hiddenSel.nodes.map((node) => ({ node })), ...hiddenSel.edges.map((edge) => ({ edge }))];
        return [...ev, ...c.base.dispatch({ type: "select", mode: "add", targets })]; // unhide restores the selection
      }
      return c.base.dispatch(i);
    } };
  }) },
  K56: { check: "CHK-FOCUS", subject: () => subject((c) => ({ dispatch: (i) => { try { return c.base.dispatch(i); } catch (e) { if (isAnyIntent(i, "focus") && e instanceof IgrError && e.reason === "ELEMENT_HIDDEN") return []; throw e; } } })) },
  K57: { check: "CHK-HIT", subject: () => subject(hitMutant({ pruneByEndpoints: true })) },
  K58: { check: "CHK-STATE", subject: () => subject((c) => ({
    loadScene: async (m, i) => {
      try { await c.base.loadScene(m, i); c.model = m; }
      catch (e) { if (e instanceof IgrError && e.reason === "DUPLICATE_ELEMENT") throw new IgrError("INVALID_STATE", "NON_CANONICAL"); throw e; } // ordering judged before integrity
    },
  })) },
  K59: { check: "CHK-STATE", subject: () => subject((c) => ({
    loadScene: async (m, i) => {
      try { await c.base.loadScene(m, i); c.model = m; }
      catch (e) { if (e instanceof IgrError && e.reason === "SCENE_MISMATCH") throw new IgrError("INVALID_STATE", "UNRESOLVED_ELEMENT"); throw e; } // binding judged last
    },
  })) },
  K60: { check: "CHK-SEL", subject: () => subject((c) => ({ dispatch: (i) => {
    if (isAnyIntent(i, "select") && i["mode"] === "remove") {
      const hid = new Set(c.base.getState().hidden.nodes.map((n) => n.id));
      if ((i["targets"] as { node?: { id: string } }[]).some((t) => t.node && hid.has(t.node.id))) throw new IgrError("INVALID_INTENT", "ELEMENT_HIDDEN");
    }
    return c.base.dispatch(i);
  } })) },
  K61: { check: "CHK-VIEW", subject: () => subject(viewportMutant((st, i, m) => {
    if (!m.bounds) return undefined;
    const p = i["padding"] ?? defaultPadding(st.viewport.width, st.viewport.height);
    return fitBounds(m.bounds, st.viewport.width, st.viewport.height, p); // all nodes, hidden or not
  }, ["fit"])) },
  K68: { check: "CHK-INTENT", subject: () => subject((c) => ({ dispatch: (i) => {
    try { return c.base.dispatch(i); }
    catch (e) {
      if (e instanceof IgrError && e.reason === "UNRESOLVED_ELEMENT") { // a malformed address reported as SCHEMA
        const ts = (i.targets ?? (i.target ? [i.target] : [])) as { node?: object; edge?: object }[];
        const malformed = (x: { node?: object; edge?: object }): boolean => {
          const inner = (x.node ?? x.edge) as Record<string, unknown> | undefined;
          return inner !== undefined && (Object.keys(inner).length !== (x.edge ? 4 : 2) || Object.values(inner).some((v) => typeof v !== "string" && typeof v !== "object"));
        };
        if (ts.some(malformed)) throw new IgrError("INVALID_INTENT", "SCHEMA");
      }
      throw e;
    }
  } })) },
  K69: { check: "CHK-INTENT", subject: () => subject((c) => ({ dispatch: (i) => { if (typeof i === "object" && i !== null && Object.keys(i).length === 0) throw new IgrError("INVALID_INTENT", "UNKNOWN_TYPE"); return c.base.dispatch(i); } })) },
  K72: { check: "CHK-VIEW", subject: () => subject((c) => {
    const trunc2 = (m: RenderModel, st: SemanticState) => (m.bounds ? { center_x: Number((BigInt(m.bounds.min_x) + BigInt(m.bounds.max_x)) / 2n), center_y: Number((BigInt(m.bounds.min_y) + BigInt(m.bounds.max_y)) / 2n), zoom: st.viewport.zoom } : undefined);
    return {
      loadScene: async (m, i) => { await c.base.loadScene(m, i); c.model = m; if (!i) { const mut = trunc2(m, c.base.getState()); if (mut) c.base.dispatch({ type: "set-viewport", ...mut }); } },
      dispatch: (i) => { if (!isAnyIntent(i, "fit")) return c.base.dispatch(i); const ev = c.base.dispatch(i); const st = c.base.getState(); const all = c.model!.nodes.every((_, k) => k >= 0); void all; const mut = trunc2(c.model!, st); return mut && !st.hidden.nodes.length ? [...ev, ...c.base.dispatch({ type: "set-viewport", ...mut })] : ev; },
    };
  }) },
  K73: { check: "CHK-STATE", subject: () => subject((c) => ({ loadScene: async (m, i) => { try { await c.base.loadScene(m, i); c.model = m; } catch (e) { if (e instanceof IgrError && e.reason === "SELECTED_HIDDEN") throw new IgrError("INVALID_STATE", "FOCUS_HIDDEN"); throw e; } } })) },
  K74: { check: "CHK-LIFE", subject: () => subject((c) => ({ loadScene: async (m, i) => { const cap = c.base.manifest.capacity; if (m.nodes.length >= cap.maxNodes) throw new IgrError("RESOURCE_LIMIT", "NODE_LIMIT"); if (m.edges.length >= cap.maxEdges) throw new IgrError("RESOURCE_LIMIT", "EDGE_LIMIT"); await c.base.loadScene(m, i); c.model = m; } })) },
  K75: { check: "CHK-STATE", subject: () => subject((c) => ({ loadScene: async (m, i) => { try { await c.base.loadScene(m, i); c.model = m; } catch (e) { if (e instanceof IgrError && e.reason === "INVALID_STRING") throw new IgrError("INVALID_STATE", "UNRESOLVED_ELEMENT"); throw e; } } })) },
  K76: { check: "CHK-INTENT", subject: () => subject((c) => ({ dispatch: (i) => {
    const lim = c.env?.limits?.maxSceneBytes;
    if (lim !== undefined && Array.isArray(i?.targets)) { let units = 0; const walk = (v: unknown): void => { if (typeof v === "string") units += v.length; else if (typeof v === "object" && v !== null) Object.values(v).forEach(walk); }; walk(i.targets); if (units === lim) throw new IgrError("RESOURCE_LIMIT", "TARGET_LIMIT"); }
    return c.base.dispatch(i);
  } })) },
  K78: { check: "CHK-HIT", subject: () => subject(hitMutant({ pointer: "k78" })) },
  K80: { check: "CHK-STATE", subject: () => subject((c) => ({ loadScene: async (m, i) => { try { await c.base.loadScene(m, i); c.model = m; } catch (e) { if (e instanceof IgrError && e.code === "INVALID_STATE" && e.reason === "INVALID_VALUE") throw new IgrError("INVALID_STATE", "UNRESOLVED_ELEMENT"); throw e; } } })) },
  K81: { check: "CHK-LIFE", subject: () => subject((c) => ({ initialize: async (e) => { c.env = e; try { await c.base.initialize(c.wrapEnv(e)); } catch (err) { if (err instanceof IgrError && err.code === "INVALID_INPUT" && err.reason === "INVALID_VALUE") { const { limits: _l, ...rest } = e; void _l; await c.base.initialize(c.wrapEnv(rest as RendererEnvironment)); return; } throw err; } } })) },
  K82: { check: "CHK-LABEL", subject: () => subject(probeMut((r, c) => { const s = graphSummary(c.model!); s.categories.sort((x, y) => (x.category < y.category ? -1 : x.category > y.category ? 1 : 0)); r.accessible.summary = summaryText(s); })) },
  K62: { check: "CHK-HIT", subject: () => subject(hitMutant({ rawBorder: true })) },
};

function summaryWithCap(m: RenderModel, cap: number): string {
  const s = graphSummary(m);
  const noun = (n: number, a: string, b: string) => (n === 1 ? a : b);
  let t = `${s.directed ? "Directed" : "Undirected"} graph with ${s.nodes} ${noun(s.nodes, "node", "nodes")} and ${s.edges} ${noun(s.edges, "edge", "edges")}.`;
  if (s.nodes > 0) {
    let list = s.categories.slice(0, cap).map((c) => `${c.category} (${c.count})`).join(", ");
    if (s.categories.length > cap) list += `, and ${s.categories.length - cap} more`;
    t += ` Node categories: ${list}.`;
  }
  return t;
}

/** K39 replays the public vectors and ignores anything else (it must pass every file-driven vector and be caught by D). */
const key = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x));
export function canned(corpus: { files: ReadonlyMap<string, Uint8Array> }): ConformanceSubject {
  const intents = new Set<string>(), points = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach((x) => walk(x)); return; }
    if (typeof v === "object" && v !== null) {
      for (const [k, x] of Object.entries(v)) {
        if (k === "intent" || (k === "arg" && typeof x === "object" && x !== null && "type" in (x as object))) intents.add(key(x));
        if (k === "x" && "y" in (v as object)) points.add(key([x, (v as { y: unknown }).y]));
        walk(x);
      }
    }
  };
  intents.add(key({ type: "clear-selection" })); // issued by the L20 listener itself
  for (const [path, bytes] of corpus.files) if (/\.(script|hits)\.json$/.test(path)) { try { walk(JSON.parse(new TextDecoder().decode(bytes))); } catch { /* skip */ } }
  return subject((c) => ({
    dispatch: (i) => (intents.has(key(i)) || !isOrdinary(i) ? c.base.dispatch(i) : []),
    hitTest: (p) => (points.has(key([p.x, p.y])) || !Number.isFinite(p.x) || !Number.isFinite(p.y) ? c.base.hitTest(p) : undefined),
  }));
}
const isOrdinary = (i: unknown): boolean => typeof i === "object" && i !== null && typeof (i as { type?: unknown }).type === "string" && [
  "select", "clear-selection", "focus", "focus-step", "focus-first", "focus-last", "set-hidden", "pan", "zoom", "fit", "set-viewport", "resize"].includes((i as { type: string }).type);

/** K40 diverges only on input a public vector never uses: zoom factors from 3001 to 4000. */
export function divergesOnRandom(): ConformanceSubject {
  return subject((c) => ({ dispatch: (i) => c.base.dispatch(isAnyIntent(i, "zoom") && i["factor_milli"] > 3000 && i["factor_milli"] <= 4000 ? { ...i, factor_milli: 3000 } as never : i) }));
}
void initialState; void floorDiv;

