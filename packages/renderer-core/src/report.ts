// src/report.ts - RenderReport, the cross-renderer semantic projection, strict serialization and comparison (design section 11).
import { canonicalBytesSigned, compareUtf8, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { IgrError } from "./errors.js";
import { buildAccessibleModel } from "./a11y.js";
import { copyEdgeRef, copyNodeRef, isPlainObject, readElementAddress, readWireEdge, readWireNode } from "./elements.js";
import { assertModel, lookupElement } from "./model.js";
import { build as stateBuild, checkState, loneSurrogateAnywhere, schema as stateSchema, stateFromCore, visibilityOf, type StateCore } from "./state.js";
import type { CapabilityManifest, ElementAddress, ElementSet, RenderModel, RenderReport, SemanticProjection, SemanticState } from "./types.js";

const bad = (reason: string, path?: string, detail?: string): IgrError => new IgrError("INVALID_REPORT", reason, path, detail);
const HEX64 = /^[0-9a-f]{64}$/;

/** What a renderer reports: derived only from the model and the committed state, plus its own fidelity. */
export function buildReport(model: RenderModel, state: SemanticState, fidelity: RenderReport["fidelity"]): RenderReport {
  assertModel(model);
  const core = checkState(model, state, "strict");
  const vis = visibilityOf(model, core.hiddenNodes, core.hiddenEdges);
  const marked: RenderReport["marked"] = { selected: { nodes: state.selection.nodes.map(copyNodeRef), edges: state.selection.edges.map(copyEdgeRef) } };
  const s = stateFromCore(model, core);
  if (s.focus) marked.focus = "node" in s.focus ? { node: copyNodeRef(s.focus.node) } : { edge: copyEdgeRef(s.focus.edge) };
  return {
    igr: "IGR/1", scene_sha256: model.sceneSha256, layout_sha256: model.layoutSha256, state: s,
    drawn: { nodes: model.nodes.filter((_, i) => vis.nodes[i]).map((n) => copyNodeRef(n.ref)), edges: model.edges.filter((_, j) => vis.edges[j]).map((e) => copyEdgeRef(e.ref)) },
    marked, accessible: buildAccessibleModel(model, s),
    fidelity: { labels: fidelity.labels, edge_labels: fidelity.edge_labels, motion: fidelity.motion, degradations: [...fidelity.degradations] },
  };
}

/** The report without `fidelity` (design 11): what must be byte-identical across conforming renderers. */
export function semanticProjection(report: RenderReport): SemanticProjection {
  return { igr: report.igr, scene_sha256: report.scene_sha256, layout_sha256: report.layout_sha256, state: report.state, drawn: report.drawn, marked: report.marked, accessible: report.accessible };
}

/** `fidelity` is checked only against the manifest. Returns a description of the first violation, or undefined. */
export function checkFidelity(manifest: CapabilityManifest, report: RenderReport, reducedMotion: boolean): string | undefined {
  const f = report.fidelity;
  const labels = manifest.capabilities["labels"];
  const declared = new Set<string>();
  for (const c of Object.values(manifest.capabilities)) if (c.status === "degraded") for (const d of c.degradations) declared.add(d);
  if (f.labels === "elided" && !(labels.status === "degraded" && labels.degradations.includes("LABELS_ELIDED"))) return "fidelity.labels is elided but the manifest does not declare LABELS_ELIDED";
  if (f.motion === "full" && reducedMotion) return "fidelity.motion is full under reduced motion";
  if ((f.labels === "full" || f.labels === "elided") && labels.status === "unsupported") return "fidelity.labels claims drawn labels but the manifest declares labels unsupported";
  if (f.edge_labels && manifest.capabilities["labels.edge"].status === "unsupported") return "fidelity.edge_labels is true but the manifest declares labels.edge unsupported";
  for (const d of f.degradations) if (!declared.has(d)) return `fidelity.degradations names ${d}, which the manifest does not declare`;
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------------------
// plain-data snapshot of an untrusted projection or report
// ---------------------------------------------------------------------------------------------------------------------------
const ABSENT = Symbol("absent");
function plain(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (depth > 16) throw bad("SCHEMA", undefined, "nesting too deep");
  try {
    if (Array.isArray(v)) { const n = v.length; const out: unknown[] = []; for (let i = 0; i < n; i++) out.push(plain(v[i] as unknown, depth + 1)); return out; }
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const k of Object.keys(v)) { const x = v[k]; if (x === undefined) continue; /* an undefined optional property is absent */ Object.defineProperty(out, k, { value: plain(x, depth + 1), enumerable: true, writable: true, configurable: true }); }
      return out;
    }
  } catch (e) { if (e instanceof IgrError) throw e; throw bad("SCHEMA", undefined, "a property could not be read"); }
  throw bad("SCHEMA", undefined, "not plain data");
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function exactKeys(v: unknown, required: readonly string[], optional: readonly string[], path: string): Record<string, unknown> {
  if (!isObj(v)) throw bad("SCHEMA", path, "object expected");
  const keys = Object.keys(v);
  for (const k of keys) if (!required.includes(k) && !optional.includes(k)) throw bad("SCHEMA", `${path}.${k}`, "unknown field");
  for (const k of required) if (!keys.includes(k)) throw bad("SCHEMA", `${path}.${k}`, "missing field");
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------------
// validateReport (design 11): V1 SCHEMA, V2 UNSUPPORTED_VERSION, V3 UNRESOLVED_ELEMENT, V4 NON_CANONICAL, V5 INCONSISTENT.
// No binding and no hash comparison. First failure wins.
// ---------------------------------------------------------------------------------------------------------------------------
const hashesMatch = (model: RenderModel, top: Record<string, unknown>): boolean => top["scene_sha256"] === model.sceneSha256 && top["layout_sha256"] === model.layoutSha256;

const elementSetShape = (v: unknown, path: string): { nodes: unknown[]; edges: unknown[] } => {
  const o = exactKeys(v, ["edges", "nodes"], [], path);
  if (!Array.isArray(o["nodes"]) || !Array.isArray(o["edges"])) throw bad("SCHEMA", path, "arrays expected");
  (o["nodes"] as unknown[]).forEach((a, i) => { if (!readWireNode(a)) throw bad("SCHEMA", `${path}.nodes[${i}]`, "an address of the exact key shape expected"); });
  (o["edges"] as unknown[]).forEach((a, i) => { if (!readWireEdge(a)) throw bad("SCHEMA", `${path}.edges[${i}]`, "an address of the exact key shape expected"); });
  return o as { nodes: unknown[]; edges: unknown[] };
};
const containerShape = (v: unknown, path: string): void => { if (!readElementAddress(v)) throw bad("SCHEMA", path, "an element address expected"); };

/** V1-V5 on a snapshotted report (kind "report": with fidelity) or projection (without). Returns the plain value and the strict state core. */
function validateReport(model: RenderModel, raw: unknown, kind: "report" | "projection"): { top: Record<string, unknown>; core: StateCore } {
  const KEYS = ["accessible", "drawn", "igr", "layout_sha256", "marked", "scene_sha256", "state"];
  const top = exactKeys(plain(raw), kind === "report" ? [...KEYS, "fidelity"] : KEYS, [], kind);
  // V1 SCHEMA
  if (typeof top["igr"] !== "string") throw bad("SCHEMA", `${kind}.igr`, "string expected");
  for (const k of ["scene_sha256", "layout_sha256"] as const) if (typeof top[k] !== "string" || !HEX64.test(top[k] as string)) throw bad("SCHEMA", `${kind}.${k}`);
  const stateRaw = top["state"];
  if (loneSurrogateAnywhere(stateRaw)) throw bad("SCHEMA", `${kind}.state`, "a lone surrogate");
  let rawState: ReturnType<typeof stateSchema>;
  try { rawState = stateSchema(stateRaw, { rejectNegZero: true, patterns: false, deferVersion: true }); }
  catch (e) { if (e instanceof IgrError && e.code === "INVALID_STATE") throw bad("SCHEMA", `${kind}.state`, `${e.reason ?? ""} ${e.path ?? ""}`.trim()); throw e; }
  const drawn = elementSetShape(top["drawn"], `${kind}.drawn`);
  const marked = exactKeys(top["marked"], ["selected"], ["focus"], `${kind}.marked`);
  const selected = elementSetShape(marked["selected"], `${kind}.marked.selected`);
  if ("focus" in marked) containerShape(marked["focus"], `${kind}.marked.focus`);
  const acc = exactKeys(top["accessible"], ["items", "status", "summary"], [], `${kind}.accessible`);
  if (typeof acc["status"] !== "string" || typeof acc["summary"] !== "string" || !Array.isArray(acc["items"])) throw bad("SCHEMA", `${kind}.accessible`);
  (acc["items"] as unknown[]).forEach((it, i) => {
    const p = `${kind}.accessible.items[${i}]`;
    const o = exactKeys(it, ["address", "focused", "name", "position", "role", "selected", "set_size"], ["description"], p);
    if ((o["role"] !== "node" && o["role"] !== "edge") || typeof o["name"] !== "string" || typeof o["selected"] !== "boolean" || typeof o["focused"] !== "boolean" || typeof o["position"] !== "number" || typeof o["set_size"] !== "number" || (o["description"] !== undefined && typeof o["description"] !== "string")) throw bad("SCHEMA", p);
    containerShape(o["address"], `${p}.address`);
  });
  if (kind === "report") {
    const f = exactKeys(top["fidelity"], ["degradations", "edge_labels", "labels", "motion"], [], "report.fidelity");
    if (typeof f["labels"] !== "string" || typeof f["edge_labels"] !== "boolean" || typeof f["motion"] !== "string" || !Array.isArray(f["degradations"]) || (f["degradations"] as unknown[]).some((d) => typeof d !== "string")) throw bad("SCHEMA", "report.fidelity");
  }
  // V2 UNSUPPORTED_VERSION
  if (top["igr"] !== "IGR/1" || (top["state"] as Record<string, unknown>)["igr"] !== "IGR/1") throw bad("UNSUPPORTED_VERSION", `${kind}.igr`);
  // V3 UNRESOLVED_ELEMENT, in order: state, drawn, marked, accessible.items
  const res = (a: unknown, path: string): void => { if (!lookupElement(model, a)) throw bad("UNRESOLVED_ELEMENT", path); };
  const inner = (c: unknown): unknown => { const a = readElementAddress(c)!; return "node" in a ? a.node : a.edge; };
  if (rawState.focus) res("node" in rawState.focus ? rawState.focus.node : rawState.focus.edge, `${kind}.state.focus`);
  rawState.hidden.edges.forEach((a, i) => res(a, `${kind}.state.hidden.edges[${i}]`));
  rawState.hidden.nodes.forEach((a, i) => res(a, `${kind}.state.hidden.nodes[${i}]`));
  rawState.selection.edges.forEach((a, i) => res(a, `${kind}.state.selection.edges[${i}]`));
  rawState.selection.nodes.forEach((a, i) => res(a, `${kind}.state.selection.nodes[${i}]`));
  drawn.edges.forEach((a, i) => res(a, `${kind}.drawn.edges[${i}]`));
  drawn.nodes.forEach((a, i) => res(a, `${kind}.drawn.nodes[${i}]`));
  if ("focus" in marked) res(inner(marked["focus"]), `${kind}.marked.focus`);
  selected.edges.forEach((a, i) => res(a, `${kind}.marked.selected.edges[${i}]`));
  selected.nodes.forEach((a, i) => res(a, `${kind}.marked.selected.nodes[${i}]`));
  (acc["items"] as Record<string, unknown>[]).forEach((it, i) => res(inner(it["address"]), `${kind}.accessible.items[${i}].address`));
  // V4 NON_CANONICAL: the state does not serialize strictly (duplicate, order, selected or focused element hidden)
  let core: StateCore;
  try { core = stateBuild(model, rawState, "strict", true); }
  catch (e) { if (e instanceof IgrError && e.code === "INVALID_STATE") throw bad("NON_CANONICAL", `${kind}.state`, e.reason); throw e; }
  // V5 INCONSISTENT: set comparisons
  const vis = visibilityOf(model, core.hiddenNodes, core.hiddenEdges);
  const idx = (list: unknown[]): number[] => list.map((a) => lookupElement(model, a)!.index).sort((x, y) => x - y);
  const want = (flags: boolean[]): number[] => flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  if (!same(idx(drawn.nodes), want(vis.nodes)) || !same(idx(drawn.edges), want(vis.edges))) throw bad("INCONSISTENT", `${kind}.drawn`, "drawn must be the effectively visible set");
  if (!same(idx(selected.nodes), core.selNodes) || !same(idx(selected.edges), core.selEdges)) throw bad("INCONSISTENT", `${kind}.marked.selected`, "marked.selected must equal state.selection");
  const markedFocus = "focus" in marked ? lookupElement(model, inner(marked["focus"]))! : undefined;
  const markedEdge = "focus" in marked ? "edge" in readElementAddress(marked["focus"])! : false;
  const focusOk = markedFocus === undefined ? core.focus === undefined : core.focus !== undefined && core.focus.edge === markedEdge && core.focus.index === markedFocus.index && ("src" in markedFocus.ref) === markedEdge;
  if (!focusOk) throw bad("INCONSISTENT", `${kind}.marked.focus`, "marked.focus must equal state.focus");
  return { top, core };
}
const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** IGR-CJ/1 bytes of a projection: validated like a report (V1-V5), bound to the model (hashes, `INCONSISTENT`), state strict. INVALID_STATE never escapes: a report fails as INVALID_REPORT. */
export function serializeProjection(model: RenderModel, projection: SemanticProjection): Uint8Array {
  assertModel(model);
  const { top } = validateReport(model, projection, "projection");
  const st = top["state"] as Record<string, unknown>;
  if (!hashesMatch(model, top) || st["scene_sha256"] !== model.sceneSha256 || st["layout_sha256"] !== model.layoutSha256) throw bad("INCONSISTENT", "projection", "the projection is not bound to this model");
  try { return canonicalBytesSigned(top as CJValue); }
  catch (e) { throw bad("SCHEMA", undefined, e instanceof Error ? e.message : "not canonicalizable"); }
}

// ---------------------------------------------------------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------------------------------------------------------
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
  const join = (k: string) => (path === "" ? k : `${path}.${k}`);
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
  const reference = ser.find((s) => counts.get(s) === max)!; // earliest-listed renderer among the largest groups
  out.push({ path, renderers: names.filter((_, i) => ser[i] !== reference).sort(compareUtf8) });
}

export function compareProjections(model: RenderModel, entries: readonly { renderer: string; report: RenderReport; manifest?: unknown }[]): { agree: boolean; differences: { path: string; renderers: string[] }[] } | { comparable: false } {
  assertModel(model);
  if (!Array.isArray(entries) || entries.length === 0) throw bad("SCHEMA", "entries", "a non-empty array expected");
  const names: string[] = [];
  const values: Record<string, unknown>[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = exactKeys(plain(entries[i]), ["renderer", "report"], ["manifest"], `entries[${i}]`); // the optional manifest is ignored
    if (typeof entry["renderer"] !== "string") throw bad("SCHEMA", `entries[${i}].renderer`);
    names.push(entry["renderer"]);
    const { top } = validateReport(model, entry["report"], "report"); // (1) every entry, in listed order: V1-V5, no binding
    const copy: Record<string, unknown> = { ...top };
    delete copy["fidelity"];
    values.push(copy);
  }
  if (values.some((t) => !hashesMatch(model, t))) return { comparable: false }; // (2) a result, not an error
  const out: { path: string; renderers: string[] }[] = [];
  diff(values, "", names, out); // (3)
  out.sort((a, b) => compareUtf8(a.path, b.path));
  return { agree: out.length === 0, differences: out };
}
