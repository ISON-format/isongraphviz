// src/state.ts — LODState schema, verification, canonical writer and hash (design 29 section 3).
import { IDENTIFIER, canonicalize, compareNodeRef, hasLoneSurrogate, nodeRefFromWire, sha256Hex, snapshotBytes, type CJValue } from "isongraph-visualize-scene-core/primitives";
import type { NodeRef } from "isongraph-visualize-scene-core";
import { LODError } from "./errors.js";
import { JNum, JsonSyntaxError, parseJson } from "./json.js";
import { paintGroups } from "./laminar.js";
import { INT31_MAX, MAX_AGG_DEPTH, MAX_CALLER_VISITS, MAX_GROUPS, MAX_LABEL_UNITS, MAX_MEMBER_ENTRIES, MAX_STATE_BYTES } from "./limits.js";
import type { EdgePolicy, Group, LODState, LabelPolicy, WireNodeRef } from "./types.js";

const XKEY = /^x-[a-z0-9][a-z0-9._-]*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const INT_TOKEN = /^(?:0|[1-9][0-9]*)$/;
const RESERVED_TOP = ["groups", "lod_min", "visibility", "hulls", "levels", "group_source", "extensions", "selection", "viewport"];
const X_MAX_DEPTH = 64;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof JNum);
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const inv = (reason: string, path?: string, detail?: string): LODError => new LODError("INVALID_LOD", reason, path, detail);

// ---------------------------------------------------------------- reference and scalar checks (shared with the other entry points)

/** A string value: wrong JSON type is SCHEMA; a lone surrogate is INVALID_STRING (checked before any shape check). */
export function checkString(v: unknown, path: string): string {
  if (typeof v !== "string") throw inv("SCHEMA", path, "string expected");
  if (hasLoneSurrogate(v)) throw inv("INVALID_STRING", path);
  return v;
}

/** A closed object: (a) must be an object, (b) keys in ascending UTF-16 order (reserved, unknown, x-), (c) first missing required key. */
function closedObject(v: unknown, path: string, defined: readonly string[], required: readonly string[], top: boolean): Obj {
  if (!isObj(v)) throw inv("SCHEMA", path, "object expected");
  for (const k of Object.keys(v).sort()) {
    if (top && RESERVED_TOP.includes(k)) throw inv("RESERVED_FIELD", `${path}.${k}`);
    if (defined.includes(k)) continue;
    if (top && XKEY.test(k)) {
      const r = xViolation(v[k], 0);
      if (r !== null) throw inv(r, `${path}.${k}`);
      continue;
    }
    throw inv("UNKNOWN_FIELD", `${path}.${k}`);
  }
  for (const k of required) if (!hasOwn(v, k)) throw inv("MISSING_FIELD", `${path}.${k}`);
  return v;
}

/** The first violation of the IGS-CJ/1 value domain inside an x- value (unsigned, depth counted from the value as level 1), keys visited ascending. */
function xViolation(v: unknown, depth: number): string | null {
  if (typeof v === "string") return hasLoneSurrogate(v) ? "INVALID_STRING" : null;
  if (typeof v === "boolean") return null;
  if (v instanceof JNum) { const x = Number(v.token); return Number.isSafeInteger(x) && x >= 0 && !Object.is(x, -0) ? null : "INVALID_NUMBER"; }
  if (Array.isArray(v)) {
    if (depth >= X_MAX_DEPTH) return "TOO_DEEP";
    for (const e of v) { const r = xViolation(e, depth + 1); if (r !== null) return r; }
    return null;
  }
  if (isObj(v)) {
    if (depth >= X_MAX_DEPTH) return "TOO_DEEP";
    for (const k of Object.keys(v).sort()) { const r = xViolation(v[k], depth + 1); if (r !== null) return r; }
    return null;
  }
  return "INVALID_VALUE"; // null
}

function xToPlain(v: unknown): unknown {
  if (v instanceof JNum) return Number(v.token);
  if (Array.isArray(v)) return v.map(xToPlain);
  if (isObj(v)) {
    const o: Obj = {};
    for (const k of Object.keys(v)) Object.defineProperty(o, k, { value: xToPlain(v[k]), enumerable: true, writable: true, configurable: true });
    return o;
  }
  return v;
}

/** A node reference `{id, type}`. A member or pin that has an own key `agg` is AGGREGATE_AS_MEMBER before every closed-object error. */
export function checkRef(v: unknown, path: string): WireNodeRef {
  if (isObj(v) && hasOwn(v, "agg")) throw new LODError("INVALID_GROUP", "AGGREGATE_AS_MEMBER", path);
  const o = closedObject(v, path, ["id", "type"], ["id", "type"], false);
  const id = checkString(o["id"], `${path}.id`);
  try { nodeRefFromWire({ id, type: "t" }); } catch { throw inv("INVALID_ID", `${path}.id`); }
  const type = checkString(o["type"], `${path}.type`);
  if (!IDENTIFIER.test(type)) throw inv("INVALID_IDENTIFIER", `${path}.type`);
  return { id, type };
}

