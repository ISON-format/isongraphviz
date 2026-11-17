// packages/scene-core/src/qualify.ts
import { isFloatField, parse, Reference, type Document, type Row } from "ison-ts";
import { IgsError } from "./errors.js";
import { IDENTIFIER } from "./identity.js";

const INT_TEXT = /^-?[0-9]+$/;
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SAFE_MIN = -SAFE_MAX;

/** A2: strict UTF-8, no byte-order mark. */
export function decodeSource(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new IgsError("MALFORMED_SOURCE", "INVALID_ENCODING", undefined, "byte-order mark");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new IgsError("MALFORMED_SOURCE", "INVALID_ENCODING", undefined, "not valid UTF-8");
  }
}

const profileError = (reason: string, detail?: string): IgsError => new IgsError("UNSUPPORTED_GRAPH_PROFILE", reason, "meta.graph", detail);

/** A required column is read from the row's own properties only; an inherited value is never a column (rule A10, defence in depth). */
export function ownValue(row: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
}

/**
 * A9 (no silent drop, docs/specs/IGS-1.md Law 3). Everything the parser read must be something the compiler reads. The parser keeps a line such as
 * `main.py` as a new block header and everything after `---` as summary rows, and Core ignores unknown block kinds, so without this
 * check a document could lose nodes or edges and still receive a hash. Only `nodes`, `edges` and `meta` blocks are accepted, none of
 * them may have summary rows, and a `meta.graph` look-alike (`meta.Graph`) is refused because Core would ignore its profile marker.
 */
function qualifyBlocks(doc: Document): void {
  for (const block of doc.blocks) {
    const path = `${block.kind}.${block.name}`;
    if (block.kind !== "nodes" && block.kind !== "edges" && block.kind !== "meta") throw new IgsError("MALFORMED_SOURCE", "UNSUPPORTED_BLOCK", path);
    // A10: ison-ts assigns row[column] = value, so a column named __proto__ re-parents the row to that value (a Reference, which has
    // `id` and `type`) and the row then appears to hold columns it does not have. No other column name changes a row's prototype.
    if (block.fields.includes("__proto__")) throw new IgsError("MALFORMED_SOURCE", "PROTOTYPE_FIELD", path);
    // A11: a repeated column name makes the parser keep only the last cell (row[column] = value), so the earlier cell is lost silently.
    if (new Set(block.fields).size !== block.fields.length) throw new IgsError("MALFORMED_SOURCE", "DUPLICATE_FIELD", path);
    if (block.summaryRows.length > 0) throw new IgsError("MALFORMED_SOURCE", "SUMMARY_ROWS", path);
    if (block.kind === "meta") {
      if (block.name !== "graph" && block.name.toLowerCase() === "graph") throw profileError("MALFORMED_META", `block name ${block.name}`);
    } else if (!IDENTIFIER.test(block.name)) {
      throw new IgsError("MALFORMED_SOURCE", "INVALID_BLOCK_NAME", path);
    }
  }
}

/** A4: the profile is read from the structured block, never from the raw text. */
function qualifyProfile(doc: Document): boolean {
  const metas = doc.blocks.filter((b) => b.kind === "meta" && b.name === "graph");
  if (metas.length === 0) return true; // Core default: directed simple graph
  if (metas.length > 1) throw profileError("CONTRADICTORY_META", "more than one meta.graph block");
  const meta = metas[0];
  if (meta.rows.length !== 1) throw profileError("MALFORMED_META", "meta.graph must have exactly one row");
  const row = meta.rows[0];
  if (meta.fields.includes("format")) {
    const f: unknown = ownValue(row, "format");
    if (f === "ison-graph-multigraph-v1") throw profileError("MULTIGRAPH");
    throw profileError(typeof f === "string" ? "UNKNOWN_FORMAT" : "MALFORMED_META");
  }
  const directed: unknown = ownValue(row, "directed");
  if (meta.fields.length !== 1 || meta.fields[0] !== "directed" || typeof directed !== "boolean") throw profileError("MALFORMED_META");
  return directed;
}

