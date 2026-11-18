// src/index.ts - IGR/1 renderer contract: public surface (design section 14).
export { buildRenderModel, isRenderModel, lookupElement, modelBytes, modelSceneBytes, selectionReference, resolveSelection } from "./model.js";
export { elementKey } from "./elements.js";
export { initialState, serializeState, normalizeState, parseState, stateSha256, effectiveVisibility, traversalOrder } from "./state.js";
export { reduce, serializeEvents, fitViewport } from "./reduce.js";
export { layoutToScreen, quantizePx, quantizeSize } from "./viewport.js";
export { hitTest } from "./hit.js";
export { accessibleName, accessibleDescription, graphSummary, summaryText, statusText, announcementFor, buildAccessibleModel } from "./a11y.js";
export { verifyManifest, MANDATORY_CAPABILITIES } from "./manifest.js";
export { semanticProjection, serializeProjection, compareProjections } from "./report.js";
export { runConformance } from "./conformance/run.js";
export { DEFAULT_RENDER_LIMITS, NODE_HIT_RADIUS_PX, EDGE_HIT_TOLERANCE_PX, ZOOM_MIN_MILLI, ZOOM_MAX_MILLI, ZOOM_DEFAULT_MILLI, FIT_PADDING_PX, VIEWPORT_MAX_PX } from "./types.js";
export { IgrError } from "./errors.js";
export type { IgrErrorCode } from "./errors.js";
export type {
  RenderModel, ModelNode, ModelEdge, SemanticState, ElementAddress, ElementSet, ViewportState, Intent, SemanticEvent, ObjectRef,
  Renderer, RendererEnvironment, CapabilityManifest, CapabilityStatus, CapabilityId, Degradation, RenderReport, SemanticProjection,
  AccessibleModel, AccessibleItem, GraphSummary, RenderLimits, ExportFormat, ExportResult,
} from "./types.js";
export type { ConformanceSubject, ConformanceReport, VectorResult, CheckId, WitnessReport } from "./conformance/run.js";
export type { Corpus } from "./conformance/corpus.js";
