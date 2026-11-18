// src/index.ts - export-core "." (DOM-free): the public surface of design 2. Nothing of renderer-core, renderer-svg, display-list, a11y-companion or scene-core
// is re-exported.
export { EXPORT_FORMAT, DEFAULT_EXPORT_LIMITS } from "./limits.js";
export type { ExportLimits } from "./limits.js";
export { serializeExportManifest, parseExportManifest } from "./manifest.js";
export type { ExportManifest, ArtifactEntry, ArtifactName } from "./manifest.js";
export { exportBundle, verifyExportBundle } from "./bundle.js";
export type { ExportOptions, ExportBundle } from "./bundle.js";
export { embedPngBinding, readPngBinding } from "./png.js";
export type { PngBinding } from "./png.js";
export { renderHeadless } from "./headless.js";
export type { HeadlessInput, HeadlessResult, HeadlessOutput } from "./headless.js";
