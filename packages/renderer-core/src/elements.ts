// src/elements.ts - addresses and the strict readers of caller-owned address objects (design section 2.2).
import { IgrError } from "./errors.js";
import type { ElementAddress, WireEdgeAddress, WireNodeRef } from "./types.js";

/** Plain data object: Object.prototype or null prototype. Never throws. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  try {
    if (typeof v !== "object" || v === null) return false;
    const p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  } catch { return false; }
}

const sameKeys = (o: object, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

/** Strict node address: exactly {id, type}, both primitive strings, each read once. undefined on any deviation; never throws. */
export function readWireNode(o: unknown): WireNodeRef | undefined {
  try {
    if (!isPlainObject(o) || !sameKeys(o, ["id", "type"])) return undefined;
    const id: unknown = o["id"], type: unknown = o["type"];
    if (typeof id !== "string" || typeof type !== "string") return undefined;
    return { id, type };
  } catch { return undefined; }
}

/** Strict edge address: exactly {ord, rel, src, tgt}; src and tgt exactly {id, type}. */
export function readWireEdge(o: unknown): WireEdgeAddress | undefined {
  try {
    if (!isPlainObject(o) || !sameKeys(o, ["ord", "rel", "src", "tgt"])) return undefined;
    const ord: unknown = o["ord"], rel: unknown = o["rel"], srcRaw: unknown = o["src"], tgtRaw: unknown = o["tgt"];
    if (typeof ord !== "string" || typeof rel !== "string") return undefined;
    const src = readWireNode(srcRaw), tgt = readWireNode(tgtRaw);
    if (!src || !tgt) return undefined;
    return { ord, rel, src, tgt };
  } catch { return undefined; }
}

export const nodeAddressKey = (r: WireNodeRef): string => JSON.stringify(["n", r.type, r.id]);
export const edgeAddressKey = (r: WireEdgeAddress): string => JSON.stringify(["e", r.ord, r.rel, r.src.type, r.src.id, r.tgt.type, r.tgt.id]);

/** The section 2.2 string key of an exact-shape wire address (a Map key, never identity of record). */
export function elementKey(address: WireNodeRef | WireEdgeAddress): string {
  const n = readWireNode(address);
  if (n) return nodeAddressKey(n);
  const e = readWireEdge(address);
  if (e) return edgeAddressKey(e);
  throw new IgrError("INVALID_INPUT", "SCHEMA", undefined, "exact-shape node or edge address expected");
}

export const copyNodeRef = (r: WireNodeRef): WireNodeRef => ({ id: r.id, type: r.type });
export const copyEdgeRef = (r: WireEdgeAddress): WireEdgeAddress => ({ ord: r.ord, rel: r.rel, src: copyNodeRef(r.src), tgt: copyNodeRef(r.tgt) });
export const nodeElement = (r: WireNodeRef): ElementAddress => ({ node: copyNodeRef(r) });
export const edgeElement = (r: WireEdgeAddress): ElementAddress => ({ edge: copyEdgeRef(r) });

/** Strict ElementAddress: exactly one key, node or edge, with an exact-shape address. */
export function readElementAddress(o: unknown): ElementAddress | undefined {
  try {
    if (!isPlainObject(o)) return undefined;
    const keys = Object.keys(o);
    if (keys.length !== 1) return undefined;
    if (keys[0] === "node") { const n = readWireNode(o["node"]); return n ? { node: n } : undefined; }
    if (keys[0] === "edge") { const e = readWireEdge(o["edge"]); return e ? { edge: e } : undefined; }
    return undefined;
  } catch { return undefined; }
}
