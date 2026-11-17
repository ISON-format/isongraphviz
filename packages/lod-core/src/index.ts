// packages/lod-core — IGLOD/1 generic semantic level of detail (design 29). Public surface (section 12).
export { HashUnavailableError, IgsError, LODError, LayoutError } from "./errors.js";
export type { LODErrorCode } from "./errors.js";
export { DEFAULT_LOD_BUDGET, LOD_HARD_LIMITS } from "./limits.js";
export type { LodBudget } from "./limits.js";
export { hashLODState, serializeLODState, verifyLODState } from "./state.js";
export { collapseGroup, emptyState, expandGroup, replaceGroups, setPinned, withLayout, withZoom } from "./builders.js";
export { deriveAggregateId, isAggregateId } from "./aggregate.js";
export { suggestGroups } from "./rules.js";
export { deriveView, serializeView } from "./derive.js";
export { checkViewConservation, projectToView, resolveAggregateEdge, resolveFromView } from "./mapping.js";
export type * from "./types.js";
