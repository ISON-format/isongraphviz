// src/compare.ts - compareReadouts (design 9.4): V1 schema, V2 version, V3 consistency per entry, then the comparison of 27 11 step 3 by reference.
import { IgrError } from "isongraph-visualize-renderer-core";
import { isEdgeShape, isNodeShape } from "./address.js";
import { XR_FORMAT } from "./constants.js";
import { utf8Encode } from "./utf8.js";
import type { Readout } from "./readout.js";

export type ReadoutComparison = { agree: boolean; differences: { path: string; renderers: string[] }[] } | { comparable: false };

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_REPORT", reason, path, detail);
const HEX64 = /^[0-9a-f]{64}$/;
const ABSENT = Symbol("absent");

/** Plain-data snapshot of an untrusted value: each property read once, accessors and `__proto__` keys refused. */
function plain(v: unknown, path: string, depth = 0): unknown {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (depth > 16) throw bad("SCHEMA", path, "nesting too deep");
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (let i = 0; i < v.length; i++) out.push(plain(v[i] as unknown, `${path}[${i}]`, depth + 1));
    return out;
  }
  if (typeof v === "object") {
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw bad("SCHEMA", path, "not plain data");
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      if (k === "__proto__") throw bad("SCHEMA", `${path}.${k}`, "a __proto__ key");
      const d = Object.getOwnPropertyDescriptor(v, k)!;
      if (d.get !== undefined || d.set !== undefined) throw bad("SCHEMA", `${path}.${k}`, "an accessor");
      if (d.value === undefined) continue; // an undefined optional property is absent
      out[k] = plain(d.value as unknown, `${path}.${k}`, depth + 1);
    }
    return out;
  }
  throw bad("SCHEMA", path, "not plain data");
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function exactKeys(v: unknown, required: readonly string[], optional: readonly string[], path: string): Record<string, unknown> {
  if (!isObj(v)) throw bad("SCHEMA", path, "object expected");
  const keys = Object.keys(v);
  for (const k of keys) if (!required.includes(k) && !optional.includes(k)) throw bad("SCHEMA", `${path}.${k}`, "unknown field");
  for (const k of required) if (!keys.includes(k)) throw bad("SCHEMA", `${path}.${k}`, "missing field");
  return v;
}
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

const nodeKey = (n: { id: string; type: string }): string => JSON.stringify([n.type, n.id]);
const edgeKey = (e: { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } }): string => JSON.stringify([e.ord, e.rel, e.src.type, e.src.id, e.tgt.type, e.tgt.id]);