/** A5: ids are strings or provably exact integers. Returns the string ids per node type (needed by A6). */
function qualifyNodes(doc: Document): Map<string, Set<string>> {
  const strings = new Map<string, Set<string>>();
  const keys = new Map<string, Set<string>>();
  // Integer values (as canonical text) and digit-string values (by the integer they denote) seen per type. Core 1.4.1 compares a
  // digit string by parseInt, so "007" is the twin of 7 and "-0" of 0, but only when the integer was added first. The adapter
  // rejects both orders (ID_TWIN) so that the verdict never depends on row order.
  const intValues = new Map<string, Set<string>>();
  const digitStringValues = new Map<string, Set<string>>();
  for (const block of doc.blocks) {
    if (block.kind !== "nodes") continue;
    const type = block.name;
    block.rows.forEach((row, i) => {
      const path = `nodes.${type}[${i}].id`;
      const id: unknown = ownValue(row, "id");
      // ison-ts rounds an unquoted float token such as 1.0 to the number 1 but records the token kind. Never accept it as an integer.
      if (isFloatField(row, "id")) throw new IgsError("INVALID_NODE_ID", "NOT_INT64_OR_STRING", path);
      let key: string;
      let intValue: string | undefined;
      let digitStringValue: string | undefined;
      if (typeof id === "string") {
        key = `s:${id}`;
        if (INT_TEXT.test(id)) digitStringValue = BigInt(id).toString();
        if (!strings.has(type)) strings.set(type, new Set());
        strings.get(type)!.add(id);
      } else if (typeof id === "number") {
        if (!Number.isInteger(id)) throw new IgsError("INVALID_NODE_ID", "NOT_INT64_OR_STRING", path);
        if (!Number.isSafeInteger(id)) throw new IgsError("INEXACT_NODE_ID", "OUT_OF_SAFE_RANGE", path);
        key = `i:${id}`;
        intValue = String(id);
      } else {
        throw new IgsError("INVALID_NODE_ID", "NOT_INT64_OR_STRING", path);
      }
      if (!keys.has(type)) keys.set(type, new Set());
      if (keys.get(type)!.has(key)) throw new IgsError("DUPLICATE_NODE", undefined, path);
      if (!intValues.has(type)) intValues.set(type, new Set());
      if (!digitStringValues.has(type)) digitStringValues.set(type, new Set());
      if (intValue !== undefined) {
        if (digitStringValues.get(type)!.has(intValue)) throw new IgsError("ID_TWIN", undefined, path);
        intValues.get(type)!.add(intValue);
      }
      if (digitStringValue !== undefined) {
        if (intValues.get(type)!.has(digitStringValue)) throw new IgsError("ID_TWIN", undefined, path);
        digitStringValues.get(type)!.add(digitStringValue);
      }
      keys.get(type)!.add(key);
    });
  }
  return strings;
}

/** A6: a reference that is an unsafe integer is rejected unless it names an existing string id of that type. */
function requireExactRef(r: Reference, strings: Map<string, Set<string>>, path: string): void {
  if (!INT_TEXT.test(r.id)) return;
  if (strings.get(r.type as string)?.has(r.id)) return;
  const v = BigInt(r.id);
  if (v > SAFE_MAX || v < SAFE_MIN) throw new IgsError("INEXACT_NODE_ID", "OUT_OF_SAFE_RANGE", path);
}

/**
 * The endpoint identity Core's resolver gives a reference: an existing string id of that type wins, otherwise
 * integer text is that integer. A6 has already shown integer text to be within +/-(2^53-1) unless it names a string.
 * Keys are structured (JSON tuples), never delimiter-joined text.
 */
export function endpointKey(r: Reference, strings: Map<string, Set<string>>): string {
  const type = r.type as string;
  if (strings.get(type)?.has(r.id)) return JSON.stringify([type, "s", r.id]);
  if (INT_TEXT.test(r.id)) return JSON.stringify([type, "i", BigInt(r.id).toString()]); // BigInt("-0") is 0n, BigInt("007") is 7n
  return JSON.stringify([type, "s", r.id]);
}

