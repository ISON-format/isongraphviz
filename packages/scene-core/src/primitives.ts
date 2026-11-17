// packages/scene-core/src/primitives.ts — shared primitives for sibling packages (the layout package). Additive: nothing here changes an IGS/1 byte.
export { canonicalBytes, canonicalBytesSigned, canonicalize, canonicalizeSigned, cjViolation, hasLoneSurrogate } from "./canonical.js";
export type { CJLimits, CJValue, CJViolation } from "./canonical.js";
export { sha256Hex } from "./hash.js";
export { IDENTIFIER, decodeNodeId, encodeNodeId, labelOf, nodeKey, nodeRefFromWire, nodeRefToWire } from "./identity.js";
export { compareNodeRef, compareUtf8 } from "./order.js";
export { snapshotBytes } from "./snapshot.js";
