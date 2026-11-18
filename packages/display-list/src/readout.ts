// src/readout.ts - the cross-renderer semantic readout igr-xr/1 (design 9.1, 9.2, 9.4): assembly, the list and SVG backends, serialization, comparison.
import { IgrError } from "isongraph-visualize-renderer-core";
import { canonicalJson } from "./canon.js";
import { utf8Encode } from "./utf8.js";
import { GUARD_MARGIN, XR_FORMAT } from "./constants.js";
import type { DisplayList, ElementAddress, WireEdge, WireNode } from "./types.js";

export interface Readout {
  igr: "IGR/1";
  xr: "igr-xr/1";
  scene_sha256: string;
  layout_sha256: string;
  drawn: { nodes: WireNode[]; edges: WireEdge[] };
  marked: { selected: { nodes: WireNode[]; edges: WireEdge[] }; focus?: ElementAddress };
  nodes_at: { address: WireNode; x: number; y: number }[];
  nodes_far: WireNode[];
  arrows: WireEdge[];
  labels: { nodes: { address: WireNode; text: string }[]; edges: { address: WireEdge; text: string }[] };
  label_units: number;
}

/** What a backend reads out of its artifact; `assembleReadout` is the one place the readout is put together (also used by the plan reader of V7). */
export interface ReadoutParts {
  scene_sha256: string;
  layout_sha256: string;
  /** The viewport of the artifact, in CSS pixels: the guard box of 9.1 is [-256000, 1000 W + 256000] x [-256000, 1000 H + 256000] in milli-pixels. */
  width: number;
  height: number;
  /** Drawn nodes in scene order; the centre is `undefined` when the backend does not state one. */
  nodes: { address: WireNode; x: number; y: number }[];
  edges: WireEdge[];
  selectedNodes: WireNode[];
  selectedEdges: WireEdge[];
  focus?: ElementAddress;
  arrows: WireEdge[];
  labelNodes: { address: WireNode; text: string }[];
  labelEdges: { address: WireEdge; text: string }[];
}

const cp = (n: WireNode): WireNode => ({ id: n.id, type: n.type });
const cpe = (e: WireEdge): WireEdge => ({ ord: e.ord, rel: e.rel, src: cp(e.src), tgt: cp(e.tgt) });

/** The guard box membership of a node centre (closed). */
export function inGuardBox(x: number, y: number, width: number, height: number): boolean {
  return x >= -GUARD_MARGIN && x <= 1000 * width + GUARD_MARGIN && y >= -GUARD_MARGIN && y <= 1000 * height + GUARD_MARGIN;
}

export function assembleReadout(p: ReadoutParts): Readout {
  const at: Readout["nodes_at"] = [], far: WireNode[] = [];
  for (const n of p.nodes) {
    if (inGuardBox(n.x, n.y, p.width, p.height)) at.push({ address: cp(n.address), x: n.x, y: n.y });
    else far.push(cp(n.address));
  }
  let units = 0;
  for (const l of [...p.labelNodes, ...p.labelEdges]) units += l.text.length;
  const marked: Readout["marked"] = { selected: { nodes: p.selectedNodes.map(cp), edges: p.selectedEdges.map(cpe) } };
  if (p.focus !== undefined) marked.focus = "node" in p.focus ? { node: cp(p.focus.node) } : { edge: cpe(p.focus.edge) };
  return {
    igr: "IGR/1", xr: XR_FORMAT, scene_sha256: p.scene_sha256, layout_sha256: p.layout_sha256,
    drawn: { nodes: p.nodes.map((n) => cp(n.address)), edges: p.edges.map(cpe) },
    marked, nodes_at: at, nodes_far: far, arrows: p.arrows.map(cpe),
    labels: { nodes: p.labelNodes.map((l) => ({ address: cp(l.address), text: l.text })), edges: p.labelEdges.map((l) => ({ address: cpe(l.address), text: l.text })) },
    label_units: units,
  };
}

/** The readout of a display list (9.3): every drawn element, the marks from the flags, the centres, the arrows and the drawn texts. */
/** A table entry of a hand-built list, or an IgrError (audit N-4). */
function entry<T>(arr: readonly T[], i: number, what: string): T {
  const v = arr[i];
  if (v === undefined) throw bad("SCHEMA", "list", `${what} is not in the element table`);
  return v;
}

