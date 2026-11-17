// packages/scene-core/src/identity.ts
import { IgsError } from "./errors.js";
import type { EdgeAddress, NodeId, NodeRef, WireEdgeAddress, WireNodeRef } from "./types.js";

export const INT64_MIN = -(1n << 63n);
export const INT64_MAX = (1n << 63n) - 1n;
const MAX_INT64_TEXT = 20;
const CANONICAL_INT =/^(0|-?[1-9][0-9]*)$/;
/** Core identifier rule: non-empty, no whitespace, none of : | " \ */
export const IDENTIFIER = /^[^\s:|"\\]+$/;

export function encodeNodeId(id: NodeId): string {
  if (id.kind === "str") return `s:${id.value}`;
  if (id.value < INT64_MIN || id.value > INT64_MAX) throw new IgsError("INVALID_NODE_ID", "INT64_RANGE");
  return `i:${id.value.toString()}`;
}

export function decodeNodeId(wire: string): NodeId {
  if (wire.startsWith("s:")) return { kind: "str", value: wire.slice(2) };
  if (wire.startsWith("i:")) {
    const digits = wire.slice(2);
    // INT64 text is at most 20 characters ("-9223372036854775808"); anything longer is out of range, so it is refused BEFORE the regex or any
    // BigInt conversion (V2 closure audit m-3: BigInt of a multi-million-digit token took seconds). Valid and invalid verdicts are unchanged.
    if (digits.length > MAX_INT64_TEXT || !CANONICAL_INT.test(digits)) throw new IgsError("INVALID_SCENE", "INVALID_ID", undefined, wire);
    const value = BigInt(digits);
    if (value < INT64_MIN || value > INT64_MAX) throw new IgsError("INVALID_SCENE", "INVALID_ID", undefined, wire);
    return { kind: "int", value };
  }
  throw new IgsError("INVALID_SCENE", "INVALID_ID", undefined, wire);
}

export const labelOf = (id: NodeId): string => (id.kind === "int" ? id.value.toString() : id.value);

export const nodeRefToWire = (r: NodeRef): WireNodeRef => ({ id: encodeNodeId(r.id), type: r.type });
export const nodeRefFromWire = (w: WireNodeRef): NodeRef => ({ id: decodeNodeId(w.id), type: w.type });
export const edgeToWire = (e: EdgeAddress): WireEdgeAddress => ({ ord: e.ord, rel: e.rel, src: nodeRefToWire(e.src), tgt: nodeRefToWire(e.tgt) });
export const edgeFromWire = (w: WireEdgeAddress): EdgeAddress => ({ ord: w.ord, rel: w.rel, src: nodeRefFromWire(w.src), tgt: nodeRefFromWire(w.tgt) });

export const nodeKey = (r: NodeRef): string => JSON.stringify([r.type, encodeNodeId(r.id)]);
export const edgeKey = (e: EdgeAddress): string => JSON.stringify([nodeKey(e.src), e.rel, nodeKey(e.tgt), e.ord]);
