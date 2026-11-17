// packages/scene-core/src/assemble.ts
import { canonicalBytes, hasLoneSurrogate, type CJValue } from "./canonical.js";
import { IgsError } from "./errors.js";
import { edgeKey, edgeToWire, encodeNodeId, IDENTIFIER, labelOf, nodeKey, nodeRefToWire } from "./identity.js";
import { compareEdgeAddress, compareNodeRef } from "./order.js";
import type { EdgeAddress, NodeRef, Scene, SceneModel } from "./types.js";

/** Core identifiers (type, rel): non-empty, no whitespace, none of : | " \. Also refuses strings JSON text cannot carry. */
function checkIdentifier(s: string, path: string): void {
  if (!IDENTIFIER.test(s)) throw new IgsError("INVALID_SCENE", "INVALID_IDENTIFIER", path);
  if (hasLoneSurrogate(s)) throw new IgsError("INVALID_SCENE", "INVALID_STRING", path);
}

/** The IGS/1 §1.2 contract (docs/specs/IGS-1.md), so the producer never emits what the consumer (`verifyScene`) rejects. */
function checkNodeRef(r: NodeRef, path: string): void {
  checkIdentifier(r.type, `${path}.type`);
  if (r.id.kind === "str" && hasLoneSurrogate(r.id.value)) throw new IgsError("INVALID_SCENE", "INVALID_STRING", `${path}.id`);
  encodeNodeId(r.id); // INT64 range: INVALID_NODE_ID / INT64_RANGE
}

/** Portable and INT64-complete: builds the semantic scene from a typed model. The model contains logical edges only. */
export function assembleScene(artifactSha256: string, model: SceneModel): Scene {
  if (!/^[0-9a-f]{64}$/.test(artifactSha256)) throw new IgsError("INVALID_SCENE", "INVALID_HASH", "source.artifact_sha256");

  model.nodes.forEach((n, k) => checkNodeRef(n, `nodes[${k}]`));
  model.edges.forEach((e, k) => checkIdentifier(e.rel, `edges[${k}].rel`));

  const nodes = [...model.nodes].sort(compareNodeRef);
  for (let k = 1; k < nodes.length; k++) {
    if (compareNodeRef(nodes[k - 1], nodes[k]) === 0) throw new IgsError("DUPLICATE_NODE");
  }
  const known = new Set(nodes.map(nodeKey));

  const edges: EdgeAddress[] = model.edges
    .map((e) => {
      if (!known.has(nodeKey(e.src)) || !known.has(nodeKey(e.tgt))) throw new IgsError("INVALID_EDGE_ENDPOINT");
      const flip = !model.directed && compareNodeRef(e.src, e.tgt) > 0;
      return { src: flip ? e.tgt : e.src, rel: e.rel, tgt: flip ? e.src : e.tgt, ord: "0" };
    })
    .sort(compareEdgeAddress);
  for (let k = 1; k < edges.length; k++) {
    if (edgeKey(edges[k - 1]) === edgeKey(edges[k])) throw new IgsError("DUPLICATE_EDGE");
  }

  return {
    address_scheme: "igs-addr/1",
    edges: edges.map((e) => ({ label: e.rel, ref: edgeToWire(e) })),
    graph: { directed: model.directed, profile: "simple" },
    igs: "IGS/1",
    nodes: nodes.map((n) => ({ category: n.type, label: labelOf(n.id), ref: nodeRefToWire(n) })),
    source: { artifact_sha256: artifactSha256, serialization_profile: "ison-v1" },
  };
}

export const sceneToBytes = (scene: Scene): Uint8Array => canonicalBytes(scene as unknown as CJValue);
