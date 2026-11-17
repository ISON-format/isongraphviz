import { describe, expect, it } from "vitest";
import { verifyLODState, serializeLODState, hashLODState } from "../src/state.js";
import { baseState, bytes, enc, errOf, LAYOUT_HASH, ref, refs, SCENE_HASH, stateA, stateB, stateC, text, dec } from "./helpers.js";

const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys) : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
const toBytes = (x: unknown): Uint8Array => { try { return bytes(x); } catch { return enc(JSON.stringify(sortKeys(x))); } };
const verify = (x: unknown): Promise<unknown> => verifyLODState(typeof x === "string" ? enc(x) : x instanceof Uint8Array ? x : toBytes(x));
const E = (x: unknown): Promise<string> => errOf(() => verify(x));
const withText = (o: Record<string, unknown>, from: string, to: string): string => {
  const t = text(o);
  expect(t).toContain(from);
  return t.replace(from, to);
};

describe("verifyLODState: acceptance", () => {
  it("M01 accepts the worked states and returns the state hash", async () => {
    for (const [s, h] of [[stateA(), "b52bd0bd6c57a21a5faf296ad5efa2011fd76ab97f8cffe684b0e95fe3436bcc"], [stateB(), "1d137de1ddfb9326303e5d5a3051a4ba0af2dae2ef5a22516fed717bf269a3ab"], [stateC(), "927c32b97f2f89ba73117f408b6b9000f5eec6ce3f05d0280218444968acae25"]] as const) {
      const r = await verifyLODState(bytes(s));
      expect(r.stateSha256).toBe(h);
      expect(dec(serializeLODState(r.state))).toBe(text(s));
      expect(await hashLODState(r.state)).toBe(h);
    }
  });
  it("accepts an empty collapse set and an absent edge_policy", async () => {
    const r = await verifyLODState(bytes(baseState()));
    expect(r.state.collapsed).toEqual([]);
    expect("edge_policy" in r.state).toBe(false);
  });
  it("M06 keeps x- keys and ignores them", async () => {
    const r = await verifyLODState(bytes(baseState({ "x-note": { a: [1, 2, "s", true] } })));
    expect(r.state["x-note"]).toEqual({ a: [1, 2, "s", true] });
  });
  it("M07 x- nesting: 64 levels pass, 65 are TOO_DEEP", async () => {
    const nest = (d: number): unknown => { let v: unknown = 1; for (let i = 0; i < d; i++) v = [v]; return v; };
    expect(await E(baseState({ "x-d": nest(64) }))).toBe("no error");
    expect(await E(baseState({ "x-d": nest(65) }))).toBe("INVALID_LOD/TOO_DEEP");
  });
  it("M13 edge_policy present and valid", async () => {
    expect(await E(baseState({ edge_policy: { keep_forest: false, max_view_edges: 0 } }))).toBe("no error");
    expect(await E(baseState({ edge_policy: { keep_forest: false } }))).toBe("INVALID_LOD/MISSING_FIELD");
    expect(await E(baseState({ edge_policy: { keep_forest: false, max_view_edges: 1, z: 1 } }))).toBe("INVALID_LOD/UNKNOWN_FIELD");
  });
  it("C21 an empty-string label is valid and canonical", async () => {
    const r = await verifyLODState(bytes(baseState({ collapsed: [{ label: "", members: refs("s:d", "s:e") }] })));
    expect(r.state.collapsed[0]).toEqual({ label: "", members: refs("s:d", "s:e") });
  });
});

describe("verifyLODState: stage 1 encoding and parse", () => {
  it("M11 BOM, invalid UTF-8", async () => {
    expect(await E(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes(baseState())]))).toBe("INVALID_LOD/INVALID_ENCODING");
    expect(await E(new Uint8Array([0x7b, 0xff, 0x7d]))).toBe("INVALID_LOD/INVALID_ENCODING");
  });
  it("JSON syntax errors including 00, +1 and trailing commas are SCHEMA", async () => {
    for (const t of ["", "{", "{}x", withText(baseState(), '"zoom_milli":500', '"zoom_milli":00'), withText(baseState(), '"zoom_milli":500', '"zoom_milli":+1'), withText(baseState(), '"pinned":[]', '"pinned":[],')]) expect(await E(t), t).toBe("INVALID_LOD/SCHEMA");
  });
  it("a state over MAX_STATE_BYTES is STATE_BYTES before any parse (even garbage)", async () => {
    expect(await E(new Uint8Array(33_554_433).fill(0x7b))).toBe("RESOURCE_LIMIT/STATE_BYTES");
    expect(await E(new Uint8Array(33_554_432).fill(0x7b))).toBe("INVALID_LOD/SCHEMA");
  });
  it("a non-Uint8Array is a TypeError (snapshot)", async () => {
    await expect(verifyLODState("x" as never)).rejects.toThrow(TypeError);
  });
  it("snapshots the bytes before the first await", async () => {
    const b = bytes(baseState());
    const p = verifyLODState(b);
    b.fill(0);
    await expect(p).resolves.toBeDefined();
  });
});