export function readoutFromList(list: DisplayList): Readout {
  if (typeof list !== "object" || list === null || !Array.isArray(list.nodes) || !Array.isArray(list.edges) || !Array.isArray(list.records)) throw bad("SCHEMA", "list", "a display list expected");
  const nd = list.nodes.length;
  const nodes: ReadoutParts["nodes"] = [], selectedNodes: WireNode[] = [], selectedEdges: WireEdge[] = [], arrows: WireEdge[] = [];
  const labelNodes: ReadoutParts["labelNodes"] = [], labelEdges: ReadoutParts["labelEdges"] = [];
  let focus: ElementAddress | undefined;
  for (const r of list.records) {
    if (r[0] === "N") {
      const a = entry(list.nodes, r[1] - 1, "a node pid");
      nodes.push({ address: a, x: r[4] as number, y: r[5] as number });
      if ((r[3] as number) & 1) selectedNodes.push(a);
      if ((r[3] as number) & 2) focus = { node: a };
    } else if (r[0] === "E") {
      const a = entry(list.edges, r[1] - nd - 1, "an edge pid");
      if ((r[2] as number) & 1) selectedEdges.push(a);
      if ((r[2] as number) & 2) focus = { edge: a };
    } else if (r[0] === "A") arrows.push(entry(list.edges, r[1] - nd - 1, "an edge pid"));
    else if (r[0] === "T") {
      if (r[2] === 0) labelNodes.push({ address: entry(list.nodes, r[1] - 1, "a node pid"), text: r[5] as string });
      else labelEdges.push({ address: entry(list.edges, r[1] - nd - 1, "an edge pid"), text: r[5] as string });
    }
  }
  return assembleReadout({
    scene_sha256: list.sceneSha256, layout_sha256: list.layoutSha256, width: list.width, height: list.height,
    nodes, edges: [...list.edges], selectedNodes, selectedEdges, ...(focus === undefined ? {} : { focus }), arrows, labelNodes, labelEdges,
  });
}

export function serializeReadout(r: Readout): Uint8Array {
  return utf8Encode(canonicalJson(r) + "\n");
}

// ---- SvgReadoutLike (9.2) -------------------------------------------------------------------------------------------------------

/** The structural input of readoutFromSvgReadout: the required fields exact, extra keys ignored (V5's result has more). */
export interface SvgReadoutLike {
  scene_sha256: string;
  layout_sha256: string;
  width: number;
  height: number;
  directed: boolean;
  nodes: { address: WireNode; cx: string; cy: string; selected: boolean; focused: boolean; label?: string }[];
  edges: { address: WireEdge; selected: boolean; focused: boolean; marker: boolean; label?: string }[];
}

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);
const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$/;

/** A printed number (the grammar of 30 3.2 `fmt`) to milli-pixels by an exact decimal string parse, never through a float. */
function milli(s: unknown, path: string): number {
  if (typeof s !== "string") throw bad("SCHEMA", path, "string expected");
  if (!DECIMAL.test(s) || s === "-0") throw bad("SCHEMA", path, "not a number as 30 3.2 prints it");
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf(".");
  const whole = dot < 0 ? body : body.slice(0, dot);
  const frac = dot < 0 ? "" : body.slice(dot + 1);
  const v = BigInt(whole) * 1000n + BigInt((frac + "000").slice(0, 3));
  const r = neg ? -v : v;
  if (r > BigInt(Number.MAX_SAFE_INTEGER) || r < -BigInt(Number.MAX_SAFE_INTEGER)) throw bad("SCHEMA", path, "out of range");
  return Number(r);
}
const need = <T>(o: Record<string, unknown>, k: string, ok: (v: unknown) => v is T, path: string): T => {
  const v = o[k];
  if (!ok(v)) throw bad("SCHEMA", `${path}.${k}`, "missing or mistyped");
  return v;
};
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const plainRead = (o: unknown, path: string): Record<string, unknown> => {
  if (typeof o !== "object" || o === null || Array.isArray(o)) throw bad("SCHEMA", path, "object expected");
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k === "__proto__") throw bad("SCHEMA", `${path}.${k}`, "a __proto__ key");
    const d = Object.getOwnPropertyDescriptor(o, k)!;
    if (d.get !== undefined || d.set !== undefined) throw bad("SCHEMA", `${path}.${k}`, "an accessor");
    out[k] = d.value as unknown;
  }
  return out;
};