/** V1 (schema), V2 (version), V3 (every address resolves within the entry's own drawn set; nodes_at + nodes_far partition drawn.nodes). */
function validate(readout: unknown, path: string): Record<string, unknown> {
  const top = exactKeys(readout, ["arrows", "drawn", "igr", "label_units", "labels", "layout_sha256", "marked", "nodes_at", "nodes_far", "scene_sha256", "xr"], [], path);
  // V1
  if (typeof top["igr"] !== "string" || typeof top["xr"] !== "string") throw bad("SCHEMA", path, "igr and xr are strings");
  for (const k of ["scene_sha256", "layout_sha256"] as const) if (typeof top[k] !== "string" || !HEX64.test(top[k] as string)) throw bad("SCHEMA", `${path}.${k}`, "64 lower-case hex digits");
  const nodesOf = (v: unknown, p: string): { id: string; type: string }[] => {
    if (!Array.isArray(v)) throw bad("SCHEMA", p, "array expected");
    v.forEach((a, i) => { if (!isNodeShape(a)) throw bad("SCHEMA", `${p}[${i}]`, "a node address expected"); });
    return v as { id: string; type: string }[];
  };
  const edgesOf = (v: unknown, p: string): { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } }[] => {
    if (!Array.isArray(v)) throw bad("SCHEMA", p, "array expected");
    v.forEach((a, i) => { if (!isEdgeShape(a)) throw bad("SCHEMA", `${p}[${i}]`, "an edge address expected"); });
    return v as { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } }[];
  };
  const drawn = exactKeys(top["drawn"], ["edges", "nodes"], [], `${path}.drawn`);
  const dNodes = nodesOf(drawn["nodes"], `${path}.drawn.nodes`), dEdges = edgesOf(drawn["edges"], `${path}.drawn.edges`);
  const marked = exactKeys(top["marked"], ["selected"], ["focus"], `${path}.marked`);
  const sel = exactKeys(marked["selected"], ["edges", "nodes"], [], `${path}.marked.selected`);
  const sNodes = nodesOf(sel["nodes"], `${path}.marked.selected.nodes`), sEdges = edgesOf(sel["edges"], `${path}.marked.selected.edges`);
  let focusNode: { id: string; type: string } | undefined, focusEdge: ReturnType<typeof edgesOf>[number] | undefined;
  if ("focus" in marked) {
    const f = exactKeys(marked["focus"], [], ["node", "edge"], `${path}.marked.focus`);
    const ks = Object.keys(f);
    if (ks.length !== 1) throw bad("SCHEMA", `${path}.marked.focus`, "exactly one of node or edge");
    if (ks[0] === "node") focusNode = nodesOf([f["node"]], `${path}.marked.focus`)[0]; else focusEdge = edgesOf([f["edge"]], `${path}.marked.focus`)[0];
  }
  const at = top["nodes_at"];
  if (!Array.isArray(at)) throw bad("SCHEMA", `${path}.nodes_at`, "array expected");
  const atNodes = at.map((e, i) => {
    const o = exactKeys(e, ["address", "x", "y"], [], `${path}.nodes_at[${i}]`);
    if (!isNodeShape(o["address"])) throw bad("SCHEMA", `${path}.nodes_at[${i}].address`, "a node address expected");
    if (!isInt(o["x"]) || !isInt(o["y"])) throw bad("SCHEMA", `${path}.nodes_at[${i}]`, "integer coordinates expected");
    return o["address"];
  });
  const farNodes = nodesOf(top["nodes_far"], `${path}.nodes_far`);
  const arrows = edgesOf(top["arrows"], `${path}.arrows`);
  const labels = exactKeys(top["labels"], ["edges", "nodes"], [], `${path}.labels`);
  const labelOf = <T>(v: unknown, p: string, check: (a: unknown) => boolean): T[] => {
    if (!Array.isArray(v)) throw bad("SCHEMA", p, "array expected");
    return v.map((e, i) => {
      const o = exactKeys(e, ["address", "text"], [], `${p}[${i}]`);
      if (!check(o["address"]) || typeof o["text"] !== "string") throw bad("SCHEMA", `${p}[${i}]`, "an address and a text expected");
      return o["address"] as T;
    });
  };
  const lNodes = labelOf<{ id: string; type: string }>(labels["nodes"], `${path}.labels.nodes`, isNodeShape);
  const lEdges = labelOf<ReturnType<typeof edgesOf>[number]>(labels["edges"], `${path}.labels.edges`, isEdgeShape);
  if (!isInt(top["label_units"]) || (top["label_units"] as number) < 0) throw bad("SCHEMA", `${path}.label_units`, "a non-negative integer expected");
  // V2
  if (top["igr"] !== "IGR/1" || top["xr"] !== XR_FORMAT) throw bad("UNSUPPORTED_VERSION", `${path}.xr`);
  // V3
  const drawnNodes = new Set(dNodes.map(nodeKey)), drawnEdges = new Set(dEdges.map(edgeKey));
  const inNodes = (a: { id: string; type: string }, p: string): void => { if (!drawnNodes.has(nodeKey(a))) throw bad("INCONSISTENT", p, "an address outside the drawn set"); };
  const inEdges = (a: Parameters<typeof edgeKey>[0], p: string): void => { if (!drawnEdges.has(edgeKey(a))) throw bad("INCONSISTENT", p, "an address outside the drawn set"); };
  sNodes.forEach((a, i) => inNodes(a, `${path}.marked.selected.nodes[${i}]`));
  sEdges.forEach((a, i) => inEdges(a, `${path}.marked.selected.edges[${i}]`));
  if (focusNode) inNodes(focusNode, `${path}.marked.focus`);
  if (focusEdge) inEdges(focusEdge, `${path}.marked.focus`);
  arrows.forEach((a, i) => inEdges(a, `${path}.arrows[${i}]`));
  lNodes.forEach((a, i) => inNodes(a, `${path}.labels.nodes[${i}]`));
  lEdges.forEach((a, i) => inEdges(a, `${path}.labels.edges[${i}]`));
  const placed = [...atNodes, ...farNodes].map(nodeKey).sort();
  const want = [...drawnNodes].sort();
  if (placed.length !== want.length || placed.some((k, i) => k !== want[i])) throw bad("INCONSISTENT", `${path}.nodes_at`, "nodes_at and nodes_far partition drawn.nodes");
  return top;
}