describe("verifyLODState: stage 2 schema (a total procedure)", () => {
  it("M02 wrong lod", async () => { expect(await E(baseState({ lod: "IGLOD/2" }))).toBe("INVALID_LOD/UNSUPPORTED_VERSION"); });
  it("M05 each reserved name is RESERVED_FIELD", async () => {
    for (const k of ["groups", "lod_min", "visibility", "hulls", "levels", "group_source", "extensions", "selection", "viewport"]) expect(await E(baseState({ [k]: 1 })), k).toBe("INVALID_LOD/RESERVED_FIELD");
  });
  it("unknown fields and missing fields", async () => {
    expect(await E(baseState({ zz: 1 }))).toBe("INVALID_LOD/UNKNOWN_FIELD");
    for (const k of ["collapsed", "label_policy", "layout_sha256", "lod", "pinned", "scene_sha256", "zoom_milli"]) {
      const s = baseState(); delete s[k];
      expect(await E(s), k).toBe("INVALID_LOD/MISSING_FIELD");
    }
  });
  it("M17 unknown field and missing field in one object: UNKNOWN_FIELD first", async () => {
    const s = baseState({ zz: 1 }); delete s["zoom_milli"];
    expect(await E(s)).toBe("INVALID_LOD/UNKNOWN_FIELD");
  });
  it("M09 and M10 label_policy missing and unknown keys", async () => {
    expect(await E(baseState({ label_policy: { full_degree: 5, full_zoom_milli: 2000, short_degree: 3 } }))).toBe("INVALID_LOD/MISSING_FIELD");
    expect(await E(baseState({ label_policy: { full_degree: 5, full_zoom_milli: 2000, short_degree: 3, short_zoom_milli: 1000, q: 1 } }))).toBe("INVALID_LOD/UNKNOWN_FIELD");
  });
  it("x- key with a bad name, or inside a nested object, is UNKNOWN_FIELD", async () => {
    expect(await E(baseState({ "x-": 1 }))).toBe("INVALID_LOD/UNKNOWN_FIELD");
    expect(await E(baseState({ "x-A": 1 }))).toBe("INVALID_LOD/UNKNOWN_FIELD");
    expect(await E(baseState({ label_policy: { ...baseState()["label_policy"] as object, "x-a": 1 } }))).toBe("INVALID_LOD/UNKNOWN_FIELD");
  });
  it("M18 wrong JSON types are SCHEMA, including null", async () => {
    expect(await E(baseState({ edge_policy: { keep_forest: "true", max_view_edges: 1 } }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ pinned: [{ id: 5, type: "t" }] }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ collapsed: [{ label: 5, members: refs("s:d", "s:e") }] }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ collapsed: {} }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ edge_policy: null }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ zoom_milli: null }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ lod: null }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ collapsed: [null] }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ collapsed: [{ members: {} }] }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E("[]")).toBe("INVALID_LOD/SCHEMA");
    expect(await E("null")).toBe("INVALID_LOD/SCHEMA");
  });
  it("M08 integer fields are judged by token text", async () => {
    const z = (tok: string) => withText(baseState(), '"zoom_milli":500', `"zoom_milli":${tok}`);
    for (const tok of ["1.5", "-1", "-0", "1e3", "2.0", "1e999", "2147483648", "0.0"]) expect(await E(z(tok)), tok).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await E(z("2147483647"))).toBe("no error");
    expect(await E(z("0"))).toBe("no error");
    expect(await E(baseState({ zoom_milli: "5" }))).toBe("INVALID_LOD/SCHEMA");
    const p = (tok: string) => withText(baseState({ edge_policy: { keep_forest: true, max_view_edges: 7 } }), '"max_view_edges":7', `"max_view_edges":${tok}`);
    expect(await E(p("-1"))).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await E(p("7.0"))).toBe("INVALID_LOD/INVALID_NUMBER");
  });
  it("hash shape and lone surrogates", async () => {
    expect(await E(baseState({ scene_sha256: SCENE_HASH.toUpperCase() }))).toBe("INVALID_LOD/INVALID_HASH");
    expect(await E(baseState({ layout_sha256: "abc" }))).toBe("INVALID_LOD/INVALID_HASH");
    expect(await E(withText(baseState(), `"scene_sha256":"${SCENE_HASH}"`, '"scene_sha256":"\\ud800"'))).toBe("INVALID_LOD/INVALID_STRING");
    expect(await E(withText(baseState({ collapsed: [{ label: "L", members: refs("s:d", "s:e") }] }), '"label":"L"', '"label":"\\udc00"'))).toBe("INVALID_LOD/INVALID_STRING");
  });
  it("ref id and type validity", async () => {
    expect(await E(baseState({ pinned: [{ id: "x:1", type: "t" }] }))).toBe("INVALID_LOD/INVALID_ID");
    expect(await E(baseState({ pinned: [{ id: "i:01", type: "t" }] }))).toBe("INVALID_LOD/INVALID_ID");
    expect(await E(baseState({ pinned: [{ id: "igagg1:" + "a".repeat(64), type: "t" }] }))).toBe("INVALID_LOD/INVALID_ID");
    expect(await E(baseState({ pinned: [{ id: "s:a", type: "a b" }] }))).toBe("INVALID_LOD/INVALID_IDENTIFIER");
    expect(await E(baseState({ pinned: [{ id: "s:a", type: "a:b" }] }))).toBe("INVALID_LOD/INVALID_IDENTIFIER");
    expect(await E(baseState({ pinned: [{ id: "s:a", type: "a\u00a0b" }] }))).toBe("INVALID_LOD/INVALID_IDENTIFIER");
    expect(await E(baseState({ pinned: [{ id: "s:a", type: "" }] }))).toBe("INVALID_LOD/INVALID_IDENTIFIER");
    expect(await E(baseState({ pinned: [{ id: "s:", type: "t" }] }))).toBe("no error");
    expect(await E(withText(baseState({ pinned: [{ id: "s:a", type: "t" }] }), '"id":"s:a"', '"id":"\\ud800"'))).toBe("INVALID_LOD/INVALID_STRING");
  });
  it("A07 an own key agg on a member or pin is AGGREGATE_AS_MEMBER, before closed-object errors", async () => {
    expect(await E(baseState({ pinned: [{ agg: "igagg1:" + "a".repeat(64) }] }))).toBe("INVALID_GROUP/AGGREGATE_AS_MEMBER");
    expect(await E(baseState({ collapsed: [{ members: [{ agg: "igagg1:x" }, ref("s:d")] }] }))).toBe("INVALID_GROUP/AGGREGATE_AS_MEMBER");
    expect(await E(baseState({ pinned: [{ agg: "x", id: "s:a", type: "t", zz: 1 }] }))).toBe("INVALID_GROUP/AGGREGATE_AS_MEMBER");
    expect(await E(baseState({ pinned: [{ id: "s:a", type: "t", zz: 1 }] }))).toBe("INVALID_LOD/UNKNOWN_FIELD");
  });
  it("M19 x- value with null, float, negative, lone surrogate", async () => {
    expect(await E(withText(baseState({ "x-a": 1 }), '"x-a":1', '"x-a":null'))).toBe("INVALID_LOD/INVALID_VALUE");
    expect(await E(withText(baseState({ "x-a": 1 }), '"x-a":1', '"x-a":{"k":[null]}'))).toBe("INVALID_LOD/INVALID_VALUE");
    expect(await E(withText(baseState({ "x-a": 1 }), '"x-a":1', '"x-a":1.5'))).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await E(withText(baseState({ "x-a": 1 }), '"x-a":1', '"x-a":-1'))).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await E(withText(baseState({ "x-a": 1 }), '"x-a":1', '"x-a":"\\ud800"'))).toBe("INVALID_LOD/INVALID_STRING");
    expect(await E(withText(baseState({ "x-a": 1 }), '"x-a":1', '"x-a":1e999'))).toBe("INVALID_LOD/INVALID_NUMBER");
  });
  it("audit M-5: keys of ONE object are visited in ascending order whatever their order in the document (reserved before unknown, first unknown reported)", async () => {
    const base = JSON.parse(text(baseState())) as Record<string, unknown>;
    const perm = (extra: Array<[string, unknown]>) => JSON.stringify({ ...Object.fromEntries(extra), ...base });
    const first = async (t: string) => { try { await verify(t); return "none"; } catch (e) { const x = e as { reason?: string; path?: string }; return x.reason + "@" + x.path; } };
    expect(await first(perm([["zzz", 1], ["groups", []]]))).toBe("RESERVED_FIELD@$.groups");
    expect(await first(perm([["groups", []], ["zzz", 1]]))).toBe("RESERVED_FIELD@$.groups");
    expect(await first(perm([["zzz", 1], ["aaa", 1]]))).toBe("UNKNOWN_FIELD@$.aaa");
    expect(await first(perm([["aaa", 1], ["zzz", 1]]))).toBe("UNKNOWN_FIELD@$.aaa");
    const grp = (order: string[]) => JSON.stringify({ ...base, collapsed: [Object.fromEntries(order.map((k) => [k, k === "members" ? [] : 1]))] });
    expect(await first(grp(["zz", "aa", "members"]))).toBe("UNKNOWN_FIELD@$.collapsed[0].aa");
    expect(await first(grp(["members", "aa", "zz"]))).toBe("UNKNOWN_FIELD@$.collapsed[0].aa");
  });
  it("Z04-Z07, Z10 (rev 4): x- value order and tokens", async () => {
    const x = (frag: string) => withText(baseState({ "x-a": 1 }), '"x-a":1', '"x-a":' + frag);
    expect(await E(x('{"10":1.5,"2":null}'))).toBe("INVALID_LOD/INVALID_NUMBER"); // "10" before "2" in UTF-16 order
    expect(await E(x('{"10":null,"2":1.5}'))).toBe("INVALID_LOD/INVALID_VALUE");
    expect(await E(x("1.0"))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(x("-0"))).toBe("INVALID_LOD/INVALID_NUMBER");
    const t = text(baseState());
    expect(await E(t.replace("{", '{"viewport":1,"aaa":1,'))).toBe("INVALID_LOD/UNKNOWN_FIELD"); // aaa < viewport
  });
  it("rev 4: an own __proto__ key in a state is an ordinary unknown field", async () => {
    expect(await E(text(baseState()).replace("{", '{"__proto__":{"x":1},'))).toBe("INVALID_LOD/UNKNOWN_FIELD");
  });
  it("M16 the verdict does not depend on key order in the input", async () => {
    const a = JSON.stringify({ zoom_milli: "x", lod: "IGLOD/9", collapsed: [], label_policy: baseState()["label_policy"], layout_sha256: LAYOUT_HASH, pinned: [], scene_sha256: SCENE_HASH });
    const b = JSON.stringify({ scene_sha256: SCENE_HASH, pinned: [], layout_sha256: LAYOUT_HASH, label_policy: baseState()["label_policy"], collapsed: [], lod: "IGLOD/9", zoom_milli: "x" });
    expect(await E(a)).toBe(await E(b));
    expect(await E(a)).toBe("INVALID_LOD/UNSUPPORTED_VERSION"); // keys ascend: lod before zoom_milli
  });
  it("M20 depth first: collapsed (members first) is examined before pinned", async () => {
    expect(await E(baseState({ collapsed: [{ members: [{ id: "bad", type: "t" }, ref("s:d")] }], pinned: [{ id: "bad2", type: "a b" }] }))).toBe("INVALID_LOD/INVALID_ID");
    expect(await E(baseState({ collapsed: [{ members: [ref("s:d"), { id: "s:e", type: "a b" }] }], pinned: [{ id: "bad2", type: "t" }] }))).toBe("INVALID_LOD/INVALID_IDENTIFIER");
  });
  it("a value is examined completely before the next key (group label before members; first group before second)", async () => {
    expect(await E(baseState({ collapsed: [{ label: 5, members: [{ id: "bad", type: "t" }] }] }))).toBe("INVALID_LOD/SCHEMA");
    expect(await E(baseState({ collapsed: [{ members: [{ id: "bad", type: "t" }] }, { members: 5 }] }))).toBe("INVALID_LOD/INVALID_ID");
  });
  it("within an object a missing key is reported before any value error", async () => {
    expect(await E(baseState({ pinned: [{ id: "bad" }] }))).toBe("INVALID_LOD/MISSING_FIELD");
  });
});

