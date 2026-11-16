// packages/scene-core/src/model.ts
import { DuplicateEdgeError, DuplicateNodeError, GraphError, InvalidIdentifierError, ISONGraph, NodeNotFoundError } from "ison-graph-ts";
import { IgsError } from "./errors.js";
import { edgeKey } from "./identity.js";
import { compareNodeRef } from "./order.js";
import { decodeSource, qualify } from "./qualify.js";
import type { LogicalEdge, NodeRef, SceneModel } from "./types.js";

/** Core errors that survive qualification are mapped, never leaked. */
function mapCoreError(e: unknown): IgsError {
  const detail = (e as Error)?.message;
  if (e instanceof NodeNotFoundError) return new IgsError("INVALID_EDGE_ENDPOINT", undefined, undefined, detail);
  if (e instanceof DuplicateEdgeError) return new IgsError("DUPLICATE_EDGE", undefined, undefined, detail);
  if (e instanceof DuplicateNodeError) return new IgsError("DUPLICATE_NODE", undefined, undefined, detail);
  if (e instanceof InvalidIdentifierError || e instanceof GraphError) return new IgsError("MALFORMED_SOURCE", "PARSE_ERROR", undefined, detail);
  return new IgsError("MALFORMED_SOURCE", "PARSE_ERROR", undefined, String(e));
}

const toRef = (type: string, id: string | number): NodeRef => ({
  type,
  id: typeof id === "number" ? { kind: "int", value: BigInt(id) } : { kind: "str", value: id }, // ids are provably safe integers after qualification
});

/** Qualified bytes -> typed model, using the pinned Core TS port. Physical mirror edges collapse to one logical edge. */
export function loadModel(bytes: Uint8Array): SceneModel {
  const text = decodeSource(bytes);
  const { directed } = qualify(text);
  let graph: ISONGraph;
  try {
    graph = ISONGraph.fromIson(text);
  } catch (e) {
    throw mapCoreError(e);
  }
  if (graph.directed !== directed) throw new IgsError("UNSUPPORTED_GRAPH_PROFILE", "CONTRADICTORY_META", "meta.graph");

  const nodes = [...graph.nodes()].map((n) => toRef(n.type, n.id));
  const logical = new Map<string, LogicalEdge>();
  for (const e of graph.edges()) {
    let src = toRef(e.source[0], e.source[1]);
    let tgt = toRef(e.target[0], e.target[1]);
    if (!directed && compareNodeRef(src, tgt) > 0) [src, tgt] = [tgt, src];
    logical.set(edgeKey({ src, rel: e.relType, tgt, ord: "0" }), { src, rel: e.relType, tgt });
  }
  return { directed, nodes, edges: [...logical.values()] };
}
