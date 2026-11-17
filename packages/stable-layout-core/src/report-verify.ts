// 28-STABLE-LAYOUT-DESIGN.md section 9.3: standalone verification of an IGLS/1 report. First failure wins, INVALID_REPORT.
import { IDENTIFIER, canonicalizeSigned, compareNodeRef, compareUtf8, hasLoneSurrogate, nodeKey, nodeRefFromWire, sha256Hex, type CJValue } from "isongraph-visualize-scene-core/primitives";
import type { NodeRef } from "isongraph-visualize-scene-core";
import { StableLayoutError } from "./errors.js";
import { divRound, divRoundN, isqrt } from "./intmath.js";
import { MAX_NODE_KEY_UNITS, MAX_REL_UNITS, Meter, type StableBudget } from "./limits.js";
import { DIRECTIONS, PLACEMENT_ALGORITHM } from "./placement.js";
import { aggregateOf, distOf, extentsOf, transformOf } from "./report.js";
import type { DisplacementReport, NodeRecord } from "./types.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: Obj, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const bad = (reason: string, path?: string, detail?: string): StableLayoutError => new StableLayoutError("INVALID_REPORT", reason, path, detail);
const HEX64 = /^[0-9a-f]{64}$/;
const DEC = /^(0|[1-9][0-9]*)$/;
const TWO50 = 2 ** 50, TWO51 = 2 ** 51, TWO52 = 2 ** 52;
const RESERVED_TOP = ["groups", "relax", "viewport", "report_sha256"];
const TOP = ["address_scheme", "aggregate", "edges", "extent", "igls", "mode", "next", "nodes", "placement", "previous", "scale", "transform_hint"];
const AGG = ["added", "common", "max_dist", "max_offset", "mean_dist", "moved", "moved_ppm", "removed", "rms_dist", "sum_dist", "sum_dist_sq"];
const EXT = ["max_x", "max_y", "min_x", "min_y"];
const PLC = ["algorithm", "max_rings", "min_separation", "radius"];
const PREV = ["directed", "layout_sha256", "scene_sha256"];
const HINT = ["dx", "dy"];
const KEPT = ["dist", "dx", "dy", "ref", "status", "x", "x_prev", "y", "y_prev"];
const ADDED_INC = ["anchor_kind", "anchor_x", "anchor_y", "direction", "offset", "ref", "ring", "status", "wave", "x", "y"];
const ADDED_BARE = ["ref", "status", "x", "y"];
const REMOVED = ["ref", "status", "x_prev", "y_prev"];
const MODES = ["incremental", "cold", "measured"];

/** A closed object: reserved names, then unknown keys, then missing keys. */
function closed(v: unknown, path: string, required: readonly string[], reserved: readonly string[] = []): Obj {
  if (!isObj(v)) throw bad("SCHEMA", path, "object expected");
  const keys = Object.keys(v);
  for (const k of keys) if (reserved.includes(k)) throw bad("RESERVED_FIELD", `${path}.${k}`);
  for (const k of keys) if (!required.includes(k)) throw bad("UNKNOWN_FIELD", `${path}.${k}`);
  for (const k of required) if (!has(v, k)) throw bad("MISSING_FIELD", `${path}.${k}`);
  return v;
}
/** An optional structure: {"present": false} or {"present": true, ...keys}. */
function presentShape(v: unknown, path: string, keys: readonly string[]): Obj {
  if (!isObj(v)) throw bad("SCHEMA", path, "object expected");
  const p = v["present"];
  if (has(v, "present") && typeof p !== "boolean") throw bad("INVALID_VALUE", `${path}.present`);
  return closed(v, path, p === true ? ["present", ...keys] : ["present"]);
}
const arrayOf = (v: unknown, path: string): unknown[] => { if (!Array.isArray(v)) throw bad("SCHEMA", path, "array expected"); return v; };

function closedRef(v: unknown, path: string): Obj { return closed(v, path, ["id", "type"]); }
function closedEdge(v: unknown, path: string): void {
  const e = closed(v, path, ["ord", "rel", "src", "tgt"]);
  closedRef(e["src"], `${path}.src`);
  closedRef(e["tgt"], `${path}.tgt`);
}