/** An integer field judged by TOKEN text (design 29 section 3 stage 2): `0|[1-9][0-9]*` within `0 .. 2^31-1`. */
function checkInt(v: unknown, path: string): number {
  if (!(v instanceof JNum)) throw inv("SCHEMA", path, "integer expected");
  if (!INT_TOKEN.test(v.token) || v.token.length > 10) throw inv("INVALID_NUMBER", path);
  const x = Number(v.token);
  if (x > INT31_MAX) throw inv("INVALID_NUMBER", path);
  return x;
}

export function checkHash(v: unknown, path: string): string {
  const s = checkString(v, path);
  if (!HEX64.test(s)) throw inv("INVALID_HASH", path);
  return s;
}

// ---------------------------------------------------------------- schema (stage 2)

export function parseSchema(root: unknown): LODState {
  const top = closedObject(root, "$", ["collapsed", "edge_policy", "label_policy", "layout_sha256", "lod", "pinned", "scene_sha256", "zoom_milli"],
    ["collapsed", "label_policy", "layout_sha256", "lod", "pinned", "scene_sha256", "zoom_milli"], true);
  const out: Partial<LODState> & Obj = {};
  for (const k of Object.keys(top).sort()) {
    const v = top[k];
    switch (k) {
      case "collapsed": {
        if (!Array.isArray(v)) throw inv("SCHEMA", "$.collapsed", "array expected");
        out["collapsed"] = v.map((g, i): Group => {
          const gp = `$.collapsed[${i}]`;
          const o = closedObject(g, gp, ["label", "members"], ["members"], false);
          let label: string | undefined;
          if (hasOwn(o, "label")) label = checkString(o["label"], `${gp}.label`);
          const m = o["members"];
          if (!Array.isArray(m)) throw inv("SCHEMA", `${gp}.members`, "array expected");
          const members = m.map((r, j) => checkRef(r, `${gp}.members[${j}]`));
          return label === undefined ? { members } : { label, members };
        });
        break;
      }
      case "edge_policy": {
        const o = closedObject(v, "$.edge_policy", ["keep_forest", "max_view_edges"], ["keep_forest", "max_view_edges"], false);
        if (typeof o["keep_forest"] !== "boolean") throw inv("SCHEMA", "$.edge_policy.keep_forest", "boolean expected");
        const keep_forest = o["keep_forest"];
        const max_view_edges = checkInt(o["max_view_edges"], "$.edge_policy.max_view_edges");
        out["edge_policy"] = { keep_forest, max_view_edges } satisfies EdgePolicy;
        break;
      }
      case "label_policy": {
        const keys = ["full_degree", "full_zoom_milli", "short_degree", "short_zoom_milli"] as const;
        const o = closedObject(v, "$.label_policy", keys, keys, false);
        const lp = {} as Record<string, number>;
        for (const kk of keys) lp[kk] = checkInt(o[kk], `$.label_policy.${kk}`);
        out["label_policy"] = lp as unknown as LabelPolicy;
        break;
      }
      case "layout_sha256": out["layout_sha256"] = checkHash(v, "$.layout_sha256"); break;
      case "scene_sha256": out["scene_sha256"] = checkHash(v, "$.scene_sha256"); break;
      case "lod": {
        const s = checkString(v, "$.lod");
        if (s !== "IGLOD/1") throw inv("UNSUPPORTED_VERSION", "$.lod");
        out["lod"] = "IGLOD/1";
        break;
      }
      case "pinned": {
        if (!Array.isArray(v)) throw inv("SCHEMA", "$.pinned", "array expected");
        out["pinned"] = v.map((r, j) => checkRef(r, `$.pinned[${j}]`));
        break;
      }
      case "zoom_milli": out["zoom_milli"] = checkInt(v, "$.zoom_milli"); break;
      default: out[k] = xToPlain(v); // an x- key (already checked in the closed-object pass)
    }
  }
  return out as unknown as LODState;
}

// ---------------------------------------------------------------- ordering (the only place that sorts; section 3 and 5.5)

const decode = (r: WireNodeRef): NodeRef => nodeRefFromWire(r);

function compareLists(a: readonly NodeRef[], b: readonly NodeRef[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const c = compareNodeRef(a[i]!, b[i]!); if (c !== 0) return c; }
  return a.length - b.length; // a proper prefix first
}

