// src/renderer.ts - the manifest, the headless renderer that also yields SVG, and the conformance subject (design 12).
// createSvgRenderer COMPOSES createHeadlessRenderer of renderer-core: every Renderer method is the inner one, called and returned unchanged,
// except the three additions of 12.1: `manifest`, `probe()` (fidelity only) and `svg()`.
import { IgrError, effectiveVisibility, isRenderModel, verifyManifest } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import type { CapabilityManifest, CapabilityStatus, Degradation, ElementAddress, ExportFormat, Intent, RenderModel, RenderReport, Renderer, RendererEnvironment, SemanticState } from "isongraph-visualize-renderer-core";
import type { ConformanceSubject, WitnessReport } from "isongraph-visualize-renderer-core";
import { DEFAULT_SVG_LIMITS } from "./constants.js";
import { resolveOptions, type SvgOptions } from "./options.js";
import { svgWitness } from "./read.js";
import { planLabels, renderSvg } from "./write.js";

export type SvgRenderer = Renderer & { svg(): string };
export interface SvgRendererOptions { name?: string; version?: string; capacity?: Partial<CapabilityManifest["capacity"]>; svg?: SvgOptions }
export type Host = "headless" | "dom";

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);
const isPlain = (v: unknown): boolean => { if (typeof v !== "object" || v === null || Array.isArray(v)) return false; const p: unknown = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const LIMIT_MAX = 2 ** 31; // the range of svg.maxDrawnLabelUnits (2.1); the one label-budget value of 12.2 is checked against it at creation

const HOST_DEFAULTS: Record<Host, { maxNodes: number; maxEdges: number; maxDrawnLabelUnits: number; maxSvgBytes: number }> = {
  headless: { maxNodes: 20_000, maxEdges: 40_000, maxDrawnLabelUnits: 1_048_576, maxSvgBytes: DEFAULT_SVG_LIMITS.maxSvgBytes },
  dom: { maxNodes: 2_000, maxEdges: 4_000, maxDrawnLabelUnits: 262_144, maxSvgBytes: 8_388_608 },
};

export interface Resolved { name: string; version: string; capacity: { maxNodes: number; maxEdges: number; maxDrawnLabelUnits: number }; svg: SvgOptions }

/** Validates SvgRendererOptions for a host and fixes the one label budget value (12.2). */
export function resolveRendererOptions(host: Host, options: unknown): Resolved {
  const d = HOST_DEFAULTS[host];
  if (options !== undefined && !isPlain(options)) throw bad("SCHEMA", "options", "plain object expected");
  const o = (options ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(o)) if (o[k] !== undefined && !["name", "version", "capacity", "svg"].includes(k)) throw bad("SCHEMA", `options.${k}`, "unknown option");
  const svgRaw: unknown = o["svg"];
  const svg = resolveOptions(svgRaw);
  const givenSvg = typeof svgRaw === "object" && svgRaw !== null && (svgRaw as Record<string, unknown>)["maxDrawnLabelUnits"] !== undefined;
  const givenSvgBytes = typeof svgRaw === "object" && svgRaw !== null && (svgRaw as Record<string, unknown>)["maxSvgBytes"] !== undefined;
  const capRaw: unknown = o["capacity"];
  if (capRaw !== undefined && !isPlain(capRaw)) throw bad("SCHEMA", "options.capacity", "plain object expected");
  const cap = (capRaw ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(cap)) if (cap[k] !== undefined && !["maxNodes", "maxEdges", "maxDrawnLabelUnits"].includes(k)) throw bad("SCHEMA", `options.capacity.${k}`, "unknown capacity member");
  const num = (k: string, v: unknown, dflt: number): number => {
    if (v === undefined) return dflt;
    if (typeof v !== "number") throw bad("SCHEMA", `options.capacity.${k}`, "number expected");
    if (!Number.isFinite(v)) throw bad("NOT_FINITE", `options.capacity.${k}`);
    if (!Number.isInteger(v)) throw bad("INVALID_VALUE", `options.capacity.${k}`);
    return v;
  };
  const capUnits = cap["maxDrawnLabelUnits"] === undefined ? undefined : num("maxDrawnLabelUnits", cap["maxDrawnLabelUnits"], 0);
  if (capUnits !== undefined && (capUnits < 0 || capUnits > LIMIT_MAX)) throw bad("OUT_OF_RANGE", "options.capacity.maxDrawnLabelUnits");
  if (capUnits !== undefined && givenSvg && capUnits !== svg.maxDrawnLabelUnits) throw bad("INVALID_VALUE", "options.capacity.maxDrawnLabelUnits", "must equal svg.maxDrawnLabelUnits");
  const units = capUnits ?? (givenSvg ? svg.maxDrawnLabelUnits : d.maxDrawnLabelUnits);
  const name = o["name"] === undefined ? "svg-renderer" : o["name"];
  const version = o["version"] === undefined ? "0.0.0" : o["version"];
  if (typeof name !== "string" || typeof version !== "string") throw bad("SCHEMA", "options", "name and version must be strings");
  const outSvg: SvgOptions = { idPrefix: svg.idPrefix, style: svg.style, labels: svg.labels, edgeLabels: svg.edgeLabels, xmlDeclaration: svg.xmlDeclaration, maxDrawnLabelUnits: units, maxSvgBytes: givenSvgBytes ? svg.maxSvgBytes : d.maxSvgBytes };
  return { name, version, capacity: { maxNodes: num("maxNodes", cap["maxNodes"], d.maxNodes), maxEdges: num("maxEdges", cap["maxEdges"], d.maxEdges), maxDrawnLabelUnits: units }, svg: outSvg };
}

const SUPPORTED: CapabilityStatus = { status: "supported" };
const NOT_IMPL: CapabilityStatus = { status: "unsupported", reason: "NOT_IMPLEMENTED" };

/** The capability manifest for a host and options (12.2); it depends on `svg.labels` and `svg.edgeLabels` only, never on `svg.style`. */
export function svgManifest(host: Host, options?: SvgRendererOptions): CapabilityManifest {
  if (host !== "headless" && host !== "dom") throw bad("SCHEMA", "host", "headless or dom expected");
  return buildManifest(host, resolveRendererOptions(host, options));
}

function buildManifest(host: Host, r: Resolved): CapabilityManifest {
  const edgeOff = r.svg.labels === false || r.svg.edgeLabels === false;
  const labelsEdge: CapabilityStatus = edgeOff ? { status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] } : SUPPORTED;
  return verifyManifest({
    igr: "IGR/1", renderer: { name: r.name, version: r.version, host },
    capabilities: {
      "scene.load": SUPPORTED, viewport: SUPPORTED, "hit-test": SUPPORTED, selection: SUPPORTED, focus: SUPPORTED, visibility: SUPPORTED,
      labels: { status: "degraded", degradations: ["LABELS_ELIDED"] }, "direction-cue": SUPPORTED, "indicators.non-color": SUPPORTED,
      "a11y.model": SUPPORTED, "state.report": SUPPORTED, lifecycle: SUPPORTED,
      "export.scene": SUPPORTED, "export.svg": NOT_IMPL, "export.png": NOT_IMPL,
      "a11y.native-dom": host === "dom" ? SUPPORTED : NOT_IMPL, "a11y.companion-dom": NOT_IMPL,
      "labels.edge": labelsEdge, "motion.animated": NOT_IMPL, "scene.apply-delta": { status: "unsupported", reason: "RESERVED" },
    },
    capacity: r.capacity,
  });
}

