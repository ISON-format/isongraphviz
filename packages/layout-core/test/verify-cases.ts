// packages/layout-core/test/verify-cases.ts - the L-VERIFY mutation table, shared by verify.test.ts and the frozen-oracle test.
import { baseText, enc } from "./helpers.js";
export { enc };

export const T = baseText();
const must = (s: string, from: string, to: string): string => { if (!s.includes(from)) throw new Error(`test setup: ${from} not found`); return s.replace(from, to); };
const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys) : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
// mutate the parsed base, then re-emit with canonical KEY order (arrays keep the order the mutation gave them) so each case isolates ONE defect
export const obj = (mut: (o: Record<string, unknown>) => void): string => { const o = JSON.parse(T) as Record<string, unknown>; mut(o); return JSON.stringify(sortKeys(o)); };
export const nodes = (o: Record<string, unknown>) => o["nodes"] as Array<Record<string, unknown>>;
export const nest = (k: number): unknown => (k <= 0 ? [] : [nest(k - 1)]); // k+1 levels
export const pretty = (s: string) => JSON.stringify(JSON.parse(s), null, 1);

export const REJECT: Array<[string, string | Uint8Array, string]> = [
  ["V01 float coordinate", must(T, '"x":173961,', '"x":173961.5,'), "INVALID_COORDINATE/NOT_INTEGER"],
  ["V02 negative zero", must(T, '"x":173961,', '"x":-0,'), "INVALID_COORDINATE/NEGATIVE_ZERO"],
  ["V03 beyond 2^53-1", must(T, '"x":173961,', '"x":9007199254740992,'), "INVALID_COORDINATE/OUT_OF_RANGE"],
  ["V04 non-finite (1e999)", must(T, '"x":173961,', '"x":1e999,'), "INVALID_COORDINATE/NOT_FINITE"],
  ["V05 string coordinate", must(T, '"x":173961,', '"x":"173961",'), "INVALID_LAYOUT/SCHEMA"],
  ["V06 nodes not sorted", obj((o) => nodes(o).reverse()), "INVALID_LAYOUT/NON_CANONICAL"],
  ["V07 duplicate node refs", obj((o) => { nodes(o).push(structuredClone(nodes(o)[1]!)); }), "INVALID_LAYOUT/DUPLICATE_NODE_REF"],
  ["V08 unknown top-level key", obj((o) => { o["foo"] = 1; }), "INVALID_LAYOUT/UNKNOWN_FIELD"],
  ["V09 reserved key edges", obj((o) => { o["edges"] = []; }), "INVALID_LAYOUT/RESERVED_FIELD"],
  ["V10 reserved key layout_sha256", obj((o) => { o["layout_sha256"] = "0".repeat(64); }), "INVALID_LAYOUT/RESERVED_FIELD"],
  ["V11 missing scale", obj((o) => { delete o["scale"]; }), "INVALID_LAYOUT/MISSING_FIELD"],
  ["V12 igl IGL/2", obj((o) => { o["igl"] = "IGL/2"; }), "INVALID_LAYOUT/UNSUPPORTED_VERSION"],
  ["V13 address_scheme", obj((o) => { o["address_scheme"] = "igs-addr/2"; }), "INVALID_LAYOUT/UNSUPPORTED_ADDRESS_SCHEME"],
  ["V14 scale 1", obj((o) => { o["scale"] = 1; }), "INVALID_LAYOUT/INVALID_SCALE"],
  ["V15 scene_sha256 uppercase", obj((o) => { o["scene_sha256"] = "E8".padEnd(64, "A"); }), "INVALID_LAYOUT/INVALID_HASH"],
  ["V16 whitespace", pretty(T), "INVALID_LAYOUT/NON_CANONICAL"],
  ["V17 byte-order mark", new Uint8Array([0xef, 0xbb, 0xbf, ...enc(T)]), "INVALID_LAYOUT/INVALID_ENCODING"],
  ["V18 invalid UTF-8", new Uint8Array([...enc(T.slice(0, 20)), 0xff, ...enc(T.slice(20))]), "INVALID_LAYOUT/INVALID_ENCODING"],
  ["V19 lone surrogate in an id", must(T, '"id":"i:1"', '"id":"s:\\ud800"'), "INVALID_LAYOUT/INVALID_STRING"],
  ["V20 x- nesting 65 levels", obj((o) => { nodes(o)[0]!["x-d"] = nest(64); }), "INVALID_LAYOUT/TOO_DEEP"],
  ["V22 x- key with uppercase", obj((o) => { o["x-Bad"] = 1; }), "INVALID_LAYOUT/UNKNOWN_FIELD"],
  ["V23 x- float", must(obj((o) => { nodes(o)[0]!["x-f"] = 1; }), '"x-f":1', '"x-f":1.5'), "INVALID_LAYOUT/INVALID_NUMBER"],
  ["V25 node missing y", obj((o) => { delete nodes(o)[0]!["y"]; }), "INVALID_LAYOUT/MISSING_FIELD"],
  ["V26 bad id", must(T, '"id":"i:1"', '"id":"bogus"'), "INVALID_LAYOUT/INVALID_ID"],
  ["V27 type with a space", must(T, '"type":"person"', '"type":"per son"'), "INVALID_LAYOUT/INVALID_IDENTIFIER"],
  ["V28 not JSON", "{", "INVALID_LAYOUT/SCHEMA"],
  ["V29 policy without family", obj((o) => { delete (o["policy"] as Record<string, unknown>)["family"]; }), "INVALID_LAYOUT/MISSING_FIELD"],
  ["V30 unknown family", obj((o) => { (o["policy"] as Record<string, unknown>)["family"] = "force"; }), "INVALID_LAYOUT/UNKNOWN_FAMILY"],
  ["V31 unqualified family", obj((o) => { Object.assign(o["policy"] as object, { family: "HIERARCHICAL", algorithm: "igl-hier/1", config: {} }); }), "UNSUPPORTED_FAMILY/"],
  ["V32 algorithm/family mismatch", obj((o) => { (o["policy"] as Record<string, unknown>)["algorithm"] = "igl-fixed/1"; }), "INVALID_POLICY/ALGORITHM_FAMILY_MISMATCH"],
  ["V33 extra config key", obj((o) => { ((o["policy"] as Record<string, unknown>)["config"] as Record<string, unknown>)["radii"] = 1; }), "INVALID_POLICY/UNKNOWN_KEY"],
  ["V34 missing config key", obj((o) => { delete ((o["policy"] as Record<string, unknown>)["config"] as Record<string, unknown>)["seed"]; }), "INVALID_POLICY/MISSING_KEY"],
  ["V35 seed 2^32", obj((o) => { ((o["policy"] as Record<string, unknown>)["config"] as Record<string, unknown>)["seed"] = 2 ** 32; }), "INVALID_POLICY/INVALID_VALUE"],
  ["V36 width <= 2*margin", obj((o) => { ((o["policy"] as Record<string, unknown>)["config"] as Record<string, unknown>)["width"] = 100; }), "INVALID_POLICY/MARGIN_TOO_LARGE"],
  ["V37 null seed (null is outside the canonical value domain, reported before policy)", obj((o) => { ((o["policy"] as Record<string, unknown>)["config"] as Record<string, unknown>)["seed"] = null; }), "INVALID_LAYOUT/INVALID_VALUE"],
  ["V38 x- key inside config", obj((o) => { ((o["policy"] as Record<string, unknown>)["config"] as Record<string, unknown>)["x-n"] = 1; }), "INVALID_POLICY/UNKNOWN_KEY"],
  ["V39 non-canonical AND bad policy: canonical form is reported first", pretty(obj((o) => { ((o["policy"] as Record<string, unknown>)["config"] as Record<string, unknown>)["seed"] = 2 ** 32; })), "INVALID_LAYOUT/NON_CANONICAL"],
  ["V41 policy value nested 2000 levels (host-independent TOO_DEEP)", T.replace('"family":"FORCE"', '"family":' + "[".repeat(2000) + "]".repeat(2000)), "INVALID_LAYOUT/TOO_DEEP"],
  ["V40 x- key inside policy", obj((o) => { (o["policy"] as Record<string, unknown>)["x-n"] = 1; }), "INVALID_LAYOUT/UNKNOWN_FIELD"],
];

/** The two files of group L-VERIFY that must VERIFY (the boundary of the x- domain): nesting of exactly 64 levels, and a negative x- integer. */
export const ACCEPT: Array<[string, string]> = [
  ["V21 x- nesting of exactly 64 levels", obj((o) => { nodes(o)[0]!["x-d"] = nest(63); })],
  ["V24 a negative x- integer", obj((o) => { nodes(o)[0]!["x-n"] = -5; })],
];
