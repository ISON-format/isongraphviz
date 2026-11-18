// src/headless/index.ts - createHeadlessRenderer: the DOM-free reference Renderer. It draws nothing, delegates every transition to
// `reduce` and `hitTest`, reports honestly, and is the passing subject of kit self-test K01 and the base of the mutants (design 13.5).
import { IgrError } from "../errors.js";
import { hitTest } from "../hit.js";
import { resolveLimits } from "../limits.js";
import { verifyManifest } from "../manifest.js";
import { assertModel, modelSceneBytes } from "../model.js";
import { reduce } from "../reduce.js";
import { buildReport } from "../report.js";
import { checkState, cloneState, initialState, readSize, snapshotValue, stateFromCore } from "../state.js";
import type { CapabilityManifest, ElementAddress, ExportFormat, ExportResult, Intent, RenderLimits, RenderModel, RenderReport, Renderer, RendererEnvironment, SemanticEvent, SemanticState } from "../types.js";

export interface HeadlessOptions {
  name?: string;
  version?: string;
  /** The renderer's OWN capacity (design 8.3), distinct from the host's RenderLimits. */
  capacity?: Partial<CapabilityManifest["capacity"]>;
}

type Phase = "created" | "initialized" | "loaded" | "disposed";
const life = (reason: string): IgrError => new IgrError("INVALID_LIFECYCLE", reason);
const invalid = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);
const FORMATS: readonly string[] = ["scene", "svg", "png"];

interface Env { size: { width: number; height: number }; reducedMotion: boolean; limits: RenderLimits; onEvent?: (e: SemanticEvent) => void; onError?: (e: unknown) => void }

/** Each caller property is read exactly once, synchronously (before any queueing). */
function snapshotEnvironment(env: unknown): { host: unknown; size: unknown; reducedMotion: unknown; limits: unknown; onEvent: unknown; onError: unknown } {
  if (typeof env !== "object" || env === null) throw invalid("SCHEMA", "env", "object expected");
  try {
    const e = env as Record<string, unknown>;
    const size = e["size"];
    const sizeCopy = typeof size === "object" && size !== null ? { width: (size as Record<string, unknown>)["width"], height: (size as Record<string, unknown>)["height"] } : size;
    const limits = e["limits"];
    const limitsCopy = typeof limits === "object" && limits !== null && !Array.isArray(limits) ? Object.fromEntries(Object.keys(limits).map((k) => [k, (limits as Record<string, unknown>)[k]])) : limits;
    return { host: e["host"], size: sizeCopy, reducedMotion: e["reducedMotion"], limits: limitsCopy, onEvent: e["onEvent"], onError: e["onError"] };
  } catch (err) {
    if (err instanceof IgrError) throw err;
    throw invalid("UNREADABLE", "env", "a property could not be read");
  }
}

function validateEnvironment(raw: ReturnType<typeof snapshotEnvironment>): Env {
  const size = readSize(raw.size);
  if (typeof raw.reducedMotion !== "boolean") throw invalid("SCHEMA", "env.reducedMotion", "boolean expected");
  const limits = resolveLimits(raw.limits ?? undefined);
  for (const k of ["onEvent", "onError"] as const) if (raw[k] !== undefined && typeof raw[k] !== "function") throw invalid("SCHEMA", `env.${k}`, "function expected");
  const out: Env = { size, reducedMotion: raw.reducedMotion, limits };
  if (raw.onEvent !== undefined) out.onEvent = raw.onEvent as (e: SemanticEvent) => void;
  if (raw.onError !== undefined) out.onError = raw.onError as (e: unknown) => void;
  return out;
}

const deepFreeze = <T>(v: T): T => {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); }
  return v;
};

