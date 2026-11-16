// packages/scene-core/src/primitives.ts — shared primitives for sibling packages (V2 layout). Additive: nothing here changes a V1a byte.
export { canonicalBytes, canonicalBytesSigned, canonicalize, canonicalizeSigned, cjViolation, hasLoneSurrogate } from "./canonical.js";
export type { CJLimits, CJValue, CJViolation } from "./canonical.js";
export { sha256Hex } from "./hash.js";
export { IDENTIFIER, decodeNodeId, encodeNodeId, labelOf, nodeKey, nodeRefFromWire, nodeRefToWire } from "./identity.js";
export { compareNodeRef, compareUtf8 } from "./order.js";
export { snapshotBytes } from "./snapshot.js";
