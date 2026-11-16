import { verifyScene } from "isongraph-visualize-scene-core";
import type { WireNodeRef } from "isongraph-visualize-scene-core";
import { nodeKey, nodeRefFromWire, snapshotBytes } from "isongraph-visualize-scene-core/primitives";
import { LayoutError } from "./errors.js";
import { finalize } from "./produce.js";
import { quantize } from "./quantize.js";
import type { FixedPosition, LayoutNode, LayoutResult } from "./types.js";

const schema = (path: string, detail: string): LayoutError => new LayoutError("INVALID_LAYOUT", "SCHEMA", path, detail);

/** Owned copy; every caller property is read exactly once, synchronously. */
function snapshotPositions(positions: readonly FixedPosition[]): FixedPosition[] {
  if (!Array.isArray(positions)) throw schema("positions", "array expected");
  const out: FixedPosition[] = [];
  const length = positions.length;
  for (let i = 0; i < length; i++) {
    const p: unknown = positions[i];
    if (typeof p !== "object" || p === null) throw schema(`positions[${i}]`, "object expected");
    const rec = p as Record<string, unknown>;
    const refRaw = rec["ref"], x = rec["x"], y = rec["y"];
    if (typeof refRaw !== "object" || refRaw === null) throw schema(`positions[${i}].ref`, "object expected");
    const id = (refRaw as Record<string, unknown>)["id"], type = (refRaw as Record<string, unknown>)["type"];
    if (typeof id !== "string" || typeof type !== "string") throw schema(`positions[${i}].ref`, "string id and type expected");
    if (typeof x !== "number" || typeof y !== "number") throw new LayoutError("INVALID_COORDINATE", "NOT_FINITE", `positions[${i}]`);
    out.push({ ref: { id, type }, x, y });
  }
  return out;
}

export async function computeFixedLayout(sceneBytes: Uint8Array, positions: readonly FixedPosition[]): Promise<LayoutResult> {
  const input = snapshotBytes(sceneBytes); // synchronous, before the first await
  const owned = snapshotPositions(positions);
  const { scene, sceneSha256 } = await verifyScene(input);
  const byKey = new Map<string, FixedPosition>();
  owned.forEach((p, i) => {
    let key: string;
    try { key = nodeKey(nodeRefFromWire(p.ref as WireNodeRef)); }
    catch { throw new LayoutError("INCOMPLETE_LAYOUT", "UNKNOWN_NODE", `positions[${i}]`); }
    if (byKey.has(key)) throw new LayoutError("INVALID_LAYOUT", "DUPLICATE_NODE_REF", `positions[${i}]`);
    byKey.set(key, p);
  });
  const nodes: LayoutNode[] = scene.nodes.map((n) => {
    const key = nodeKey(nodeRefFromWire(n.ref));
    const p = byKey.get(key);
    if (!p) throw new LayoutError("INCOMPLETE_LAYOUT", "MISSING_NODE", undefined, `${n.ref.type} ${n.ref.id}`);
    byKey.delete(key);
    return { ref: { id: n.ref.id, type: n.ref.type }, x: quantize(p.x), y: quantize(p.y) };
  });
  if (byKey.size > 0) throw new LayoutError("INCOMPLETE_LAYOUT", "UNKNOWN_NODE", undefined, [...byKey.keys()][0]);
  return finalize(sceneSha256, { family: "FIXED", algorithm: "igl-fixed/1", config: {} }, nodes);
}
