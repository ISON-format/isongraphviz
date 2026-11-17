import { IDENTIFIER, canonicalizeSigned, cjViolation, compareNodeRef, nodeKey, nodeRefFromWire, sha256Hex, snapshotBytes, type CJValue } from "isongraph-visualize-scene-core/primitives";
import type { WireNodeRef } from "isongraph-visualize-scene-core";
import { LayoutError } from "./errors.js";
import { validatePolicy } from "./policy.js";
import { wireCoordinate } from "./quantize.js";
import type { Layout } from "./types.js";

const RESERVED_TOP = ["edges", "groups", "stability", "extensions", "bounds", "viewport", "layout_sha256"];
const XKEY = /^x-[a-z0-9][a-z0-9._-]*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_DEPTH = 64;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const inv = (reason: string, path?: string, detail?: string): LayoutError => new LayoutError("INVALID_LAYOUT", reason, path, detail);
const reasonOf = (e: unknown): string | undefined => (e instanceof Error && "reason" in e ? String((e as { reason: unknown }).reason) : undefined);

function closed(v: unknown, path: string, required: string[], o: { reserved?: string[]; allowX: boolean }): Obj {
  if (!isObj(v)) throw inv("SCHEMA", path, "object expected");
  for (const k of Object.keys(v)) {
    if (o.reserved?.includes(k)) throw inv("RESERVED_FIELD", `${path}.${k}`);
    if (required.includes(k)) continue;
    if (o.allowX && XKEY.test(k)) {
      const x = cjViolation(v[k], `${path}.${k}`, { signed: true, maxDepth: MAX_DEPTH });
      if (x) throw inv(x.reason, x.path);
      continue;
    }
    throw inv("UNKNOWN_FIELD", `${path}.${k}`);
  }
  for (const k of required) if (!(k in v)) throw inv("MISSING_FIELD", `${path}.${k}`);
  return v;
}

function wireRef(v: unknown, path: string): WireNodeRef {
  const o = closed(v, path, ["id", "type"], { allowX: false });
  if (typeof o["id"] !== "string") throw inv("SCHEMA", `${path}.id`, "string expected");
  if (typeof o["type"] !== "string") throw inv("SCHEMA", `${path}.type`, "string expected");
  if (!IDENTIFIER.test(o["type"])) throw inv("INVALID_IDENTIFIER", `${path}.type`);
  const ref = { id: o["id"], type: o["type"] };
  try { nodeRefFromWire(ref); } catch { throw inv("INVALID_ID", `${path}.id`); }
  return ref;
}

export async function verifyLayout(bytes: Uint8Array): Promise<{ layout: Layout; layoutSha256: string }> {
  const input = snapshotBytes(bytes); // first action, synchronous

  // 0. decode + parse
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) throw inv("INVALID_ENCODING", undefined, "byte-order mark");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input); }
  catch { throw inv("INVALID_ENCODING", undefined, "not valid UTF-8"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw inv("SCHEMA", undefined, "not JSON"); }

  // 1. schema (shapes, closed objects, value domains of everything except policy VALUES)
  const top = closed(parsed, "$", ["address_scheme", "igl", "nodes", "policy", "scale", "scene_sha256"], { reserved: RESERVED_TOP, allowX: true });
  if (top["igl"] !== "IGL/1") throw inv("UNSUPPORTED_VERSION", "$.igl");
  if (top["address_scheme"] !== "igs-addr/1") throw inv("UNSUPPORTED_ADDRESS_SCHEME", "$.address_scheme");
  if (top["scale"] !== 1000) throw inv("INVALID_SCALE", "$.scale");
  if (typeof top["scene_sha256"] !== "string" || !HEX64.test(top["scene_sha256"])) throw inv("INVALID_HASH", "$.scene_sha256");
  closed(top["policy"], "$.policy", ["algorithm", "config", "family"], { allowX: false });
  // review finding I-1: the values of policy are inside the canonical domain and at most 64 levels deep BEFORE structuredClone or any
  // recursion runs, so a hostile nesting is a LayoutError on every host (it used to be a stack-size-dependent RangeError)
  const pv = cjViolation(top["policy"], "$.policy", { signed: true, maxDepth: MAX_DEPTH });
  if (pv) throw inv(pv.reason, pv.path);
  if (!Array.isArray(top["nodes"])) throw inv("SCHEMA", "$.nodes", "array expected");
  (top["nodes"] as unknown[]).forEach((n, i) => {
    const o = closed(n, `$.nodes[${i}]`, ["ref", "x", "y"], { allowX: true });
    wireRef(o["ref"], `$.nodes[${i}].ref`);
    wireCoordinate(o["x"], `$.nodes[${i}].x`);
    wireCoordinate(o["y"], `$.nodes[${i}].y`);
  });

  // 2. canonical form: re-canonicalize with NodeRef/2 order applied; the bytes must be identical
  const clone = structuredClone(parsed) as Layout;
  clone.nodes.sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref)));
  let canonical: string;
  try { canonical = canonicalizeSigned(clone as unknown as CJValue); }
  catch (e) { throw inv(reasonOf(e) ?? "SCHEMA", undefined, "not canonicalizable"); }
  if (canonical !== text) throw inv("NON_CANONICAL");

  // 3. integrity
  const keys = clone.nodes.map((n) => nodeKey(nodeRefFromWire(n.ref)));
  for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1]) throw inv("DUPLICATE_NODE_REF", `$.nodes[${i}]`);

  // 4. policy
  validatePolicy(top["policy"]);

  return { layout: parsed as Layout, layoutSha256: await sha256Hex(input) };
}
