// packages/scene-core/src/qualify.ts
import { isFloatField, parse, Reference, type Document } from "ison-ts";
import { IgsError } from "./errors.js";

const INT_TEXT = /^-?[0-9]+$/;
const CANONICAL_INT = /^(0|-?[1-9][0-9]*)$/;
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

/** A4: the profile is read from the structured block, never from the raw text. */
function qualifyProfile(doc: Document): boolean {
  const metas = doc.blocks.filter((b) => b.kind === "meta" && b.name === "graph");
  if (metas.length === 0) return true; // Core default: directed simple graph
  if (metas.length > 1) throw profileError("CONTRADICTORY_META", "more than one meta.graph block");
  const meta = metas[0];
  if (meta.rows.length !== 1) throw profileError("MALFORMED_META", "meta.graph must have exactly one row");
  const row = meta.rows[0];
  if (meta.fields.includes("format")) {
    const f: unknown = row["format"];
    if (f === "ison-graph-multigraph-v1") throw profileError("MULTIGRAPH");
    throw profileError(typeof f === "string" ? "UNKNOWN_FORMAT" : "MALFORMED_META");
  }
  const directed: unknown = row["directed"];
  if (meta.fields.length !== 1 || meta.fields[0] !== "directed" || typeof directed !== "boolean") throw profileError("MALFORMED_META");
  return directed;
}

/** A5: ids are strings or provably exact integers. Returns the string ids per node type (needed by A6). */
function qualifyNodes(doc: Document): Map<string, Set<string>> {
  const strings = new Map<string, Set<string>>();
  const keys = new Map<string, Set<string>>();
  const spellings = new Map<string, Map<string, string>>();
  for (const block of doc.blocks) {
    if (block.kind !== "nodes") continue;
    const type = block.name;
    block.rows.forEach((row, i) => {
      const path = `nodes.${type}[${i}].id`;
      const id: unknown = row["id"];
      // ison-ts rounds an unquoted float token such as 1.0 to the number 1 but records the token kind. Never accept it as an integer.
      if (isFloatField(row, "id")) throw new IgsError("INVALID_NODE_ID", "NOT_INT64_OR_STRING", path);
      let key: string;
      let spelling: string | undefined;
      if (typeof id === "string") {
        key = `s:${id}`;
        spelling = CANONICAL_INT.test(id) ? id : undefined;
        if (!strings.has(type)) strings.set(type, new Set());
        strings.get(type)!.add(id);
      } else if (typeof id === "number") {
        if (!Number.isInteger(id)) throw new IgsError("INVALID_NODE_ID", "NOT_INT64_OR_STRING", path);
        if (!Number.isSafeInteger(id)) throw new IgsError("INEXACT_NODE_ID", "OUT_OF_SAFE_RANGE", path);
        key = `i:${id}`;
        spelling = String(id);
      } else {
        throw new IgsError("INVALID_NODE_ID", "NOT_INT64_OR_STRING", path);
      }
      if (!keys.has(type)) keys.set(type, new Set());
      if (!spellings.has(type)) spellings.set(type, new Map());
      if (keys.get(type)!.has(key)) throw new IgsError("DUPLICATE_NODE", undefined, path);
      if (spelling !== undefined) {
        const other = spellings.get(type)!.get(spelling);
        if (other !== undefined && other !== key) throw new IgsError("ID_TWIN", undefined, path);
        spellings.get(type)!.set(spelling, key);
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

export interface Qualified { directed: boolean }

export function qualify(text: string): Qualified {
  let doc: Document;
  try {
    doc = parse(text);
  } catch (e) {
    throw new IgsError("MALFORMED_SOURCE", "PARSE_ERROR", undefined, (e as Error).message);
  }
  const directed = qualifyProfile(doc);
  const strings = qualifyNodes(doc);
  // Edge pass: Task 7 replaces this loop with qualifyEdges (duplicates and mirror pairs).
  for (const block of doc.blocks) {
    if (block.kind !== "edges") continue;
    block.rows.forEach((row, i) => {
      const path = `edges.${block.name}[${i}]`;
      const s = row["source"];
      const t = row["target"];
      if (!(s instanceof Reference) || !(t instanceof Reference) || s.type === undefined || t.type === undefined) {
        throw new IgsError("INVALID_EDGE_ENDPOINT", undefined, path);
      }
      requireExactRef(s, strings, `${path}.source`);
      requireExactRef(t, strings, `${path}.target`);
    });
  }
  return { directed };
}

export const qualifyBytes = (bytes: Uint8Array): Qualified => qualify(decodeSource(bytes));
