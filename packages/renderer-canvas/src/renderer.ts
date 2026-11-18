// src/renderer.ts - the headless Canvas renderer (design 6.5). createCanvasRenderer COMPOSES createHeadlessRenderer of renderer-core: every Renderer
// method is the inner one, called and returned unchanged, except the three differences of 6.5: `manifest`, `probe()` (fidelity only) and the extra
// methods displayList(), displayListBytes(), canvasCalls(), pick(), elementBounds() and status().
import { IgrError, isRenderModel } from "isongraph-visualize-renderer-core";
import type { Degradation, ElementAddress, ExportFormat, Intent, RenderModel, RenderReport, Renderer, RendererEnvironment, SemanticState } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import {
  buildDisplayList, dryLabelPass, elementBounds as boundsOf, pickerFromList, serializeDisplayList,
} from "isongraph-visualize-display-list";
import type { DisplayList, ElementBox } from "isongraph-visualize-display-list";
import { recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import { buildManifest } from "./manifest.js";
import { resolveRendererOptions, type CanvasRendererOptions, type Host, type ResolvedCanvasOptions } from "./options.js";

export interface CanvasStatus { phase: "created" | "initialized" | "ready" | "disposed"; failure?: string }
export type CanvasRenderer = Renderer & {
  displayList(): DisplayList;
  displayListBytes(): Uint8Array;
  canvasCalls(): Uint8Array;
  pick(point: { x: number; y: number }): ElementAddress | undefined;
  elementBounds(): ElementBox[];
  status(): CanvasStatus;
};

export interface Composed {
  renderer: CanvasRenderer;
  /** The RESOLVED options (host defaults applied): what the list, the stream and the probe use; the DOM adapter must replay with the same. */
  options: ResolvedCanvasOptions;
  /** The model of the committed state (internal, for the DOM adapter's pointer step). */
  modelOf(state: SemanticState): RenderModel;
  /** Number of models the wrapper holds (registry); internal, for the eviction test. */
  registrySize(): number;
}

/** The composed renderer (6.5), shared by createCanvasRenderer and the DOM adapter (which passes host "dom"). */
export function composeCanvasRenderer(host: Host, options?: CanvasRendererOptions): Composed {
  const r = resolveRendererOptions(host, options);
  const manifest = buildManifest(host, r);
  const inner = createHeadlessRenderer({ name: r.name, version: r.version, capacity: r.capacity });
  let phase: CanvasStatus["phase"] = "created";

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

  const renderer: CanvasRenderer = {
    manifest,
    async initialize(env: RendererEnvironment): Promise<void> { await inner.initialize(env); phase = "initialized"; },
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
      return p.then(() => { settle(k, true); phase = "ready"; }, (err: unknown) => { settle(k, false); throw err; });
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
    displayListBytes(): Uint8Array { return serializeDisplayList(renderer.displayList(), { maxBytes: r.maxDlBytes }); },
    canvasCalls(): Uint8Array { return recordCanvasCalls(renderer.displayList(), { dprMilli: r.dprMilli, ink: r.ink }); },
    pick(point: { x: number; y: number }): ElementAddress | undefined {
      const { model, state } = committed();
      // the picker of the list this renderer builds from the committed state (5.2: bound by construction; audit M-3)
      return pickerFromList(model, state, buildDisplayList(model, state, r.dl)).pick(point);
    },
    elementBounds(): ElementBox[] { return boundsOf(renderer.displayList()); },
    status(): CanvasStatus { return { phase }; },
  };
  return { renderer, options: r, modelOf, registrySize: () => registry.size };
}

/** The headless Canvas renderer: the backend is the recording context (`canvasCalls()`). */
export function createCanvasRenderer(options?: CanvasRendererOptions): CanvasRenderer {
  return composeCanvasRenderer("headless", options).renderer;
}
