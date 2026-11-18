// src/own.ts - own-data snapshots of caller-owned objects (27 14: "read each property once"): a plain object is copied property by property, an accessor or a
// `__proto__` key is refused, and every later read is of the copy (audit M-1).
import { IgrError } from "isongraph-visualize-renderer-core";

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);

export const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/** An own-data copy (prototype-less) of a plain object; `SCHEMA` for a non-object, a `__proto__` key or an accessor. */
export function ownData(v: unknown, path: string): Record<string, unknown> {
  if (!isPlain(v)) throw bad("SCHEMA", path, "plain object expected");
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (k === "__proto__") throw bad("SCHEMA", `${path}.${k}`, "a __proto__ key");
    const d = Object.getOwnPropertyDescriptor(v, k)!;
    if (d.get !== undefined || d.set !== undefined) throw bad("SCHEMA", `${path}.${k}`, "an accessor");
    out[k] = d.value as unknown;
  }
  return out;
}
