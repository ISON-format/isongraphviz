// packages/scene-core/src/order.ts
import type { EdgeAddress, NodeId, NodeRef } from "./types.js";

const encoder = new TextEncoder();

/** Compare two strings by their UTF-8 bytes (Semantic/2 order). Never use the JavaScript default, which is UTF-16 order. */
export function compareUtf8(a: string, b: string): number {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  const n = Math.min(x.length, y.length);
  for (let k = 0; k < n; k++) {
    const d = x[k] - y[k];
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

export function compareNodeId(a: NodeId, b: NodeId): number {
  if (a.kind === "int" && b.kind === "int") return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  if (a.kind === "int") return -1;
  if (b.kind === "int") return 1;
  return compareUtf8(a.value, b.value);
}

export const compareNodeRef = (a: NodeRef, b: NodeRef): number => compareUtf8(a.type, b.type) || compareNodeId(a.id, b.id);

export const compareEdgeAddress = (a: EdgeAddress, b: EdgeAddress): number =>
  compareNodeRef(a.src, b.src) || compareUtf8(a.rel, b.rel) || compareNodeRef(a.tgt, b.tgt) || compareUtf8(a.ord, b.ord);