describe("verifyLODState: stages 3-6", () => {
  const lbl = (n: number) => "a".repeat(n);
  it("B06 LABEL_LIMIT at 257 units (UTF-16), accepted at 256", async () => {
    const g = (l: string) => baseState({ collapsed: [{ label: l, members: refs("s:d", "s:e") }] });
    expect(await E(g(lbl(256)))).toBe("no error");
    expect(await E(g(lbl(257)))).toBe("RESOURCE_LIMIT/LABEL_LIMIT");
    expect(await E(g("\u{1F600}".repeat(129)))).toBe("RESOURCE_LIMIT/LABEL_LIMIT"); // 258 units
    expect(await E(g("\u{1F600}".repeat(128)))).toBe("no error");
  });
  it("stage order: limits before canonical form, canonical before integrity, integrity before policy", async () => {
    // too many groups and non-canonical: GROUP_LIMIT (M14)
    const many = Array.from({ length: 20_001 }, (_, i) => ({ members: [ref(`i:${2 * i}`), ref(`i:${2 * i + 1}`)] }));
    const t = text(baseState({ collapsed: many })).replace("{", "{ ");
    expect(await E(t)).toBe("RESOURCE_LIMIT/GROUP_LIMIT");
    // non-canonical and bad policy: NON_CANONICAL
    const lp = { ...(baseState()["label_policy"] as object), short_degree: 9 };
    expect(await E(text(baseState({ label_policy: lp })).replace("{", "{ "))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(baseState({ label_policy: lp }))).toBe("INVALID_POLICY/THRESHOLD_ORDER");
    expect(await E(baseState({ label_policy: { ...lp, short_degree: 3, short_zoom_milli: 2001 } }))).toBe("INVALID_POLICY/THRESHOLD_ORDER");
    expect(await E(baseState({ label_policy: { full_degree: 3, full_zoom_milli: 1000, short_degree: 3, short_zoom_milli: 1000 } }))).toBe("no error");
  });
  it("MEMBER_LIMIT: 500,001 entries", async () => {
    const mk = (entries: number) => {
      const members: unknown[] = []; for (let i = 0; i < entries; i++) members.push({ id: `i:${i}`, type: "t" });
      return `{"collapsed":[{"members":${JSON.stringify(members)}}],"label_policy":{"full_degree":5,"full_zoom_milli":2000,"short_degree":3,"short_zoom_milli":1000},"layout_sha256":"${LAYOUT_HASH}","lod":"IGLOD/1","pinned":[],"scene_sha256":"${SCENE_HASH}","zoom_milli":500}`;
    };
    expect(await E(mk(500_001))).toBe("RESOURCE_LIMIT/MEMBER_LIMIT");
  }, 60_000);
  it("the limits are accepted exactly at their value: 500,000 entries, 20,000 groups", async () => {
    const mk = (collapsed: unknown) => `{"collapsed":${JSON.stringify(collapsed)},"label_policy":{"full_degree":5,"full_zoom_milli":2000,"short_degree":3,"short_zoom_milli":1000},"layout_sha256":"${LAYOUT_HASH}","lod":"IGLOD/1","pinned":[],"scene_sha256":"${SCENE_HASH}","zoom_milli":500}`;
    const one: unknown[] = []; for (let i = 0; i < 500_000; i++) one.push({ id: `i:${i}`, type: "t" });
    expect(await E(mk([{ members: one }]))).toBe("no error");
    const many = Array.from({ length: 20_000 }, (_, i) => ({ members: [{ id: `i:${2 * i}`, type: "t" }, { id: `i:${2 * i + 1}`, type: "t" }] }));
    expect(await E(mk(many.sort((a, b) => (a.members[0]!.id < b.members[0]!.id ? -1 : 1) && Number(a.members[0]!.id.slice(2)) - Number(b.members[0]!.id.slice(2)))))).toBe("no error");
  }, 60_000);
  it("C14 unsorted members: NON_CANONICAL even with a duplicate; C13 unsorted collapsed; unsorted pinned", async () => {
    expect(await E(baseState({ collapsed: [{ members: refs("s:e", "s:d") }] }))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(baseState({ collapsed: [{ members: refs("s:e", "s:d", "s:d") }] }))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(baseState({ collapsed: [{ members: refs("s:d", "s:e") }, { members: refs("s:a", "s:b") }] }))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(baseState({ pinned: refs("s:b", "s:a") }))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(baseState({ pinned: refs("i:10", "i:9") }))).toBe("INVALID_LOD/NON_CANONICAL"); // ints compare numerically: 9 < 10
    expect(await E(baseState({ pinned: refs("i:9", "i:10") }))).toBe("no error");
    expect(await E(baseState({ pinned: refs("i:5", "s:a") }))).toBe("no error"); // int ids before str ids within one type
  });
  it("M12 whitespace, key order, duplicate key, string escape: NON_CANONICAL", async () => {
    const t = text(baseState());
    expect(await E(t + "\n")).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(t.replace('"lod":"IGLOD/1"', '"lod": "IGLOD/1"'))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E('{"zoom_milli":500,' + t.slice(1))).toBe("INVALID_LOD/NON_CANONICAL"); // duplicate key, last wins
    expect(await E('{"zoom_milli":1,' + t.slice(1))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(t.replace('"lod":"IGLOD/1"', '"lod":"IGLOD\\/1"'))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(withText(baseState({ collapsed: [{ label: "A", members: refs("s:d", "s:e") }] }), '"label":"A"', '"label":"\\u0041"'))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await E(withText(baseState({ "x-a": 1000 }), '"x-a":1000', '"x-a":1e3'))).toBe("INVALID_LOD/NON_CANONICAL");
    const sw = JSON.stringify({ ...JSON.parse(t) }); // JSON.stringify keeps insertion order: collapsed, label_policy.. already sorted; reverse order instead
    expect(await E(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(sw) as object).reverse())))).toBe("INVALID_LOD/NON_CANONICAL");
  });
  it("C07 C08 C09 group integrity, group by group", async () => {
    expect(await E(baseState({ collapsed: [{ members: [] }] }))).toBe("INVALID_GROUP/EMPTY_GROUP");
    expect(await E(baseState({ collapsed: [{ members: refs("s:d") }] }))).toBe("INVALID_GROUP/GROUP_TOO_SMALL");
    expect(await E(baseState({ collapsed: [{ members: refs("s:d", "s:d") }] }))).toBe("INVALID_GROUP/DUPLICATE_MEMBER");
    // all three checks for group 1 come before group 2
    expect(await E(baseState({ collapsed: [{ members: refs("s:a") }, { members: refs("s:d", "s:d") }] }))).toBe("INVALID_GROUP/GROUP_TOO_SMALL");
    expect(await E(baseState({ collapsed: [{ members: [] }, { members: refs("s:d", "s:d") }] }))).toBe("INVALID_GROUP/EMPTY_GROUP");
    expect(await E(baseState({ collapsed: [{ members: refs("s:a", "s:b") }, { members: refs("s:d") }] }))).toBe("INVALID_GROUP/GROUP_TOO_SMALL");
  });
  it("C10 duplicate group before laminarity; C11 overlap; nested ok", async () => {
    expect(await E(baseState({ collapsed: [{ members: refs("s:d", "s:e") }, { members: refs("s:d", "s:e") }] }))).toBe("INVALID_GROUP/DUPLICATE_GROUP");
    expect(await E(baseState({ collapsed: [{ members: refs("s:a", "s:b") }, { members: refs("s:b", "s:c") }] }))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
    // a duplicate pair AND an overlapping third group: DUPLICATE_GROUP wins in any list position
    const dup = { members: refs("s:a", "s:b") }, ov = { members: refs("s:b", "s:c") };
    expect(await E(baseState({ collapsed: [dup, dup, ov] }))).toBe("INVALID_GROUP/DUPLICATE_GROUP");
    expect(await E(baseState({ collapsed: [dup, ov, ov] }))).toBe("INVALID_GROUP/DUPLICATE_GROUP");
    expect(await E(stateB())).toBe("no error");
    // equal sizes but disjoint, and a chain a < b < c
    expect(await E(baseState({ collapsed: [{ members: refs("s:a", "s:b") }, { members: refs("s:d", "s:e") }] }))).toBe("no error");
    expect(await E(baseState({ collapsed: [{ members: refs("s:a", "s:b") }, { members: refs("s:a", "s:b", "s:c") }, { members: refs("s:c", "s:d", "s:e") }] }))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
  });
  it("N04 N05 depth 16 accepted, depth 17 is DEPTH_LIMIT", async () => {
    const chain = (d: number) => { const out = []; for (let k = 0; k < d; k++) out.push({ members: Array.from({ length: d + 1 - k }, (_, i) => ref(`i:${i + 1}`)) }); return out; };
    // groups have sizes d+1, d, ..., 2: each is a prefix of the one before; canonical order is the proper-prefix-first order
    const sorted = (d: number) => chain(d).reverse();
    expect(await E(baseState({ collapsed: sorted(16) }))).toBe("no error");
    expect(await E(baseState({ collapsed: sorted(17) }))).toBe("RESOURCE_LIMIT/DEPTH_LIMIT");
  });
  it("DEPTH_LIMIT is reported after OVERLAPPING_GROUPS", async () => {
    const chain = Array.from({ length: 17 }, (_, k) => ({ members: Array.from({ length: 18 - k }, (_, i) => ref(`i:${i + 1}`)) })).reverse();
    const bad = { members: [ref("i:17"), ref("i:18"), ref("i:30")] };
    // the overlapping group sorts after the prefix chain: [i:1..2] .. [i:1..18], then [i:17,i:18,i:30]
    expect(await E(baseState({ collapsed: [...chain, bad] }))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
  });
  it("P07 duplicate pin; pins are checked after groups", async () => {
    expect(await E(baseState({ pinned: refs("s:a", "s:a") }))).toBe("INVALID_LOD/DUPLICATE_PIN");
    expect(await E(baseState({ pinned: refs("s:a", "s:a"), collapsed: [{ members: refs("s:d") }] }))).toBe("INVALID_GROUP/GROUP_TOO_SMALL");
  });
  it("id twins i:7 and s:7 are different members", async () => {
    expect(await E(baseState({ collapsed: [{ members: refs("i:7", "s:7") }] }))).toBe("no error");
  });
  it("members sort by (type, id) in NodeRef/2 order and the type compares by UTF-8 bytes", async () => {
    // U+FF5E (EF BD 9E) sorts after U+1F600 (F0 9F 98 80) in UTF-16 but BEFORE it in UTF-8
    const hi = { id: "s:x", type: "\u{1F600}" }, lo = { id: "s:x", type: "\uFF5E" };
    expect(await E(baseState({ pinned: [lo, hi] }))).toBe("no error");
    expect(await E(baseState({ pinned: [hi, lo] }))).toBe("INVALID_LOD/NON_CANONICAL");
  });
  it("hostile: x- nested 10,000 deep is TOO_DEEP without a stack overflow", async () => {
    const t = text(baseState()).replace('"zoom_milli":500', `"x-deep":${"[".repeat(10_000)}${"]".repeat(10_000)},"zoom_milli":500`);
    expect(await E(t)).toBe("INVALID_LOD/TOO_DEEP");
  });
});

describe("serializeLODState and hashLODState", () => {
  it("serialize sorts members, groups and pins and is canonical", async () => {
    const s = stateB() as never as Parameters<typeof serializeLODState>[0];
    const shuffled = { ...s, collapsed: [...s.collapsed].reverse().map((g) => ({ ...g, members: [...g.members].reverse() })), pinned: [ref("s:b"), ref("s:a")] };
    const out = dec(serializeLODState(shuffled));
    expect(out).toContain('"pinned":[{"id":"s:a","type":"t"},{"id":"s:b","type":"t"}]');
    expect(out.indexOf('"label":"outer"')).toBeLessThan(out.lastIndexOf('"members"'));
  });
  it("serialize throws INVALID_LOD for values outside the domain", () => {
    const s = stateA() as never as Parameters<typeof serializeLODState>[0];
    expect(() => serializeLODState({ ...s, zoom_milli: -1 })).toThrow(/INVALID_LOD/);
    expect(() => serializeLODState({ ...s, zoom_milli: 1.5 })).toThrow(/INVALID_NUMBER/);
    expect(() => serializeLODState({ ...s, "x-a": null })).toThrow(/INVALID_VALUE/);
  });
});
