import { verifyScene } from "isongraph-visualize-scene-core";
import { nodeKey, nodeRefFromWire, snapshotBytes } from "isongraph-visualize-scene-core/primitives";
import { LayoutError } from "./errors.js";
import type { BoundLayout } from "./types.js";
import { verifyLayout } from "./verify.js";

/** The one qualified binding boundary: the scene hash is DERIVED from verified scene bytes; no caller can supply one. */
export async function bindLayout(sceneBytes: Uint8Array, layoutBytes: Uint8Array): Promise<BoundLayout> {
  const s = snapshotBytes(sceneBytes); // both snapshots are the first statements, synchronous
  const l = snapshotBytes(layoutBytes);
  const { scene, sceneSha256 } = await verifyScene(s); // IgsError propagates unchanged
  const { layout, layoutSha256 } = await verifyLayout(l);
  if (layout.scene_sha256 !== sceneSha256) throw new LayoutError("SCENE_MISMATCH");
  const sceneKeys = new Map(scene.nodes.map((n) => [nodeKey(nodeRefFromWire(n.ref)), n] as const));
  const layoutKeys = new Set(layout.nodes.map((n) => nodeKey(nodeRefFromWire(n.ref))));
  for (const [k, n] of sceneKeys) if (!layoutKeys.has(k)) throw new LayoutError("INCOMPLETE_LAYOUT", "MISSING_NODE", undefined, `${n.ref.type} ${n.ref.id}`);
  for (const k of layoutKeys) if (!sceneKeys.has(k)) throw new LayoutError("INCOMPLETE_LAYOUT", "UNKNOWN_NODE", undefined, k);
  return { scene, sceneSha256, layout, layoutSha256 };
}
