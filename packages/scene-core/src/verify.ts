// packages/scene-core/src/verify.ts
import { canonicalize, hasLoneSurrogate, type CJValue } from "./canonical.js";
import { IgsError } from "./errors.js";
import { sha256Hex } from "./hash.js";
import { decodeNodeId, edgeFromWire, edgeKey, IDENTIFIER, labelOf, nodeKey, nodeRefFromWire } from "./identity.js";
import { compareEdgeAddress, compareNodeRef } from "./order.js";
import { snapshotBytes } from "./snapshot.js";
import type { Scene, WireEdgeAddress, WireNodeRef } from "./types.js";

const RESERVED_TOP = ["groups", "enrichments", "layout_intent"];
const RESERVED_ITEM = ["display_label", "role", "emphasis", "badge", "ring", "visibility", "lod_min", "interaction", "a11y_text", "a11y_role"];
const XKEY = /^x-[a-z0-9][a-z0-9._-]*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ORD = /^(0|[1-9][0-9]*)$/;

const bad = (reason: string, path?: string, detail?: string): IgsError => new IgsError("INVALID_SCENE", reason, path, detail);
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** An extension value may nest this deep. A fixed cap keeps hostile input from overflowing the stack, and makes the verdict independent of the host. */
const MAX_EXTENSION_DEPTH = 64;

/** Extension values must stay inside the IGS-CJ/1 value domain. */
function assertCJ(v: unknown, path: string, depth = 0): void {
  if (typeof v === "string") { if (hasLoneSurrogate(v)) throw bad("INVALID_STRING", path); return; }
  if (typeof v === "boolean") return;
  if (typeof v === "number") { if (!Number.isSafeInteger(v) || v < 0 || Object.is(v, -0)) throw bad("INVALID_NUMBER", path); return; }
  if (Array.isArray(v)) {
    if (depth >= MAX_EXTENSION_DEPTH) throw bad("TOO_DEEP", path);
    v.forEach((x, i) => assertCJ(x, `${path}[${i}]`, depth + 1));
    return;
  }
  if (isObj(v)) {
    if (depth >= MAX_EXTENSION_DEPTH) throw bad("TOO_DEEP", path);
    for (const [k, x] of Object.entries(v)) assertCJ(x, `${path}.${k}`, depth + 1);
    return;
  }
  throw bad("INVALID_VALUE", path);
}

/** A closed object: only the listed keys, reserved names refused, x- keys kept after a domain check. */
function closed(v: unknown, path: string, required: string[], reserved: string[] = []): Obj {
  if (!isObj(v)) throw bad("SCHEMA", path, "object expected");
  for (const k of Object.keys(v)) {
    if (reserved.includes(k)) throw bad("RESERVED_FIELD", `${path}.${k}`);
    if (required.includes(k)) continue;
    if (XKEY.test(k)) { assertCJ(v[k], `${path}.${k}`); continue; }
    throw bad("UNKNOWN_FIELD", `${path}.${k}`);
  }
  for (const k of required) if (!(k in v)) throw bad("MISSING_FIELD", `${path}.${k}`);
  return v;
}

const str = (v: unknown, path: string): string => { if (typeof v !== "string") throw bad("SCHEMA", path, "string expected"); return v; };
function ident(v: unknown, path: string): string {
  const s = str(v, path);
  if (!IDENTIFIER.test(s)) throw bad("INVALID_IDENTIFIER", path);
  return s;
}
function wireNode(v: unknown, path: string): WireNodeRef {
  const o = closed(v, path, ["id", "type"]);
  const w = { id: str(o["id"], `${path}.id`), type: ident(o["type"], `${path}.type`) };
  nodeRefFromWire(w); // validates the tagged id (INVALID_ID)
  return w;
}
function wireEdge(v: unknown, path: string): WireEdgeAddress {
  const o = closed(v, path, ["ord", "rel", "src", "tgt"]);
  const ord = str(o["ord"], `${path}.ord`);
  if (!ORD.test(ord)) throw bad("INVALID_ORDINAL", `${path}.ord`);
  return { ord, rel: ident(o["rel"], `${path}.rel`), src: wireNode(o["src"], `${path}.src`), tgt: wireNode(o["tgt"], `${path}.tgt`) };
}

interface Shape {
  nodes: { category: string; label: string; ref: WireNodeRef }[];
  edges: { label: string; ref: WireEdgeAddress }[];
}