// ---- the comparison of 27 11 step 3 --------------------------------------------------------------------------------------------------
function compareUtf8(a: string, b: string): number {
  const x = utf8Encode(a), y = utf8Encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}
const canon = (v: unknown): string => {
  if (v === ABSENT) return "\u0000absent";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
};

/** Deepest differing values. Per path the majority value is the reference (a tie: the value of the first-listed renderer among the tied groups). */
function diff(vals: unknown[], path: string, names: string[], out: { path: string; renderers: string[] }[]): void {
  const ser = vals.map(canon);
  if (ser.every((s) => s === ser[0])) return;
  const join = (k: string): string => (path === "" ? k : `${path}.${k}`);
  if (vals.every(isObj)) {
    const keys = [...new Set(vals.flatMap((v) => Object.keys(v as Record<string, unknown>)))].sort();
    for (const k of keys) diff(vals.map((v) => (Object.keys(v as object).includes(k) ? (v as Record<string, unknown>)[k] : ABSENT)), join(k), names, out);
    return;
  }
  if (vals.every(Array.isArray) && new Set(vals.map((v) => (v as unknown[]).length)).size === 1) {
    const n = (vals[0] as unknown[]).length;
    for (let i = 0; i < n; i++) diff(vals.map((v) => (v as unknown[])[i]), `${path}[${i}]`, names, out);
    return;
  }
  const counts = new Map<string, number>();
  for (const s of ser) counts.set(s, (counts.get(s) ?? 0) + 1);
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  const reference = ser.find((s) => counts.get(s) === max)!;
  out.push({ path, renderers: names.filter((_, i) => ser[i] !== reference).sort(compareUtf8) });
}

/**
 * compareReadouts(entries) (9.4): entries `{renderer, readout}` (an own-property snapshot). Each is validated in order, first failure wins: V1, V2, V3.
 * If a top-level hash differs from the first entry's the result is `{ comparable: false }`; otherwise reference value, tie rule, path syntax and sorting
 * are those of `compareProjections` step 3.
 */
export function compareReadouts(entries: readonly { renderer: string; readout: Readout }[]): ReadoutComparison {
  const list = plain(entries, "entries");
  if (!Array.isArray(list) || list.length === 0) throw bad("SCHEMA", "entries", "a non-empty array expected");
  const names: string[] = [];
  const values: Record<string, unknown>[] = [];
  for (let i = 0; i < list.length; i++) {
    const entry = exactKeys(list[i], ["readout", "renderer"], [], `entries[${i}]`);
    if (typeof entry["renderer"] !== "string") throw bad("SCHEMA", `entries[${i}].renderer`, "string expected");
    names.push(entry["renderer"]);
    values.push(validate(entry["readout"], `entries[${i}].readout`));
  }
  const first = values[0]!;
  if (values.some((t) => t["scene_sha256"] !== first["scene_sha256"] || t["layout_sha256"] !== first["layout_sha256"])) return { comparable: false };
  const out: { path: string; renderers: string[] }[] = [];
  diff(values, "", names, out);
  out.sort((a, b) => compareUtf8(a.path, b.path));
  return { agree: out.length === 0, differences: out };
}
