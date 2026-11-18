// src/index.ts - a11y-companion "." (DOM-free): the public surface of design 2. Nothing of renderer-core, interaction-core or scene-core is re-exported.
export { COMPANION_FORMAT, COMPANION_FULL_MAX, COMPANION_WINDOW, buildCompanionTree, serializeCompanionTree, verifyCompanionTree, defaultWindow } from "./tree.js";
export { LIVE_MAX_UNITS, liveText } from "./live.js";
export { planCompanionUpdate, serializePlan } from "./plan.js";
export { COMPANION_CSS, executePlan, createRecordingDom } from "./executor.js";
export { GATE_FORMAT, runAccessibilityGate, serializeGateReport } from "./gate.js";
export { composeManifest } from "./manifest.js";
export type { CompanionOptions, CompanionTree, CompanionItem, DomOp, DomLike, ElementLike, ExecutorState, LiveEvent, Mode, WindowOption } from "./types.js";
export type { GateInput, GateReport, GateCheck } from "./gate.js";
export type { ManifestFlags } from "./manifest.js";