export const pairKey = (a: string, b: string): string => JSON.stringify([a, b]);

function bagOf(row: Row): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    if (k === "source" || k === "target" || v === null) continue; // null members are elided (Semantic/2 1.3)
    m.set(k, v);
  }
  return m;
}

const unverifiable = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v);

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Reference || b instanceof Reference) {
    return a instanceof Reference && b instanceof Reference && a.type === b.type && a.id === b.id;
  }
  return typeof a === typeof b && a === b; // 0 === -0; 1 and 1.0 are both the number 1
}

function compareMirror(r1: Row, r2: Row, path: string): void {
  const a = bagOf(r1);
  const b = bagOf(r2);
  for (const v of [...a.values(), ...b.values()]) {
    if (unverifiable(v)) throw new IgsError("UNDIRECTED_EDGE_CONFLICT", "UNVERIFIABLE_PROPERTY_VALUE", path);
  }
  if (a.size !== b.size) throw new IgsError("UNDIRECTED_EDGE_CONFLICT", "PROPERTY_MISMATCH", path);
  for (const [k, v] of a) {
    if (!b.has(k) || !sameValue(v, b.get(k))) throw new IgsError("UNDIRECTED_EDGE_CONFLICT", "PROPERTY_MISMATCH", path);
  }
}

interface EdgeRow { row: Row; path: string; src: string; tgt: string }

/**
 * A6 + A7 on the Document rows. Rows are collected per RELATION across the whole document (a relation may be
 * split over several `edges.<rel>` blocks), then duplicates are rejected first, then mirror pairs are compared.
 */
function qualifyEdges(doc: Document, directed: boolean, strings: Map<string, Set<string>>): void {
  const byRel = new Map<string, EdgeRow[]>();
  for (const block of doc.blocks) {
    if (block.kind !== "edges") continue;
    block.rows.forEach((row, i) => {
      const path = `edges.${block.name}[${i}]`;
      const s = ownValue(row, "source");
      const t = ownValue(row, "target");
      if (!(s instanceof Reference) || !(t instanceof Reference) || s.type === undefined || t.type === undefined) {
        throw new IgsError("INVALID_EDGE_ENDPOINT", undefined, path);
      }
      requireExactRef(s, strings, `${path}.source`);
      requireExactRef(t, strings, `${path}.target`);
      const list = byRel.get(block.name) ?? [];
      list.push({ row, path, src: endpointKey(s, strings), tgt: endpointKey(t, strings) });
      byRel.set(block.name, list);
    });
  }

  const firsts = new Map<string, Map<string, number>>();
  for (const [rel, list] of byRel) {
    const first = new Map<string, number>();
    list.forEach((e, i) => {
      const key = pairKey(e.src, e.tgt);
      if (first.has(key)) throw new IgsError("DUPLICATE_EDGE", undefined, e.path); // same orientation, even with equal properties
      first.set(key, i);
    });
    firsts.set(rel, first);
  }
  if (directed) return;

  for (const [rel, list] of byRel) {
    const first = firsts.get(rel) as Map<string, number>;
    list.forEach((e, i) => {
      if (e.src === e.tgt) return; // a single self-loop row: nothing to compare
      const j = first.get(pairKey(e.tgt, e.src));
      if (j === undefined || j < i) return; // no mirror row, or already compared from the other side
      compareMirror(e.row, (list[j] as EdgeRow).row, `${e.path}/${(list[j] as EdgeRow).path}`);
    });
  }
}

export interface Qualified { directed: boolean }

export function qualify(text: string): Qualified {
  let doc: Document;
  try {
    doc = parse(text);
  } catch (e) {
    throw new IgsError("MALFORMED_SOURCE", "PARSE_ERROR", undefined, (e as Error).message);
  }
  qualifyBlocks(doc);
  const directed = qualifyProfile(doc);
  const strings = qualifyNodes(doc);
  qualifyEdges(doc, directed, strings);
  return { directed };
}

export const qualifyBytes = (bytes: Uint8Array): Qualified => qualify(decodeSource(bytes));