export interface Composed {
  renderer: SvgRenderer;
  /** The RESOLVED svg options (host defaults applied): what svg() renders with; the DOM adapter must render with the same. */
  svgOptions: SvgOptions;
  /** Number of models the wrapper holds (12.1 registry); internal, for the eviction test. */
  registrySize(): number;
}

/** The composed renderer (12.1), shared by createSvgRenderer and the DOM adapter (which passes host "dom"). */
export function composeSvgRenderer(host: Host, options?: SvgRendererOptions): Composed {
  const r = resolveRendererOptions(host, options);
  const manifest = buildManifest(host, r);
  const inner = createHeadlessRenderer({ name: r.name, version: r.version, capacity: r.capacity });
  const svgOptions = r.svg;

  // models by the (scene, layout) hash pair of 12.1; entries of unsettled loads live until they settle
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

  const renderer: SvgRenderer = {
    manifest,
    initialize: (env: RendererEnvironment) => inner.initialize(env),
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
      const model = modelOf(rep.state);
      const vis = effectiveVisibility(model, rep.state);
      const plan = planLabels(model, vis.nodes, vis.edges, svgOptions.labels !== false, svgOptions.edgeLabels !== false, svgOptions.maxDrawnLabelUnits!);
      const degradations: Degradation[] = [];
      if (!plan.fidelity.edge_labels) degradations.push("EDGE_LABELS_OMITTED");
      if (plan.fidelity.labels === "elided") degradations.push("LABELS_ELIDED");
      return { ...rep, fidelity: { labels: plan.fidelity.labels, edge_labels: plan.fidelity.edge_labels, motion: "none", degradations } };
    },
    export: (format: ExportFormat) => inner.export(format),
    dispose: () => inner.dispose().then(() => { registry.clear(); current = undefined; }),
    svg(): string {
      const state = inner.getState(); // raises exactly the lifecycle error getState() raises, BUSY included
      return renderSvg(modelOf(state), state, svgOptions);
    },
  };
  return { renderer, svgOptions, registrySize: () => registry.size };
}

export function createSvgRenderer(options?: SvgRendererOptions): SvgRenderer {
  return composeSvgRenderer("headless", options).renderer;
}

/** The kit subject (12.5): `create` returns an uninitialized renderer; `witness` reads the document the renderer actually produces. */
export function createSvgSubject(options?: SvgRendererOptions): ConformanceSubject {
  const manifest = svgManifest("headless", options);
  return {
    manifest,
    create: async () => createSvgRenderer(options),
    witness: async (r: Renderer): Promise<WitnessReport> => {
      const svg = (r as { svg?: unknown }).svg;
      if (typeof svg !== "function") throw bad("SCHEMA", "renderer", "a renderer with svg() expected");
      return svgWitness((svg as () => string).call(r)) as WitnessReport;
    },
  };
}
