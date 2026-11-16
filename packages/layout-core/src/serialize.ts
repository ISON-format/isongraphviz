import { canonicalBytesSigned, compareNodeRef, nodeRefFromWire, sha256Hex, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { LayoutError } from "./errors.js";
import type { Layout } from "./types.js";
import { wireCoordinate } from "./quantize.js";

const reasonOf = (e: unknown): string | undefined => (e instanceof Error && "reason" in e ? String((e as { reason: unknown }).reason) : undefined);

/** IGL-CJ/1 bytes of a layout. Sorts nodes (NodeRef/2) on a copy; refuses a layout holding its own hash. */
export function layoutToBytes(layout: Layout): Uint8Array {
  if (Object.prototype.hasOwnProperty.call(layout, "layout_sha256")) throw new LayoutError("INVALID_LAYOUT", "RESERVED_FIELD", "$.layout_sha256");
  layout.nodes.forEach((n, i) => { wireCoordinate(n.x, `$.nodes[${i}].x`); wireCoordinate(n.y, `$.nodes[${i}].y`); });
  const sorted = { ...layout, nodes: [...layout.nodes].sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref))) };
  try {
    return canonicalBytesSigned(sorted as unknown as CJValue);
  } catch (e) {
    throw new LayoutError("INVALID_LAYOUT", reasonOf(e) ?? "SCHEMA");
  }
}

export const layoutSha256 = (bytes: Uint8Array): Promise<string> => sha256Hex(bytes);