/** A copy of the state with members, `collapsed` and `pinned` in the section 3 order. Refs must be well formed. */
export function canonicalOrder(state: LODState): LODState {
  const sortRefs = (rs: readonly WireNodeRef[]): { ref: WireNodeRef; dec: NodeRef }[] =>
    rs.map((ref) => ({ ref, dec: decode(ref) })).sort((a, b) => compareNodeRef(a.dec, b.dec));
  const groups = state.collapsed.map((g) => ({ g, sorted: sortRefs(g.members) }));
  groups.sort((a, b) => compareLists(a.sorted.map((x) => x.dec), b.sorted.map((x) => x.dec)));
  const pinned = sortRefs(state.pinned).map((x) => x.ref);
  return {
    ...state,
    collapsed: groups.map(({ g, sorted }) => ({ ...g, members: sorted.map((x) => x.ref) })),
    pinned,
  };
}

// ---------------------------------------------------------------- the synchronous verifier

const refKey = (r: WireNodeRef): string => JSON.stringify([r.type, r.id]); // scene-core nodeKey of a canonical wire reference

/** Stage 3: counts of what was parsed, in the order label, group, member. */
export function checkLimits(state: LODState): void {
  for (let i = 0; i < state.collapsed.length; i++) {
    const l = state.collapsed[i]!.label;
    if (l !== undefined && l.length > MAX_LABEL_UNITS) throw new LODError("RESOURCE_LIMIT", "LABEL_LIMIT", `$.collapsed[${i}].label`);
  }
  if (state.collapsed.length > MAX_GROUPS) throw new LODError("RESOURCE_LIMIT", "GROUP_LIMIT");
  let entries = 0;
  for (const g of state.collapsed) entries += g.members.length;
  if (entries > MAX_MEMBER_ENTRIES) throw new LODError("RESOURCE_LIMIT", "MEMBER_LIMIT");

}

/** Stages 5 and 6: group integrity (group by group, duplicate groups, laminarity, depth, duplicate pins), then policy. */
export function checkIntegrity(state: LODState): void {
  // stage 5: group integrity
  const memberKeys: string[][] = [];
  for (let gi = 0; gi < state.collapsed.length; gi++) {
    const g = state.collapsed[gi]!;
    const path = `$.collapsed[${gi}]`;
    if (g.members.length === 0) throw new LODError("INVALID_GROUP", "EMPTY_GROUP", path);
    if (g.members.length < 2) throw new LODError("INVALID_GROUP", "GROUP_TOO_SMALL", path);
    const keys = g.members.map(refKey);
    for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1]) throw new LODError("INVALID_GROUP", "DUPLICATE_MEMBER", `${path}.members[${i}]`);
    memberKeys.push(keys);
  }
  for (let gi = 1; gi < memberKeys.length; gi++) {
    const a = memberKeys[gi - 1]!, b = memberKeys[gi]!;
    if (a.length === b.length && a.every((k, i) => k === b[i])) throw new LODError("INVALID_GROUP", "DUPLICATE_GROUP", `$.collapsed[${gi}]`);
  }
  const index = new Map<string, number>();
  const idx = memberKeys.map((ks) => ks.map((k) => { let i = index.get(k); if (i === undefined) { i = index.size; index.set(k, i); } return i; }));
  const painting = paintGroups(idx, index.size);
  if (painting.maxDepth > MAX_AGG_DEPTH) throw new LODError("RESOURCE_LIMIT", "DEPTH_LIMIT");
  for (let i = 1; i < state.pinned.length; i++) if (refKey(state.pinned[i]!) === refKey(state.pinned[i - 1]!)) throw inv("DUPLICATE_PIN", `$.pinned[${i}]`);

  // stage 6: policy
  const lp = state.label_policy;
  if (lp.short_zoom_milli > lp.full_zoom_milli || lp.short_degree > lp.full_degree) throw new LODError("INVALID_POLICY", "THRESHOLD_ORDER", "$.label_policy");
}

/** Stages 1-6 over caller bytes that are ALREADY snapshotted. Throws LODError. Returns the verified, canonical state. */
export function verifyStateBytes(input: Uint8Array): LODState {
  // stage 1: size, encoding, parse
  if (input.length > MAX_STATE_BYTES) throw new LODError("RESOURCE_LIMIT", "STATE_BYTES");
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) throw inv("INVALID_ENCODING", undefined, "byte-order mark");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input); }
  catch { throw inv("INVALID_ENCODING", undefined, "not valid UTF-8"); }
  let parsed: unknown;
  try { parsed = parseJson(text); }
  catch (e) { if (e instanceof JsonSyntaxError) throw inv("SCHEMA", undefined, "not JSON"); throw e; }

  // stage 2: schema
  const state = parseSchema(parsed);

  // stage 3: limits (label, group, member)
  checkLimits(state);

  // stage 4: canonical form (sorted-ness is part of it)
  let canonical: string;
  try { canonical = canonicalize(canonicalOrder(state) as unknown as CJValue); }
  catch (e) {
    const reason = e instanceof Error && "reason" in e ? String((e as { reason: unknown }).reason) : "SCHEMA";
    throw inv(reason, undefined, "not canonicalizable");
  }
  if (canonical !== text) throw inv("NON_CANONICAL");

  // stages 5 and 6: group integrity, policy
  checkIntegrity(state);
  return state;
}

