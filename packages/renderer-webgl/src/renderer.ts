// src/renderer.ts - the headless WebGL renderer (design 6.5, 7.8). createWebglRenderer COMPOSES createHeadlessRenderer of renderer-core: every Renderer method
// is the inner one, called and returned unchanged, except the three differences: `manifest`, `probe()` (fidelity only) and the extra methods displayList(),
// plan(), planBytes(), textCalls(), pick(), elementBounds() and status(). The backend of the headless host is the plan; no GPU is exercised.
import { IgrError, isRenderModel } from "isongraph-visualize-renderer-core";
import type { Degradation, ElementAddress, ExportFormat, Intent, RenderModel, RenderReport, Renderer, RendererEnvironment, SemanticState } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import { buildDisplayList, dryLabelPass, elementBounds as boundsOf, pickerFromList } from "isongraph-visualize-display-list";
import type { DisplayList, ElementBox } from "isongraph-visualize-display-list";
import { recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import type { GlStatus } from "./control.js";
import { buildManifest } from "./manifest.js";
import { resolveRendererOptions, type Host, type ResolvedWebglOptions, type WebglRendererOptions } from "./options.js";
import { planGl, serializePlan, type GlPlan } from "./plan.js";

export type WebglRenderer = Renderer & {
  displayList(): DisplayList;
  plan(): GlPlan;
  planBytes(): Uint8Array;
  textCalls(): Uint8Array;
  pick(point: { x: number; y: number }): ElementAddress | undefined;
  elementBounds(): ElementBox[];
  status(): GlStatus;
};

export interface Composed {
  renderer: WebglRenderer;
  /** The RESOLVED options (host defaults applied): what the list, the plan and the probe use; the DOM adapter must draw with the same. */
  options: ResolvedWebglOptions;
  /** The model of the committed state (internal, for the DOM adapter's pointer step). */
  modelOf(state: SemanticState): RenderModel;
  /** Number of models the wrapper holds (registry); internal, for the eviction test. */
  registrySize(): number;
}

/** The composed renderer (6.5), shared by createWebglRenderer and the DOM adapter (which passes host "dom"). */
export function composeWebglRenderer(host: Host, options?: WebglRendererOptions): Composed {
  const r = resolveRendererOptions(host, options);
  const manifest = buildManifest(host, r);
  const inner = createHeadlessRenderer({ name: r.name, version: r.version, capacity: r.capacity });
  let phase: GlStatus["phase"] = "created";

  // models by the (scene, layout) hash pair; entries of unsettled loads live until they settle (as 30 12.1)
  const registry = new Map<string, { model: RenderModel; unsettled: number }>();
  let current: string | undefined;
  const settle = (key: string, ok: boolean): void => {
    const e = registry.get(key);
    if (e) e.unsettled--;
    if (ok) current = key;
    for (const [k, v] of [...registry]) if (v.unsettled <= 0 && k !== current) registry.delete(k);
  };
  const modelOf = (state: SemanticState): RenderModel => {
    const e = registry.get(state.scene_sha256 + ":" + state.layout_sha256);
    if (!e) throw new IgrError("INVALID_LIFECYCLE", "NOT_LOADED");
    return e.model;
  };
  const committed = (): { model: RenderModel; state: SemanticState } => {
    const state = inner.getState(); // raises exactly the lifecycle error getState() raises, BUSY included
    return { model: modelOf(state), state };
  };

  const renderer: WebglRenderer = {
    manifest,
    async initialize(env: RendererEnvironment): Promise<void> { await inner.initialize(env); phase = "ready"; },
    loadScene(model: RenderModel, initial?: SemanticState): Promise<void> {
      let key: string | undefined;
      if (isRenderModel(model)) {
        key = model.sceneSha256 + ":" + model.layoutSha256;
        const e = registry.get(key);
        if (e) e.unsettled++; else registry.set(key, { model, unsettled: 1 });
      }
      const p = inner.loadScene(model, initial);
      if (key === undefined) return p;
      const k = key;
      return p.then(() => { settle(k, true); }, (err: unknown) => { settle(k, false); throw err; });
    },
    applySceneDelta: (delta: unknown) => inner.applySceneDelta(delta),
    dispatch: (intent: Intent) => inner.dispatch(intent),
    getState: () => inner.getState(),
    hitTest: (point: { x: number; y: number }): ElementAddress | undefined => inner.hitTest(point),
    setReducedMotion: (reduced: boolean) => inner.setReducedMotion(reduced),
    render: () => inner.render(),
    probe(): RenderReport {
      const rep = inner.probe();
      const plan = dryLabelPass(modelOf(rep.state), rep.state, r.dl);
      const degradations: Degradation[] = [];
      if (!plan.edge_labels) degradations.push("EDGE_LABELS_OMITTED");
      if (plan.labels === "elided") degradations.push("LABELS_ELIDED");
      return { ...rep, fidelity: { labels: plan.labels, edge_labels: plan.edge_labels, motion: "none", degradations } };
    },
    export: (format: ExportFormat) => inner.export(format),
    dispose: () => inner.dispose().then(() => { registry.clear(); current = undefined; phase = "disposed"; }),
    displayList(): DisplayList {
      const { model, state } = committed();
      return buildDisplayList(model, state, r.dl);
    },
    plan(): GlPlan { return planGl(renderer.displayList(), { maxBytes: r.maxGlBytes }); },
    planBytes(): Uint8Array { return serializePlan(renderer.plan()); },
    textCalls(): Uint8Array { return recordCanvasCalls(renderer.plan().textSource, { layers: [8], dprMilli: r.dprMilli, ink: r.ink }); },
    pick(point: { x: number; y: number }): ElementAddress | undefined {
      const { model, state } = committed();
      return pickerFromList(model, state, buildDisplayList(model, state, r.dl)).pick(point); // the renderer's own list, built with its own options (audit I-1)
    },
    elementBounds(): ElementBox[] { return boundsOf(renderer.displayList()); },
    status(): GlStatus { return { phase, contextLost: false, attributes: { failIfMajorPerformanceCaveat: r.failIfMajorPerformanceCaveat } }; },
  };
  return { renderer, options: r, modelOf, registrySize: () => registry.size };
}

/** The headless WebGL renderer: the backend is the plan (`plan()`, `planBytes()`); no GPU is exercised. */
export function createWebglRenderer(options?: WebglRendererOptions): WebglRenderer {
  return composeWebglRenderer("headless", options).renderer;
}
