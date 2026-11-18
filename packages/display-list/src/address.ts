// src/address.ts - the strict readers of wire addresses (design 4.7 D4, 9.4 V1): exactly the key sets of 27 4.2, string components, and for the
// display list the id, type, ord and rel patterns of IGS/1.
import type { WireEdge, WireNode } from "./types.js";

const IDENTIFIER = /^[^\s:|"\\]+$/;
const ORD = /^(0|[1-9][0-9]*)$/;
const CANONICAL_INT = /^(0|-?[1-9][0-9]*)$/;
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sameKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

/** A node id of the wire form: `s:` and any text, or `i:` and a canonical int64 (at most 20 characters, checked before any conversion). */
export function validNodeId(id: string): boolean {
  if (id.startsWith("s:")) return true;
  if (!id.startsWith("i:")) return false;
  const digits = id.slice(2);
  if (digits.length > 20 || !CANONICAL_INT.test(digits)) return false;
  const v = BigInt(digits);
  return v >= INT64_MIN && v <= INT64_MAX;
}

/** Shape only: exactly {id, type}, both strings. */
export function isNodeShape(o: unknown): o is WireNode {
  return isObj(o) && sameKeys(o, ["id", "type"]) && typeof o["id"] === "string" && typeof o["type"] === "string";
}
/** Shape only: exactly {ord, rel, src, tgt}; src and tgt node shapes; ord and rel strings. */
export function isEdgeShape(o: unknown): o is WireEdge {
  return isObj(o) && sameKeys(o, ["ord", "rel", "src", "tgt"]) && typeof o["ord"] === "string" && typeof o["rel"] === "string" && isNodeShape(o["src"]) && isNodeShape(o["tgt"]);
}

/** A well-formed node wire address (D4): the shape and the patterns. */
export function isWireNode(o: unknown): o is WireNode {
  return isNodeShape(o) && validNodeId(o.id) && IDENTIFIER.test(o.type);
}
/** A well-formed edge wire address (D4). */
export function isWireEdge(o: unknown): o is WireEdge {
  return isEdgeShape(o) && ORD.test(o.ord) && IDENTIFIER.test(o.rel) && isWireNode(o.src) && isWireNode(o.tgt);
}