/** Standalone verification: canonical, laminar, valid policies. Proves well-formedness, not that members exist in any scene (that is binding, in deriveView). */
export async function verifyLODState(bytes: Uint8Array): Promise<{ state: LODState; stateSha256: string }> {
  const input = snapshotBytes(bytes); // first action, synchronous
  const state = verifyStateBytes(input);
  return { state, stateSha256: await sha256Hex(input) };
}

// ---------------------------------------------------------------- canonical writer and hash

const reasonOf = (e: unknown): string => (e instanceof Error && "reason" in e ? String((e as { reason: unknown }).reason) : "SCHEMA");

/** The only writer: canonical IGS-CJ/1 bytes of a state (sorts members, groups and pins on a copy; does not verify). */
export function serializeLODState(state: LODState): Uint8Array {
  let text: string;
  try { text = canonicalize(canonicalOrder(state) as unknown as CJValue); }
  catch (e) {
    if (e instanceof LODError) throw e;
    throw inv(reasonOf(e), undefined, "state outside the IGS-CJ/1 domain");
  }
  return new TextEncoder().encode(text);
}

export const hashLODState = (state: LODState): Promise<string> => sha256Hex(serializeLODState(state));

// ---------------------------------------------------------------- caller objects -> the parser's tree (builders)

interface TreeCtx { left: number; path: Set<object> }

const spend = (ctx: TreeCtx): void => {
  if (--ctx.left < 0) throw new LODError("RESOURCE_LIMIT", "VISIT_LIMIT", undefined, "caller object graph over MAX_CALLER_VISITS visits");
};

/**
 * An owned copy of a caller value in the shape the schema checker reads: numbers become number tokens (so -1, 1.5, NaN, 2^31 are INVALID_NUMBER by the
 * same rule as a state file), objects become own-property copies, every property is read exactly once. Nesting beyond 70 levels is cut off (an x- value
 * is TOO_DEEP at level 65, so nothing deeper is ever examined) which keeps hostile input from overflowing the stack. Design 29 section 11: the copy is
 * made under a visit budget (a shared subobject counts at every visit): excess is RESOURCE_LIMIT/VISIT_LIMIT; a cyclic reference is INVALID_LOD/SCHEMA.
 */
export function toTree(v: unknown, ctx: TreeCtx = { left: MAX_CALLER_VISITS, path: new Set() }, depth = 0): unknown {
  if (typeof v === "number") { spend(ctx); return new JNum(Object.is(v, -0) ? "-0" : String(v)); }
  if (depth > 70) return undefined;
  if (typeof v === "object" && v !== null) {
    if (ctx.path.has(v)) throw inv("SCHEMA", undefined, "cyclic reference");
    spend(ctx);
    ctx.path.add(v);
    try {
      if (Array.isArray(v)) return v.map((e) => toTree(e, ctx, depth + 1));
      const o: Obj = Object.create(null) as Obj;
      for (const k of Object.keys(v)) o[k] = toTree((v as Obj)[k], ctx, depth + 1);
      return o;
    } finally { ctx.path.delete(v); }
  }
  spend(ctx);
  return v;
}

/** The same cycle check and visit budget without building a copy (suggestGroups specs). */
export function guardCaller(v: unknown, ctx: TreeCtx = { left: MAX_CALLER_VISITS, path: new Set() }, depth = 0): void {
  spend(ctx);
  if (typeof v !== "object" || v === null || depth > 70) return;
  if (ctx.path.has(v)) throw inv("SCHEMA", undefined, "cyclic reference");
  ctx.path.add(v);
  try { for (const k of Object.keys(v)) guardCaller((v as Obj)[k], ctx, depth + 1); } finally { ctx.path.delete(v); }
}

/** A caller state checked as stages 2-6 of section 3 without sorting: it must already be canonical (NON_CANONICAL otherwise). Returns the owned state. */
export function verifyCallerState(tree: unknown): LODState {
  const st = parseSchema(tree);
  checkLimits(st);
  let canonical: string, given: string;
  try { canonical = canonicalize(canonicalOrder(st) as unknown as CJValue); given = canonicalize(st as unknown as CJValue); }
  catch (e) { throw inv(reasonOf(e), undefined, "not canonicalizable"); }
  if (canonical !== given) throw inv("NON_CANONICAL");
  checkIntegrity(st);
  return st;
}

export const nodeRefKey = refKey;
