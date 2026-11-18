// src/index.ts - IGR-CV/1 core entry (design 2). DOM-free; the browser adapter is the separate subpath "./dom".
export { canvasManifest } from "./manifest.js";
export type { CanvasRendererOptions } from "./options.js";
export { createCanvasRenderer } from "./renderer.js";
export type { CanvasRenderer, CanvasStatus } from "./renderer.js";
export { createCanvasSubject } from "./subject.js";
