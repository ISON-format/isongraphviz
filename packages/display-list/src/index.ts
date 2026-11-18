// src/index.ts - the core entry of display-list (design 2): DOM-free, no node:* import. The Canvas replay is the separate subpath "./canvas2d".
export {
  DL_FORMAT, THEME_FORMAT, DEFAULT_DL_LIMITS, DEFAULT_DL_READ_LIMITS, DEFAULT_CV_READ_LIMITS, DL_COORD_MAX, GUARD_MARGIN,
} from "./constants.js";
export { resolveDlOptions } from "./options.js";
export type { DlOptions, ResolvedDlOptions } from "./options.js";
export type { DisplayList, DlRecord, DlFidelity, WireNode, WireEdge, ElementAddress } from "./types.js";
export { buildDisplayList, dryLabelPass } from "./build.js";
export { serializeDisplayList } from "./write.js";
export { parseDisplayList } from "./read.js";
export { buildPickBuffer, serializePickBuffer, parsePickBuffer, createPicker, pickerFromList } from "./pick.js";
export type { PickBuffer, Picker } from "./pick.js";
export { elementBounds, serializeBounds } from "./bounds.js";
export type { ElementBox } from "./bounds.js";
export { backingSize } from "./device.js";
export { THEME } from "./theme.js";
export type { Theme } from "./theme.js";
export { readoutFromList, readoutFromSvgReadout, serializeReadout, assembleReadout, inGuardBox } from "./readout.js";
export type { Readout, ReadoutParts, SvgReadoutLike } from "./readout.js";
export { compareReadouts } from "./compare.js";
export type { ReadoutComparison } from "./compare.js";