export function createHeadlessRenderer(options: HeadlessOptions = {}): Renderer {
  const manifest = verifyManifest({
    igr: "IGR/1", renderer: { name: options.name ?? "isongraph-reference-headless", version: options.version ?? "0.0.0", host: "headless" },
    capabilities: {
      "scene.load": { status: "supported" }, viewport: { status: "supported" }, "hit-test": { status: "supported" }, selection: { status: "supported" },
      focus: { status: "supported" }, visibility: { status: "supported" }, labels: { status: "unsupported", reason: "HOST_LACKS" },
      "direction-cue": { status: "unsupported", reason: "HOST_LACKS" }, "indicators.non-color": { status: "unsupported", reason: "HOST_LACKS" },
      "a11y.model": { status: "supported" }, "state.report": { status: "supported" }, lifecycle: { status: "supported" },
      "export.scene": { status: "supported" }, "export.svg": { status: "unsupported", reason: "NOT_IMPLEMENTED" }, "export.png": { status: "unsupported", reason: "NOT_IMPLEMENTED" },
      "a11y.native-dom": { status: "unsupported", reason: "NOT_IMPLEMENTED" }, "a11y.companion-dom": { status: "unsupported", reason: "NOT_IMPLEMENTED" },
      "labels.edge": { status: "unsupported", reason: "NOT_IMPLEMENTED" }, "motion.animated": { status: "unsupported", reason: "NOT_IMPLEMENTED" },
      "scene.apply-delta": { status: "unsupported", reason: "RESERVED" },
    },
    capacity: { maxNodes: options.capacity?.maxNodes ?? 20_000, maxEdges: options.capacity?.maxEdges ?? 40_000, maxDrawnLabelUnits: options.capacity?.maxDrawnLabelUnits ?? 4096 },
  });

  let phase: Phase = "created";
  let disposeCalled = false; // set synchronously by dispose(): applySceneDelta is DISPOSED from then on
  let pending = 0;
  let tail: Promise<void> = Promise.resolve();
  let inListener = 0;
  let env: Env | undefined;
  let reducedMotion = false;
  let model: RenderModel | undefined;
  let state: SemanticState | undefined;

  /** One FIFO for every asynchronous method; `pending` is raised synchronously at the call, so synchronous methods can see it. */
  function enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
    pending++;
    const run = tail.then(async () => { try { return await fn(); } finally { pending--; } });
    tail = run.then(() => undefined, () => undefined);
    return run;
  }
  /** Phase check shared by the asynchronous methods at the time they RUN. */
  function needPhase(min: "initialized" | "loaded"): void {
    if (phase === "disposed") throw life("DISPOSED");
    if (phase === "created") throw life("NOT_INITIALIZED");
    if (min === "loaded" && phase !== "loaded") throw life("NOT_LOADED");
  }
  /** Phase check of the synchronous methods: BUSY, then DISPOSED, NOT_INITIALIZED, NOT_LOADED. */
  function syncGuard(): { model: RenderModel; state: SemanticState; env: Env } {
    if (pending > 0) throw life("BUSY"); // rev 3: BUSY precedes every phase error
    if (phase === "disposed") throw life("DISPOSED");
    if (phase === "created") throw life("NOT_INITIALIZED");
    if (phase !== "loaded" || !model || !state || !env) throw life("NOT_LOADED");
    return { model, state, env };
  }
  const route = (e: unknown): void => { try { env?.onError?.(e); } catch { /* a throwing onError is swallowed */ } };

  const renderer: Renderer = {
    manifest,

    initialize(e: RendererEnvironment): Promise<void> {
      let snap: ReturnType<typeof snapshotEnvironment>;
      try { snap = snapshotEnvironment(e); } catch (err) { return Promise.reject(err); }
      return enqueue(() => {
        if (phase === "disposed") throw life("DISPOSED");
        if (phase !== "created") throw life("ALREADY_INITIALIZED");
        const valid = validateEnvironment(snap);
        env = valid; reducedMotion = valid.reducedMotion; phase = "initialized";
      });
    },

    loadScene(m: RenderModel, initial?: SemanticState): Promise<void> {
      let snap: unknown;
      try { snap = initial === undefined ? undefined : snapshotValue(initial); } catch (err) { return Promise.reject(err); }
      return enqueue(() => {
        needPhase("initialized");
        assertModel(m);
        if (m.nodes.length > manifest.capacity.maxNodes) throw new IgrError("RESOURCE_LIMIT", "NODE_LIMIT");
        if (m.edges.length > manifest.capacity.maxEdges) throw new IgrError("RESOURCE_LIMIT", "EDGE_LIMIT");
        const size = phase === "loaded" && state ? { width: state.viewport.width, height: state.viewport.height } : env!.size;
        const next = snap === undefined ? initialState(m, size) : stateFromCore(m, checkState(m, snap, "strict")); // atomic: nothing is touched before this succeeds
        model = m; state = next; phase = "loaded";
      });
    },

    applySceneDelta(): Promise<never> {
      if (phase === "disposed" || disposeCalled) return Promise.reject(life("DISPOSED"));
      return Promise.reject(new IgrError("UNSUPPORTED_CAPABILITY", "RESERVED", undefined, "scene.apply-delta"));
    },

    dispatch(intent: Intent): readonly SemanticEvent[] {
      if (inListener > 0) throw life("REENTRANT");
      const g = syncGuard();
      const result = reduce(g.model, g.state, intent, g.env.limits);
      state = result.state; // commit first, then deliver
      const events = Object.freeze(result.events.map((e) => deepFreeze(e))); // a listener cannot change what dispatch returns
      for (const ev of events) {
        inListener++;
        try { g.env.onEvent?.(ev); } catch (err) { route(err); } finally { inListener--; }
      }
      return events;
    },

    getState(): SemanticState { return cloneState(syncGuard().state); },

    hitTest(point: { x: number; y: number }): ElementAddress | undefined { const g = syncGuard(); return hitTest(g.model, g.state, point); },

    setReducedMotion(reduced: boolean): void {
      if (phase === "disposed") throw life("DISPOSED");
      if (typeof reduced !== "boolean") throw invalid("SCHEMA", "reduced", "boolean expected");
      reducedMotion = reduced;
    },

    render(): Promise<void> { return enqueue(() => { needPhase("loaded"); }); }, // nothing is drawn: the committed state is "submitted" trivially

    probe(): RenderReport {
      const g = syncGuard();
      void reducedMotion; // a renderer that draws nothing never animates, under any preference
      return buildReport(g.model, g.state, { labels: "none", edge_labels: false, motion: "none", degradations: [] });
    },

    export(format: ExportFormat): Promise<ExportResult> {
      return enqueue(() => {
        needPhase("loaded");
        if (typeof format !== "string") throw invalid("SCHEMA", "format", "string expected");
        if (!FORMATS.includes(format)) throw invalid("UNKNOWN_FORMAT", "format");
        if (manifest.capabilities[`export.${format}` as "export.scene"].status !== "supported") throw new IgrError("UNSUPPORTED_CAPABILITY", "NOT_SUPPORTED", undefined, `export.${format}`);
        return { format: "scene" as const, bytes: modelSceneBytes(model!), media_type: "application/octet-stream" };
      });
    },

    dispose(): Promise<void> {
      disposeCalled = true;
      return enqueue(() => { phase = "disposed"; model = undefined; state = undefined; env = undefined; });
    },
  };
  return renderer;
}