/** Section 9.3 closed-object checks: the top level first, then nested objects in canonical key order, depth first. */
function checkClosed(top: Obj, mode: string): void {
  for (const k of [...TOP].sort()) {
    const v = top[k];
    switch (k) {
      case "aggregate": closed(v, "$.aggregate", AGG); break;
      case "edges": {
        const e = closed(v, "$.edges", ["added", "common", "removed"]);
        arrayOf(e["added"], "$.edges.added").forEach((x, i) => closedEdge(x, `$.edges.added[${i}]`));
        arrayOf(e["removed"], "$.edges.removed").forEach((x, i) => closedEdge(x, `$.edges.removed[${i}]`));
        break;
      }
      case "extent": {
        const e = closed(v, "$.extent", ["next", "previous"]);
        presentShape(e["next"], "$.extent.next", EXT);
        presentShape(e["previous"], "$.extent.previous", EXT);
        break;
      }
      case "next": closed(v, "$.next", PREV); break;
      case "nodes":
        arrayOf(v, "$.nodes").forEach((n, i) => {
          const path = `$.nodes[${i}]`;
          if (!isObj(n)) throw bad("SCHEMA", path, "object expected");
          const status = n["status"];
          if (status !== "kept" && status !== "added" && status !== "removed") throw bad("INVALID_VALUE", `${path}.status`);
          const keys = status === "kept" ? KEPT : status === "removed" ? REMOVED : mode === "incremental" ? ADDED_INC : ADDED_BARE;
          const r = closed(n, path, keys);
          closedRef(r["ref"], `${path}.ref`);
        });
        break;
      case "placement": presentShape(v, "$.placement", PLC); break;
      case "previous": presentShape(v, "$.previous", PREV); break;
      case "transform_hint": presentShape(v, "$.transform_hint", HINT); break;
      default: break; // scalar top-level fields
    }
  }
}

function int(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || Object.is(v, -0) || v < min || v > max) throw bad("INVALID_VALUE", path);
  return v;
}
const coord = (v: unknown, path: string): number => int(v, path, -TWO50, TWO50);

function checkRef(r: Obj, path: string): { nref: NodeRef; key: string } {
  const id = r["id"], type = r["type"];
  if (typeof id !== "string" || typeof type !== "string" || !IDENTIFIER.test(type) || hasLoneSurrogate(id)) throw bad("INVALID_VALUE", path);
  let nref: NodeRef;
  try { nref = nodeRefFromWire({ id, type }); } catch { throw bad("INVALID_VALUE", `${path}.id`); }
  return { nref, key: "" };
}
function checkEdgeValues(e: Obj, path: string): void {
  checkRef(e["src"] as Obj, `${path}.src`);
  checkRef(e["tgt"] as Obj, `${path}.tgt`);
  const rel = e["rel"];
  if (typeof rel !== "string" || !IDENTIFIER.test(rel) || hasLoneSurrogate(rel)) throw bad("INVALID_VALUE", `${path}.rel`);
  if (e["ord"] !== "0") throw bad("INVALID_VALUE", `${path}.ord`);
}

export interface ParsedReport { report: DisplacementReport; text: string; sha256: string; refs: NodeRef[]; edgeRefs: { src: NodeRef; tgt: NodeRef }[][] }

/**
 * Admission and verification of report bytes (already within maxReportBytes and owned): the JSON parse, the counts, the V1 charge,
 * then the schema, canonical, integrity and consistency steps of section 9.3. `meter` null means the call is not metered
 * (the producer re-verifying its own output).
 */
