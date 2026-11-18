// src/index.ts - IGR-SVG/1 core entry (design sections 2 and 14). DOM-free; the browser adapter is the separate subpath "./dom".
export { SVG_FORMAT, DEFAULT_SVG_LIMITS, DEFAULT_READ_LIMITS } from "./constants.js";
export type { SvgOptions } from "./options.js";
export { renderSvg, renderSvgDetailed, writeSvg } from "./write.js";
export type { SvgRenderResult, SvgFidelity } from "./write.js";
export { elementDomId, decodeElementId } from "./ids.js";
export { pickElement } from "./pick.js";
export { readSvg, svgWitness } from "./read.js";
export type { SvgReadout, SvgNode, SvgEdge, ReadLimits } from "./read.js";
export { svgManifest, createSvgRenderer, createSvgSubject } from "./renderer.js";
export type { SvgRenderer, SvgRendererOptions } from "./renderer.js";
