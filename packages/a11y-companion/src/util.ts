// src/util.ts - small internal helpers of a11y-companion: readers of caller-owned plain data (27 14: snapshot once, each property read once, a getter is
// refused), the integer arithmetic of the gate (the pinned micro-pixel position of design 3.4) and the id writer of design 9.2. Not exported by index.ts.
import { IaError } from "isongraph-visualize-interaction-core";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import type { ElementAddress } from "isongraph-visualize-renderer-core";

export const schema = (code: "INVALID_CONFIG" | "INVALID_TREE" | "INVALID_INPUT" | "INVALID_PLAN", path?: string, detail?: string): IaError => new IaError(code, "SCHEMA", path, detail);

/** The own enumerable data properties of a plain object (Object.prototype or null prototype) as a Map, each read once; an own `undefined` is absent. */
export function plainEntries(v: unknown): Map<string, unknown> | undefined {
  try {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
    const p = Object.getPrototypeOf(v) as unknown;
    if (p !== Object.prototype && p !== null) return undefined;
    const out = new Map<string, unknown>();
    for (const k of Object.keys(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d === undefined || d.get !== undefined || d.set !== undefined) return undefined;
      if (d.value !== undefined) out.set(k, d.value as unknown);
    }
    return out;
  } catch { return undefined; }
}

/** The elements of a plain array (a real Array, no accessor element, no hole), each read once; undefined otherwise. */
export function plainArray(v: unknown): unknown[] | undefined {
  try {
    if (!Array.isArray(v)) return undefined;
    const n = v.length;
    const out: unknown[] = new Array<unknown>(n);
    for (let i = 0; i < n; i++) {
      const d = Object.getOwnPropertyDescriptor(v, String(i));
      if (d === undefined || d.get !== undefined || d.set !== undefined) return undefined;
      out[i] = d.value as unknown;
    }
    return out;
  } catch { return undefined; }
}

/**
 * A deep owned copy of plain JSON-like data (objects with fixed keys, arrays, strings, finite numbers, booleans), at most `maxDepth` levels deep (a scan
 * that cannot overflow the stack: the recursion is bounded by maxDepth). A getter, a class instance, a function, a bigint, `null`, a non-finite number
 * or too deep a nesting gives `undefined`. A Map keeps a key such as `__proto__` an ordinary key; the result uses Maps for objects only through `entries`.
 */
export type Plain = string | number | boolean | Plain[] | { [k: string]: Plain };
export function copyPlain(v: unknown, maxDepth: number): Plain | undefined {
  if (maxDepth < 0) return undefined;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) {
    const a = plainArray(v);
    if (a === undefined) return undefined;
    const out: Plain[] = [];
    for (const x of a) { const c = copyPlain(x, maxDepth - 1); if (c === undefined) return undefined; out.push(c); }
    return out;
  }
  const e = plainEntries(v);
  if (e === undefined) return undefined;
  const out: { [k: string]: Plain } = Object.create(null) as { [k: string]: Plain };
  for (const [k, x] of e) { const c = copyPlain(x, maxDepth - 1); if (c === undefined) return undefined; Object.defineProperty(out, k, { value: c, enumerable: true, writable: true, configurable: true }); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// integer arithmetic (design 3.2, 3.4)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function floorDivN(a: number, b: number): number {
  const r = a % b;
  return (a - (r < 0 ? r + b : r)) / b;
}
export const divRoundBig = (a: bigint, b: bigint): bigint => { const n = 2n * a + b, d = 2n * b; let q = n / d; if (n % d !== 0n && n < 0n) q -= 1n; return q; };

/** The pinned micro-pixel position of a layout point (3.4, 27 6, 30 3.3): X = (x - cx) z + w 500000, Y likewise, in micro-pixels. */
export function screenMicro(vp: { center_x: number; center_y: number; width: number; height: number; zoom: number }, x: number, y: number): { X: bigint; Y: bigint } {
  const z = BigInt(vp.zoom);
  return { X: (BigInt(x) - BigInt(vp.center_x)) * z + BigInt(vp.width) * 500_000n, Y: (BigInt(y) - BigInt(vp.center_y)) * z + BigInt(vp.height) * 500_000n };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// ids (design 9.2) and canonical bytes
// ---------------------------------------------------------------------------------------------------------------------------------------------
const HEXCHARS = "0123456789abcdef";
export function hexOf(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) { const b = bytes[i]!; out += HEXCHARS.charAt(b >> 4) + HEXCHARS.charAt(b & 15); }
  return out;
}
export const canon = (v: unknown): Uint8Array => canonicalBytesSigned(v as CJValue);

/** The item id of an element: prefix, `-n-` or `-e-`, lowercase hex of the UTF-8 bytes of the IGS-CJ/1 text of the wire address (30 7.3). */
export function itemId(prefix: string, address: ElementAddress): string {
  return "node" in address ? `${prefix}-n-${hexOf(canon(address.node))}` : `${prefix}-e-${hexOf(canon(address.edge))}`;
}

/** Canonical bytes of an element address as hex (for equality of two addresses). */
export const addressKey = (a: unknown): string => hexOf(canon(a));