export async function verifyScene(bytes: Uint8Array): Promise<{ scene: Scene; sceneSha256: string }> {
  // The caller's array is copied first, synchronously: everything below, including the digest, sees one fixed byte sequence.
  const input = snapshotBytes(bytes);

  // 0. decode + parse
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) throw bad("INVALID_ENCODING", undefined, "byte-order mark");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input); }
  catch { throw bad("INVALID_ENCODING", undefined, "not valid UTF-8"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw bad("SCHEMA", undefined, "not JSON"); }

  // 1. schema: extensions first, then reserved names, then closed objects; every address must be well formed
  if (isObj(parsed) && "extensions" in parsed) {
    const e = parsed["extensions"];
    if (!Array.isArray(e)) throw bad("SCHEMA", "$.extensions", "array expected");
    if (e.length === 0) throw bad("NON_CANONICAL", "$.extensions", "default serialized");
    throw new IgsError("UNSUPPORTED_EXTENSION", undefined, "$.extensions");
  }
  const top = closed(parsed, "$", ["address_scheme", "edges", "graph", "igs", "nodes", "source"], RESERVED_TOP);
  if (top["igs"] !== "IGS/1") throw bad("UNSUPPORTED_VERSION", "$.igs");
  if (top["address_scheme"] !== "igs-addr/1") throw bad("UNSUPPORTED_ADDRESS_SCHEME", "$.address_scheme");
  const source = closed(top["source"], "$.source", ["artifact_sha256", "serialization_profile"]);
  if (typeof source["artifact_sha256"] !== "string" || !HEX64.test(source["artifact_sha256"])) throw bad("INVALID_HASH", "$.source.artifact_sha256");
  if (source["serialization_profile"] !== "ison-v1") throw bad("UNSUPPORTED_PROFILE", "$.source.serialization_profile");
  const graph = closed(top["graph"], "$.graph", ["directed", "profile"]);
  if (typeof graph["directed"] !== "boolean") throw bad("SCHEMA", "$.graph.directed");
  if (graph["profile"] !== "simple") throw bad("UNSUPPORTED_PROFILE", "$.graph.profile");
  if (!Array.isArray(top["nodes"])) throw bad("SCHEMA", "$.nodes");
  if (!Array.isArray(top["edges"])) throw bad("SCHEMA", "$.edges");
  top["nodes"].forEach((n, i) => {
    const o = closed(n, `$.nodes[${i}]`, ["category", "label", "ref"], RESERVED_ITEM);
    str(o["category"], `$.nodes[${i}].category`); str(o["label"], `$.nodes[${i}].label`); wireNode(o["ref"], `$.nodes[${i}].ref`);
  });
  top["edges"].forEach((e, i) => {
    const o = closed(e, `$.edges[${i}]`, ["label", "ref"], RESERVED_ITEM);
    str(o["label"], `$.edges[${i}].label`); wireEdge(o["ref"], `$.edges[${i}].ref`);
  });

  // 2. canonical form: re-canonicalize WITH the 5.5 ordering applied, then compare bytes
  const clone = structuredClone(parsed) as Shape;
  clone.nodes.sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref)));
  clone.edges.sort((a, b) => compareEdgeAddress(edgeFromWire(a.ref), edgeFromWire(b.ref)));
  if (canonicalize(clone as unknown as CJValue) !== text) throw bad("NON_CANONICAL");

  // 3. F1 graph integrity (arrays are now in canonical order)
  const nodeKeys = clone.nodes.map((n) => nodeKey(nodeRefFromWire(n.ref)));
  for (let i = 1; i < nodeKeys.length; i++) if (nodeKeys[i] === nodeKeys[i - 1]) throw bad("DUPLICATE_NODE_REF", `$.nodes[${i}]`);
  const edgeKeys = clone.edges.map((e) => edgeKey(edgeFromWire(e.ref)));
  for (let i = 1; i < edgeKeys.length; i++) if (edgeKeys[i] === edgeKeys[i - 1]) throw bad("DUPLICATE_EDGE_REF", `$.edges[${i}]`);
  const known = new Set(nodeKeys);
  clone.edges.forEach((e, i) => {
    const a = edgeFromWire(e.ref);
    if (!known.has(nodeKey(a.src)) || !known.has(nodeKey(a.tgt))) throw bad("DANGLING_EDGE_ENDPOINT", `$.edges[${i}]`);
    if (graph["directed"] === false && compareNodeRef(a.src, a.tgt) > 0) throw bad("NON_CANONICAL_ENDPOINTS", `$.edges[${i}]`);
  });

  // 4. F3 agreement: the scene must not contradict its own references (graph.profile is "simple", so every ordinal is "0")
  clone.nodes.forEach((n, i) => {
    if (n.category !== n.ref.type) throw bad("CATEGORY_MISMATCH", `$.nodes[${i}].category`);
    if (n.label !== labelOf(decodeNodeId(n.ref.id))) throw bad("LABEL_MISMATCH", `$.nodes[${i}].label`);
  });
  clone.edges.forEach((e, i) => {
    if (e.label !== e.ref.rel) throw bad("LABEL_MISMATCH", `$.edges[${i}].label`);
    if (e.ref.ord !== "0") throw bad("UNEXPECTED_ORDINAL", `$.edges[${i}].ref.ord`);
  });

  return { scene: parsed as Scene, sceneSha256: await sha256Hex(input) };
}
