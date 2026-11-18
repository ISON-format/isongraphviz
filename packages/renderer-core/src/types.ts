// src/types.ts - IGR/1 types and constants (design sections 2-11). Constants are provisional and unmeasured; changing one is IGR/2.
import type { ObjectRef, WireEdgeAddress, WireNodeRef } from "isongraph-visualize-scene-core";

export type { ObjectRef, WireEdgeAddress, WireNodeRef };

export const NODE_HIT_RADIUS_PX = 12;
export const EDGE_HIT_TOLERANCE_PX = 6;
export const ZOOM_MIN_MILLI = 10;
export const ZOOM_MAX_MILLI = 100_000;
export const ZOOM_DEFAULT_MILLI = 1000;
export const FIT_PADDING_PX = 32;
export const VIEWPORT_MAX_PX = 16_384;

/** Execution controls (provisional, unmeasured safety caps). All boundaries inclusive. Never part of a model, state or report. */
export interface RenderLimits {
  maxSceneBytes: number; maxLayoutBytes: number; maxNodes: number; maxEdges: number;
  maxTotalLabelUnits: number; maxStateBytes: number; maxIntentTargets: number;
}
export const DEFAULT_RENDER_LIMITS: Readonly<RenderLimits> = Object.freeze({
  maxSceneBytes: 8_388_608, maxLayoutBytes: 4_194_304, maxNodes: 20_000, maxEdges: 40_000,
  maxTotalLabelUnits: 4_194_304, maxStateBytes: 8_388_608, maxIntentTargets: 60_000,
});

// --- model (section 2.2) ---
export interface ModelNode { index: number; ref: WireNodeRef; category: string; label: string; x: number; y: number; degree: number }
export interface ModelEdge { index: number; ref: WireEdgeAddress; label: string; src: number; tgt: number }
export interface RenderModel {
  readonly igr_model: "igr-model/1";
  readonly artifactSha256: string; readonly sceneSha256: string; readonly layoutSha256: string;
  readonly directed: boolean; readonly scale: 1000;
  readonly nodes: readonly ModelNode[];
  readonly edges: readonly ModelEdge[];
  readonly categories: readonly string[];
  readonly bounds?: { min_x: number; min_y: number; max_x: number; max_y: number };
  // the verified canonical scene bytes are not a public field: modelSceneBytes(model) returns a fresh copy
}

// --- state (section 4) ---
export interface ElementSet { nodes: WireNodeRef[]; edges: WireEdgeAddress[] }
export interface ViewportState { center_x: number; center_y: number; width: number; height: number; zoom: number }
export interface SemanticState {
  focus?: { node: WireNodeRef } | { edge: WireEdgeAddress };
  hidden: ElementSet;
  igr: "IGR/1";
  layout_sha256: string; scene_sha256: string;
  selection: ElementSet;
  viewport: ViewportState;
}

// --- intents and events (section 5) ---
export type ElementAddress = { readonly node: WireNodeRef } | { readonly edge: WireEdgeAddress };
export type Intent =
  | { type: "select"; mode: "replace" | "add" | "remove" | "toggle"; targets: ElementAddress[] }
  | { type: "clear-selection" }
  | { type: "focus"; target?: ElementAddress }
  | { type: "focus-step"; delta: 1 | -1 } | { type: "focus-first" } | { type: "focus-last" }
  | { type: "set-hidden"; targets: ElementAddress[]; hidden: boolean }
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; factor_milli: number; anchor?: { x: number; y: number } }
  | { type: "fit"; padding?: number }
  | { type: "set-viewport"; center_x: number; center_y: number; zoom: number }
  | { type: "resize"; width: number; height: number };
export type SemanticEvent =
  | { type: "selection-changed"; selection: ObjectRef[] }
  | { type: "focus-changed"; focus?: ObjectRef }
  | { type: "visibility-changed"; hidden: ObjectRef[] }
  | { type: "viewport-changed"; viewport: ViewportState }
  | { type: "traversal-boundary"; end: "start" | "end" };

// --- accessibility data model (section 10) ---
export interface AccessibleItem {
  role: "node" | "edge"; address: ElementAddress; name: string; description?: string;
  selected: boolean; focused: boolean; position: number; set_size: number;
}
export interface AccessibleModel { summary: string; status: string; items: AccessibleItem[] }
export interface GraphSummary { directed: boolean; nodes: number; edges: number; categories: { category: string; count: number }[] }

// --- manifest (section 8) ---
export type MandatoryCapability = "scene.load" | "viewport" | "hit-test" | "selection" | "focus" | "visibility" | "labels"
  | "direction-cue" | "indicators.non-color" | "a11y.model" | "state.report" | "lifecycle";
export type OptionalCapability = "export.scene" | "export.svg" | "export.png" | "a11y.native-dom" | "a11y.companion-dom" | "labels.edge" | "motion.animated";
export type ReservedCapability = "scene.apply-delta";
export type CapabilityId = MandatoryCapability | OptionalCapability | ReservedCapability | `x-${string}`;
export type Degradation = "LABELS_ELIDED" | "EDGE_LABELS_OMITTED" | "EDGE_STYLE_SIMPLIFIED";
export type CapabilityStatus =
  | { status: "supported" }
  | { status: "degraded"; degradations: Degradation[] }
  | { status: "unsupported"; reason: "RESERVED" | "NOT_IMPLEMENTED" | "HOST_LACKS" };
export interface CapabilityManifest {
  igr: "IGR/1";
  renderer: { name: string; version: string; host: "dom" | "headless" };
  capabilities: Record<CapabilityId, CapabilityStatus>;
  capacity: { maxNodes: number; maxEdges: number; maxDrawnLabelUnits: number };
}

// --- renderer lifecycle (section 9) ---
export interface RendererEnvironment {
  host: unknown;
  size: { width: number; height: number };
  reducedMotion: boolean;
  limits?: Partial<RenderLimits>;
  onEvent?: (e: SemanticEvent) => void;
  onError?: (e: unknown) => void;
}
export type ExportFormat = "scene" | "svg" | "png";
export interface ExportResult { format: ExportFormat; bytes: Uint8Array; media_type: string }

// --- report (section 11) ---
export interface RenderReport {
  igr: "IGR/1"; scene_sha256: string; layout_sha256: string;
  state: SemanticState;
  drawn: ElementSet;
  marked: { selected: ElementSet; focus?: ElementAddress };
  accessible: AccessibleModel;
  fidelity: { labels: "full" | "elided" | "none"; edge_labels: boolean; motion: "none" | "full"; degradations: Degradation[] };
}
export interface SemanticProjection {
  igr: "IGR/1"; scene_sha256: string; layout_sha256: string;
  state: SemanticState; drawn: ElementSet;
  marked: { selected: ElementSet; focus?: ElementAddress };
  accessible: AccessibleModel;
}

export interface Renderer {
  readonly manifest: CapabilityManifest;
  initialize(env: RendererEnvironment): Promise<void>;
  loadScene(model: RenderModel, initial?: SemanticState): Promise<void>;
  applySceneDelta(delta: unknown): Promise<never>;
  dispatch(intent: Intent): readonly SemanticEvent[];
  getState(): SemanticState;
  hitTest(point: { x: number; y: number }): ElementAddress | undefined;
  setReducedMotion(reduced: boolean): void;
  render(): Promise<void>;
  probe(): RenderReport;
  export(format: ExportFormat): Promise<ExportResult>;
  dispose(): Promise<void>;
}