/** A node address as a fresh own-data copy: each property is read once, accessors and `__proto__` are refused (27 14; audit M-5). */
function readNode(v: unknown, path: string): WireNode {
  const o = plainRead(v, path);
  const keys = Object.keys(o);
  if (keys.length !== 2 || typeof o["id"] !== "string" || typeof o["type"] !== "string") throw bad("SCHEMA", path, "a node address expected");
  return { id: o["id"], type: o["type"] };
}
function readEdge(v: unknown, path: string): WireEdge {
  const o = plainRead(v, path);
  const keys = Object.keys(o);
  if (keys.length !== 4 || typeof o["ord"] !== "string" || typeof o["rel"] !== "string") throw bad("SCHEMA", path, "an edge address expected");
  return { ord: o["ord"], rel: o["rel"], src: readNode(o["src"], `${path}.src`), tgt: readNode(o["tgt"], `${path}.tgt`) };
}

/** readoutFromSvgReadout(r) (9.2): `marker` -> arrows, the decoded label text -> labels, selected and focused -> marked. */
export function readoutFromSvgReadout(r: SvgReadoutLike): Readout {
  const o = plainRead(r, "svg");
  const scene = need(o, "scene_sha256", isStr, "svg"), layout = need(o, "layout_sha256", isStr, "svg");
  const width = need(o, "width", isNum, "svg"), height = need(o, "height", isNum, "svg");
  need(o, "directed", isBool, "svg");
  const rawNodes = need(o, "nodes", isArr, "svg"), rawEdges = need(o, "edges", isArr, "svg");
  const nodes: ReadoutParts["nodes"] = [], selectedNodes: WireNode[] = [], labelNodes: ReadoutParts["labelNodes"] = [];
  let focus: ElementAddress | undefined;
  rawNodes.forEach((raw, i) => {
    const n = plainRead(raw, `svg.nodes[${i}]`);
    const address = readNode(n["address"], `svg.nodes[${i}].address`);
    const x = milli(n["cx"], `svg.nodes[${i}].cx`), y = milli(n["cy"], `svg.nodes[${i}].cy`);
    const selected = need(n, "selected", isBool, `svg.nodes[${i}]`), focused = need(n, "focused", isBool, `svg.nodes[${i}]`);
    if (n["label"] !== undefined && !isStr(n["label"])) throw bad("SCHEMA", `svg.nodes[${i}].label`, "string expected");
    nodes.push({ address, x, y });
    if (selected) selectedNodes.push(address);
    if (focused) focus = { node: address };
    if (typeof n["label"] === "string") labelNodes.push({ address, text: n["label"] });
  });
  const edges: WireEdge[] = [], selectedEdges: WireEdge[] = [], arrows: WireEdge[] = [], labelEdges: ReadoutParts["labelEdges"] = [];
  rawEdges.forEach((raw, i) => {
    const e = plainRead(raw, `svg.edges[${i}]`);
    const address = readEdge(e["address"], `svg.edges[${i}].address`);
    const selected = need(e, "selected", isBool, `svg.edges[${i}]`), focused = need(e, "focused", isBool, `svg.edges[${i}]`), marker = need(e, "marker", isBool, `svg.edges[${i}]`);
    if (e["label"] !== undefined && !isStr(e["label"])) throw bad("SCHEMA", `svg.edges[${i}].label`, "string expected");
    edges.push(address);
    if (selected) selectedEdges.push(address);
    if (focused) focus = { edge: address };
    if (marker) arrows.push(address);
    if (typeof e["label"] === "string") labelEdges.push({ address, text: e["label"] });
  });
  return assembleReadout({ scene_sha256: scene, layout_sha256: layout, width, height, nodes, edges, selectedNodes, selectedEdges, ...(focus === undefined ? {} : { focus }), arrows, labelNodes, labelEdges });
}