export async function verifyReportBytes(bytes: Uint8Array, budget: StableBudget, meter: Meter | null): Promise<ParsedReport> {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw bad("SCHEMA", undefined, "byte-order mark");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw bad("SCHEMA", undefined, "not valid UTF-8"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw bad("SCHEMA", undefined, "not JSON"); }
  if (!isObj(parsed)) throw bad("SCHEMA", "$", "object expected");
  const top = parsed;

  // counts (defensive: a malformed shape is reported by the schema step)
  const nodesRaw = Array.isArray(top["nodes"]) ? top["nodes"] : [];
  const edgesObj = isObj(top["edges"]) ? top["edges"] : {};
  const addedRaw = Array.isArray(edgesObj["added"]) ? edgesObj["added"] : [];
  const removedRaw = Array.isArray(edgesObj["removed"]) ? edgesObj["removed"] : [];
  if (nodesRaw.length > 2 * budget.maxNodes) throw new StableLayoutError("RESOURCE_LIMIT", "NODE_LIMIT", "$.nodes", `${nodesRaw.length} records > ${2 * budget.maxNodes}`);
  if (addedRaw.length + removedRaw.length > 2 * budget.maxEdges) throw new StableLayoutError("RESOURCE_LIMIT", "EDGE_LIMIT", "$.edges", `${addedRaw.length + removedRaw.length} entries > ${2 * budget.maxEdges}`);
  if (meter !== null) meter.charge(3 * (nodesRaw.length + addedRaw.length + removedRaw.length)); // V1

  // schema: closed objects (the mode is needed first, to know the record shapes)
  for (const k of Object.keys(top)) if (RESERVED_TOP.includes(k)) throw bad("RESERVED_FIELD", `$.${k}`);
  for (const k of Object.keys(top)) if (!TOP.includes(k)) throw bad("UNKNOWN_FIELD", `$.${k}`);
  for (const k of TOP) if (!has(top, k)) throw bad("MISSING_FIELD", `$.${k}`);
  const mode = top["mode"];
  if (typeof mode !== "string" || !MODES.includes(mode)) throw bad("INVALID_VALUE", "$.mode");
  checkClosed(top, mode);

  // versions, scale, hash shapes
  if (top["igls"] !== "IGLS/1") throw bad("UNSUPPORTED_VERSION", "$.igls");
  if (top["address_scheme"] !== "igs-addr/1") throw bad("UNSUPPORTED_VERSION", "$.address_scheme");
  if (top["scale"] !== 1000) throw bad("INVALID_VALUE", "$.scale");
  const next = top["next"] as Obj, prev = top["previous"] as Obj;
  for (const k of ["scene_sha256", "layout_sha256"]) if (typeof next[k] !== "string" || !HEX64.test(next[k] as string)) throw bad("INVALID_HASH", `$.next.${k}`);
  if (prev["present"] === true) for (const k of ["scene_sha256", "layout_sha256"]) if (typeof prev[k] !== "string" || !HEX64.test(prev[k] as string)) throw bad("INVALID_HASH", `$.previous.${k}`);

  // INVALID_VALUE group: integer domain, decimal strings, direction, ring, ord, coordinate domain
  const agg = top["aggregate"] as Obj;
  for (const k of AGG) {
    if (k === "sum_dist" || k === "sum_dist_sq") { if (typeof agg[k] !== "string" || !DEC.test(agg[k] as string)) throw bad("INVALID_VALUE", `$.aggregate.${k}`); }
    else int(agg[k], `$.aggregate.${k}`, 0, Number.MAX_SAFE_INTEGER);
  }
  if (typeof next["directed"] !== "boolean" || (prev["present"] === true && typeof prev["directed"] !== "boolean")) throw bad("INVALID_VALUE", "$.next.directed");
  const edges = top["edges"] as Obj;
  int(edges["common"], "$.edges.common", 0, Number.MAX_SAFE_INTEGER);
  const placementObj = top["placement"] as Obj;
  const placementPresent = placementObj["present"] === true;
  let maxRings = Infinity;
  if (placementPresent) {
    if (placementObj["algorithm"] !== PLACEMENT_ALGORITHM) throw bad("UNSUPPORTED_VERSION", "$.placement.algorithm");
    maxRings = int(placementObj["max_rings"], "$.placement.max_rings", 1, 1024);
    int(placementObj["min_separation"], "$.placement.min_separation", 1, 2 ** 26);
    int(placementObj["radius"], "$.placement.radius", 1, 2 ** 26);
  }
  const ext = top["extent"] as Obj;
  for (const side of ["next", "previous"]) {
    const e = ext[side] as Obj;
    if (e["present"] === true) for (const k of EXT) coord(e[k], `$.extent.${side}.${k}`);
  }
  const hint = top["transform_hint"] as Obj;
  if (hint["present"] === true) for (const k of HINT) int(hint[k], `$.transform_hint.${k}`, -TWO51, TWO51);
  const records = nodesRaw as Obj[];
  const refs: NodeRef[] = [];
  records.forEach((r, i) => {
    const p = `$.nodes[${i}]`;
    refs.push(checkRef(r["ref"] as Obj, `${p}.ref`).nref);
    if (r["status"] === "kept") {
      coord(r["x"], `${p}.x`); coord(r["y"], `${p}.y`); coord(r["x_prev"], `${p}.x_prev`); coord(r["y_prev"], `${p}.y_prev`);
      int(r["dx"], `${p}.dx`, -TWO51, TWO51); int(r["dy"], `${p}.dy`, -TWO51, TWO51); int(r["dist"], `${p}.dist`, 0, TWO52 - 1);
    } else if (r["status"] === "removed") {
      coord(r["x_prev"], `${p}.x_prev`); coord(r["y_prev"], `${p}.y_prev`);
    } else {
      coord(r["x"], `${p}.x`); coord(r["y"], `${p}.y`);
      if (has(r, "anchor_kind")) {
        if (r["anchor_kind"] !== "neighbours" && r["anchor_kind"] !== "seed") throw bad("INVALID_VALUE", `${p}.anchor_kind`);
        int(r["anchor_x"], `${p}.anchor_x`, -(TWO50 + 2 ** 26), TWO50 + 2 ** 26); int(r["anchor_y"], `${p}.anchor_y`, -(TWO50 + 2 ** 26), TWO50 + 2 ** 26);
        int(r["direction"], `${p}.direction`, 0, 15);
        int(r["ring"], `${p}.ring`, 0, placementPresent ? maxRings - 1 : Number.MAX_SAFE_INTEGER);
        int(r["offset"], `${p}.offset`, 0, Number.MAX_SAFE_INTEGER); int(r["wave"], `${p}.wave`, 0, Number.MAX_SAFE_INTEGER);
      }
    }
  });
  const edgeRefs: { src: NodeRef; tgt: NodeRef }[][] = [];
  for (const side of ["added", "removed"] as const) {
    const list = (edges[side] as Obj[]);
    const decoded: { src: NodeRef; tgt: NodeRef }[] = [];
    list.forEach((e, i) => { checkEdgeValues(e, `$.edges.${side}[${i}]`); decoded.push({ src: nodeRefFromWire(e["src"] as { id: string; type: string }), tgt: nodeRefFromWire(e["tgt"] as { id: string; type: string }) }); });
    edgeRefs.push(decoded);
  }
  // key limits (section 12.2): per element, before any Map or edge key is built
  records.forEach((r, i) => {
    const units = nodeKey(refs[i]!).length;
    if (units > MAX_NODE_KEY_UNITS) throw new StableLayoutError("RESOURCE_LIMIT", "KEY_LENGTH", `$.nodes[${i}].ref`, `node key ${units} units > ${MAX_NODE_KEY_UNITS}`);
  });
  for (const side of ["added", "removed"] as const) {
    (edges[side] as Obj[]).forEach((e, i) => {
      const d = edgeRefs[side === "added" ? 0 : 1]![i]!;
      for (const [end, ref] of [["src", d.src], ["tgt", d.tgt]] as const) {
        const units = nodeKey(ref).length;
        if (units > MAX_NODE_KEY_UNITS) throw new StableLayoutError("RESOURCE_LIMIT", "KEY_LENGTH", `$.edges.${side}[${i}].${end}`, `node key ${units} units > ${MAX_NODE_KEY_UNITS}`);
      }
      const units = JSON.stringify(e["rel"]).length;
      if (units > MAX_REL_UNITS) throw new StableLayoutError("RESOURCE_LIMIT", "KEY_LENGTH", `$.edges.${side}[${i}].rel`, `relation ${units} units > ${MAX_REL_UNITS}`);
    });
  }

  // canonical: serialize the parsed report again WITHOUT reordering any array and compare the bytes
  let canonical: string;
  try { canonical = canonicalizeSigned(top as unknown as CJValue); } catch (e) { throw bad("INVALID_VALUE", undefined, e instanceof Error ? e.message : String(e)); }
  if (canonical !== text) throw bad("NON_CANONICAL");

  // integrity: strictly increasing NodeRef/2 order for nodes, strictly increasing edge order for each edge array
  for (let i = 1; i < refs.length; i++) {
    const c = compareNodeRef(refs[i - 1]!, refs[i]!);
    if (c === 0) throw bad("DUPLICATE_NODE_REF", `$.nodes[${i}]`);
    if (c > 0) throw bad("NON_CANONICAL_ORDER", `$.nodes[${i}]`);
  }
  for (const [side, si] of [["added", 0], ["removed", 1]] as const) {
    const list = edges[side] as Obj[], d = edgeRefs[si]!;
    for (let i = 1; i < list.length; i++) {
      const c = compareNodeRef(d[i - 1]!.src, d[i]!.src) || compareUtf8(list[i - 1]!["rel"] as string, list[i]!["rel"] as string)
        || compareNodeRef(d[i - 1]!.tgt, d[i]!.tgt) || compareUtf8(list[i - 1]!["ord"] as string, list[i]!["ord"] as string);
      if (c === 0) throw bad("DUPLICATE_EDGE_REF", `$.edges.${side}[${i}]`);
      if (c > 0) throw bad("NON_CANONICAL_ORDER", `$.edges.${side}[${i}]`);
    }
  }

  // consistency: everything recomputed from the report alone
  const report = top as unknown as DisplacementReport;
  const nodes = report.nodes;
  const kept = nodes.filter((n): n is Extract<NodeRecord, { status: "kept" }> => n.status === "kept");
  const addedCount = nodes.filter((n) => n.status === "added").length;
  const plc = report.placement;
  let stats: { maxX: bigint; sy: bigint } | undefined;
  const keptStats = (): { maxX: bigint; sy: bigint } => {
    if (stats === undefined) {
      let maxX = BigInt(kept[0]!.x), sy = 0n;
      for (const k of kept) { if (BigInt(k.x) > maxX) maxX = BigInt(k.x); sy += BigInt(k.y); }
      stats = { maxX, sy };
    }
    return stats;
  };
  nodes.forEach((r, i) => {
    const p = `$.nodes[${i}]`;
    if (r.status === "kept") {
      if (r.dx !== r.x - r.x_prev || r.dy !== r.y - r.y_prev || r.dist !== distOf(r.dx, r.dy)) throw bad("INCONSISTENT_RECORD", p);
    } else if (r.status === "added" && "anchor_kind" in r) {
      if (!plc.present) throw bad("INCONSISTENT_RECORD", `${p}`, "placement absent");
      const u = DIRECTIONS[r.direction]!;
      const rad = plc.radius * (r.ring + 1);
      if (r.x !== r.anchor_x + divRoundN(rad * u[0], 1000) || r.y !== r.anchor_y + divRoundN(rad * u[1], 1000)) throw bad("INCONSISTENT_RECORD", p, "position");
      const dx = BigInt(r.x - r.anchor_x), dy = BigInt(r.y - r.anchor_y);
      if (BigInt(r.offset) !== isqrt(dx * dx + dy * dy)) throw bad("INCONSISTENT_RECORD", p, "offset");
      if (r.anchor_kind === "seed") {
        if (kept.length === 0) throw bad("INCONSISTENT_RECORD", p, "seed without a kept node");
        const ks = keptStats(); // computed once for the whole report, not once per seed record
        if (BigInt(r.anchor_x) !== ks.maxX + BigInt(plc.radius) || BigInt(r.anchor_y) !== divRound(ks.sy, BigInt(kept.length))) throw bad("INCONSISTENT_RECORD", p, "seed anchor");
      }
    }
  });
  if (plc.present !== (report.mode === "incremental" && addedCount > 0)) throw bad("INCONSISTENT_RECORD", "$.placement");
  const same = (a: unknown, b: unknown): boolean => canonicalizeSigned(a as CJValue) === canonicalizeSigned(b as CJValue);
  if (!same(report.aggregate, aggregateOf(nodes, report.mode))) throw bad("INCONSISTENT_AGGREGATE", "$.aggregate");
  const ex = extentsOf(nodes);
  if (!same(report.extent.next, ex.next)) throw bad("INCONSISTENT_AGGREGATE", "$.extent.next");
  if (!same(report.extent.previous, ex.previous)) throw bad("INCONSISTENT_AGGREGATE", "$.extent.previous");
  if (!same(report.transform_hint, transformOf(nodes))) throw bad("INCONSISTENT_AGGREGATE", "$.transform_hint");
  if (report.mode === "incremental" && kept.some((k) => k.dist !== 0)) throw bad("KEPT_MOVED", "$.nodes");
  return { report, text, sha256: await sha256Hex(bytes), refs, edgeRefs };
}
