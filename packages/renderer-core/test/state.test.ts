// SemanticState: initialState, serializeState (strict), normalizeState, parseState check order (design section 4; vectors S*).
import { describe, expect, it } from "vitest";
import { buildRenderModel } from "../src/model.js";
import { effectiveVisibility, initialState, normalizeState, parseState, serializeState, stateSha256, traversalOrder } from "../src/state.js";
import type { RenderModel, SemanticState } from "../src/types.js";
import { IgrError } from "../src/errors.js";
import { ARTIFACT_O1, LAYOUT_F01, SCENE_O1, dec, enc, errOf, igl, o1Scene, o4Scene } from "./helpers.js";
import { sha256Hex } from "isongraph-visualize-scene-core/primitives";

const A2 = '{"hidden":{"edges":[],"nodes":[]},"igr":"IGR/1","layout_sha256":"2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db","scene_sha256":"e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc","selection":{"edges":[],"nodes":[]},"viewport":{"center_x":383554,"center_y":134563,"height":600,"width":900,"zoom":1994}}';
const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };
const E0 = { ord: "0", rel: "KNOWS", src: I1, tgt: ANN };

let O1: RenderModel;
const o1 = async () => (O1 ??= await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json")));

/** The S03-like base: node and edge selected, focus on a node. */
const s03 = async (): Promise<SemanticState> => ({ ...initialState(await o1(), { width: 900, height: 600 }), selection: { nodes: [I1], edges: [E0] }, focus: { node: ANN } });
const clone = (s: unknown): Record<string, any> => JSON.parse(JSON.stringify(s));
const bytesOf = (v: unknown): Uint8Array => enc(JSON.stringify(v)); // for mutated JSON values (key order is the caller's responsibility)

describe("Appendix A.2 initialState (S01)", () => {
  it("O1 at 900x600 equals the worked example byte for byte", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    expect(dec(serializeState(m, s))).toBe(A2);
    expect(s.viewport).toEqual({ center_x: 383554, center_y: 134563, width: 900, height: 600, zoom: 1994 });
    expect(await stateSha256(m, s)).toBe(await sha256Hex(enc(A2)));
  });
  it("parseState reads it back to an equal state (round trip)", async () => {
    const m = await o1();
    expect(parseState(m, enc(A2))).toEqual(initialState(m, { width: 900, height: 600 }));
  });
  it("S07 empty scene: centre 0,0 and zoom 1000", async () => {
    const m = await buildRenderModel(igl("scenes/empty.scene.json"), igl("layouts/F07.layout.json"));
    expect(initialState(m, { width: 640, height: 480 }).viewport).toEqual({ center_x: 0, center_y: 0, width: 640, height: 480, zoom: 1000 });
  });
  it("S08-S10 small viewports never fail: padding = min(32, floorDiv(min(w,h)-1, 2))", async () => {
    const m = await o1();
    for (const [w, h] of [[1, 1], [64, 64], [65, 65], [1, 16384], [16384, 1], [2, 2], [3, 900]] as const) {
      const s = initialState(m, { width: w, height: h });
      expect(s.viewport.width).toBe(w);
      expect(s.viewport.zoom).toBeGreaterThanOrEqual(10);
      expect(s.viewport.zoom).toBeLessThanOrEqual(100000);
    }
    expect(initialState(m, { width: 1, height: 1 }).viewport.zoom).toBe(10); // ax = ay = 1: candidates 2 and 9, clamped up to ZOOM_MIN
    // 16384 x 16384: padding 32, ax = 16320, candidate floorDiv(16320e6, 419186) = 38933
    expect(initialState(m, { width: 16384, height: 16384 }).viewport.zoom).toBe(Math.floor(16320e6 / 419186));
  });
  it("a single node (both spans 0) uses ZOOM_DEFAULT; a size outside 1..16384 is INVALID_INPUT/OUT_OF_RANGE", async () => {
    const one = await buildRenderModel(igl("scenes/single.scene.json"), igl("layouts/F08.layout.json"));
    expect(initialState(one, { width: 900, height: 600 }).viewport.zoom).toBe(1000);
    const m = await o1();
    for (const bad of [{ width: 0, height: 5 }, { width: 5, height: 16385 }, { width: -1, height: 5 }]) expect(errOf(() => initialState(m, bad))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => initialState(m, { width: 1.5, height: 5 }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => initialState(m, { width: NaN, height: 5 }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(errOf(() => initialState(m, { width: "9", height: 5 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => initialState({} as never, { width: 5, height: 5 }))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
  });
});

describe("accepted states S02-S06, S11, S32", () => {
  it("S02/S03 selection and focus round trip", async () => {
    const m = await o1();
    const s = await s03();
    const b = serializeState(m, s);
    expect(dec(b)).toContain('"focus":{"node":{"id":"s:ann","type":"person"}}');
    expect(dec(b).startsWith('{"focus"')).toBe(true); // focus < hidden alphabetically
    expect(parseState(m, b)).toEqual(s);
  });
  it("S04/S06 hidden node and hidden edge with visible endpoints", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    const hn = { ...base, hidden: { nodes: [ANN], edges: [] } };
    expect(parseState(m, serializeState(m, hn))).toEqual(hn);
    const he = { ...base, hidden: { nodes: [], edges: [E0] } };
    expect(parseState(m, serializeState(m, he))).toEqual(he);
  });
  it("S05/S32 negative centre and the safe extremes", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    for (const c of [-5, -(2 ** 53 - 1), 2 ** 53 - 1]) {
      const s = { ...base, viewport: { ...base.viewport, center_x: c, center_y: -c } };
      expect(parseState(m, serializeState(m, s))).toEqual(s);
    }
  });
  it("S11 O4-based state with a self-loop edge selected", async () => {
    const m = await buildRenderModel(o4Scene(), igl("layouts/F02.layout.json"));
    const loop = m.edges.find((e) => e.src === e.tgt)!;
    const s = { ...initialState(m, { width: 400, height: 300 }), selection: { nodes: [], edges: [loop.ref] } };
    expect(parseState(m, serializeState(m, s))).toEqual(s);
  });
});

describe("rejected states: exact codes in the stated order", () => {
  const code = async (mut: (s: Record<string, any>) => unknown, raw?: (b: Uint8Array) => Uint8Array): Promise<string> => {
    const m = await o1();
    const base = clone(await s03());
    const out = mut(base);
    const text = out === undefined ? base : out;
    const bytes = raw ? raw(serializeState(m, await s03())) : typeof text === "string" ? enc(text) : enc(canon(text));
    return errOf(() => parseState(m, bytes));
  };
  // canonical writer for mutated plain values (sorted keys, no spaces)
  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v !== null && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
    return JSON.stringify(v);
  };
  const ok = (s: string) => expect(s).toBe("no error");

  it("sanity: the unmutated base parses", async () => ok(await code(() => undefined)));

  it("S12 reordered keys", async () => {
    const m = await o1();
    const v = JSON.parse(dec(serializeState(m, await s03()))) as Record<string, unknown>;
    const reordered = { igr: v["igr"], ...v };
    expect(errOf(() => parseState(m, enc(JSON.stringify(reordered))))).toBe("INVALID_STATE/NON_CANONICAL");
  });
  it("S13 whitespace", async () => {
    const m = await o1();
    const t = dec(serializeState(m, await s03()));
    expect(errOf(() => parseState(m, enc(t.replace(",", ", "))))).toBe("INVALID_STATE/NON_CANONICAL");
    expect(errOf(() => parseState(m, enc(t + "\n")))).toBe("INVALID_STATE/NON_CANONICAL");
  });
  it("S14 duplicate JSON key is read last-wins and then differs from the canonical bytes", async () => {
    const m = await o1();
    const t = dec(serializeState(m, await s03()));
    const dup = t.replace('"igr":"IGR/1"', '"igr":"IGR/1","igr":"IGR/1"');
    expect(errOf(() => parseState(m, enc(dup)))).toBe("INVALID_STATE/NON_CANONICAL");
  });
  it("S15 unsorted selection", async () => expect(await code((s) => { s["selection"].nodes = [ANN, I1]; })).toBe("INVALID_STATE/NON_CANONICAL"));
  it("S16 duplicate element", async () => expect(await code((s) => { s["selection"].nodes = [I1, I1]; })).toBe("INVALID_STATE/DUPLICATE_ELEMENT"));
  it("S17 unsorted and duplicate: DUPLICATE_ELEMENT", async () => expect(await code((s) => { s["selection"].nodes = [ANN, I1, ANN]; })).toBe("INVALID_STATE/DUPLICATE_ELEMENT"));
  it("S18 unresolved node / unresolved in an unsorted array: UNRESOLVED_ELEMENT", async () => {
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:9", type: "person" }]; })).toBe("INVALID_STATE/UNRESOLVED_ELEMENT");
    expect(await code((s) => { s["selection"].nodes = [ANN, { id: "i:9", type: "person" }, I1]; })).toBe("INVALID_STATE/UNRESOLVED_ELEMENT");
  });
  it("S19 undirected edge with src > tgt does not resolve", async () => {
    const m = await buildRenderModel(o4Scene(), igl("layouts/F02.layout.json"));
    const e = m.edges.find((x) => x.src !== x.tgt)!;
    const flipped = { ord: e.ref.ord, rel: e.ref.rel, src: e.ref.tgt, tgt: e.ref.src };
    const s = { ...initialState(m, { width: 400, height: 300 }), selection: { nodes: [], edges: [flipped] } };
    expect(errOf(() => serializeState(m, s))).toBe("INVALID_STATE/UNRESOLVED_ELEMENT");
  });
  it("S20/S21 wrong hashes; S22 another scene's state: binding errors", async () => {
    expect(await code((s) => { s["scene_sha256"] = "0".repeat(64); })).toBe("INVALID_STATE/SCENE_MISMATCH");
    expect(await code((s) => { s["layout_sha256"] = "0".repeat(64); })).toBe("INVALID_STATE/LAYOUT_MISMATCH");
    const other = await buildRenderModel(igl("scenes/bind-a.scene.json"), igl("layouts/F11.layout.json"));
    const foreign = serializeState(other, initialState(other, { width: 900, height: 600 }));
    const mo1 = await o1();
    expect(errOf(() => parseState(mo1, foreign))).toBe("INVALID_STATE/SCENE_MISMATCH");
  });
  it("binding precedes integrity: wrong hash with an unresolved element, and with non-canonical spelling", async () => {
    expect(await code((s) => { s["scene_sha256"] = "0".repeat(64); s["selection"].nodes = [{ id: "i:9", type: "person" }]; })).toBe("INVALID_STATE/SCENE_MISMATCH");
    const m = await o1();
    const t = dec(serializeState(m, await s03())).replace(SCENE_O1, "0".repeat(64)).replace('"zoom":1994', '"zoom":1994.0');
    expect(errOf(() => parseState(m, enc(t)))).toBe("INVALID_STATE/SCENE_MISMATCH");
  });
  it("S23 selected and hidden / S24 focus on an edge with a hidden endpoint", async () => {
    expect(await code((s) => { s["hidden"].nodes = [I1]; })).toBe("INVALID_STATE/SELECTED_HIDDEN");
    expect(await code((s) => { s["selection"] = { nodes: [], edges: [] }; s["focus"] = { edge: E0 }; s["hidden"].nodes = [I1]; })).toBe("INVALID_STATE/FOCUS_HIDDEN");
    expect(await code((s) => { s["selection"] = { nodes: [], edges: [] }; s["hidden"].nodes = [ANN]; })).toBe("INVALID_STATE/FOCUS_HIDDEN");
  });
  it("S25/S26 zoom outside range, S29/S30 size outside range: INVALID_VIEWPORT", async () => {
    expect(await code((s) => { s["viewport"].zoom = 0; })).toBe("INVALID_STATE/INVALID_VIEWPORT");
    expect(await code((s) => { s["viewport"].zoom = 9; })).toBe("INVALID_STATE/INVALID_VIEWPORT");
    expect(await code((s) => { s["viewport"].zoom = 100001; })).toBe("INVALID_STATE/INVALID_VIEWPORT");
    expect(await code((s) => { s["viewport"].width = 0; })).toBe("INVALID_STATE/INVALID_VIEWPORT");
    expect(await code((s) => { s["viewport"].width = 16385; })).toBe("INVALID_STATE/INVALID_VIEWPORT");
    expect(await code((s) => { s["viewport"].height = -3; })).toBe("INVALID_STATE/INVALID_VIEWPORT");
    expect(await code((s) => { s["viewport"].zoom = 10; s["viewport"].height = 16384; })).toBe("no error");
  });
  it("S27 fractional zoom is INVALID_NUMBER; S28 1e3 passes step 1 and is caught as NON_CANONICAL; S31 centre 2^53 is INVALID_NUMBER", async () => {
    const m = await o1();
    const t = dec(serializeState(m, await s03()));
    expect(errOf(() => parseState(m, enc(t.replace('"zoom":1994', '"zoom":1000.5'))))).toBe("INVALID_STATE/INVALID_NUMBER");
    expect(errOf(() => parseState(m, enc(t.replace('"zoom":1994', '"zoom":1e3'))))).toBe("INVALID_STATE/NON_CANONICAL");
    expect(errOf(() => parseState(m, enc(t.replace('"zoom":1994', '"zoom":1994.0'))))).toBe("INVALID_STATE/NON_CANONICAL");
    expect(errOf(() => parseState(m, enc(t.replace('"center_x":383554', '"center_x":9007199254740992'))))).toBe("INVALID_STATE/INVALID_NUMBER");
    expect(errOf(() => parseState(m, enc(t.replace('"zoom":1994', '"zoom":1e999'))))).toBe("INVALID_STATE/INVALID_NUMBER");
    expect(errOf(() => parseState(m, enc(t.replace('"center_y":134563', '"center_y":-0'))))).toBe("INVALID_STATE/NON_CANONICAL");
  });
  it("S33 unknown field, S34 x- field, S35 missing viewport, S36 igr IGR/2", async () => {
    expect(await code((s) => { s["bogus"] = 1; })).toBe("INVALID_STATE/UNKNOWN_FIELD");
    expect(await code((s) => { s["x-note"] = 1; })).toBe("INVALID_STATE/UNKNOWN_FIELD");
    expect(await code((s) => { s["viewport"]["x-a"] = 1; })).toBe("INVALID_STATE/UNKNOWN_FIELD");
    expect(await code((s) => { delete s["viewport"]; })).toBe("INVALID_STATE/MISSING_FIELD");
    expect(await code((s) => { delete s["viewport"].zoom; })).toBe("INVALID_STATE/MISSING_FIELD");
    expect(await code((s) => { s["igr"] = "IGR/2"; })).toBe("INVALID_STATE/UNSUPPORTED_VERSION");
  });
  it("unknown fields precede missing fields; remaining keys are validated in ascending key order", async () => {
    expect(await code((s) => { delete s["viewport"]; s["bogus"] = 1; })).toBe("INVALID_STATE/UNKNOWN_FIELD");
    // focus (SCHEMA) is validated before hidden/igr/hash/viewport problems
    expect(await code((s) => { s["focus"] = null; s["igr"] = "IGR/2"; s["viewport"].zoom = 0; })).toBe("INVALID_STATE/SCHEMA");
    // igr before layout_sha256 before scene_sha256 before viewport
    expect(await code((s) => { s["igr"] = "IGR/2"; s["layout_sha256"] = "bad"; })).toBe("INVALID_STATE/UNSUPPORTED_VERSION");
    expect(await code((s) => { s["layout_sha256"] = "bad"; s["scene_sha256"] = "bad"; s["viewport"].zoom = 0; })).toBe("INVALID_STATE/INVALID_HASH");
    // inside viewport: center_x before zoom
    expect(await code((s) => { s["viewport"].zoom = 0; s["viewport"].center_x = "x"; })).toBe("INVALID_STATE/SCHEMA");
  });
  it("S37 BOM, S38 invalid UTF-8, not JSON, top level not an object, lone surrogate", async () => {
    const m = await o1();
    const good = serializeState(m, await s03());
    expect(errOf(() => parseState(m, new Uint8Array([0xef, 0xbb, 0xbf, ...good])))).toBe("INVALID_STATE/INVALID_ENCODING");
    expect(errOf(() => parseState(m, new Uint8Array([...good.slice(0, 10), 0xff, ...good.slice(10)])))).toBe("INVALID_STATE/INVALID_ENCODING");
    expect(errOf(() => parseState(m, enc("{")))).toBe("INVALID_STATE/SCHEMA");
    expect(errOf(() => parseState(m, enc("[]")))).toBe("INVALID_STATE/SCHEMA");
    expect(errOf(() => parseState(m, enc("1")))).toBe("INVALID_STATE/SCHEMA");
    const t = dec(good).replace('"s:ann"', '"s:a\\ud800"');
    expect(errOf(() => parseState(m, enc(t)))).toBe("INVALID_STATE/INVALID_STRING");
    expect(errOf(() => parseState(m, enc("[\"\\ud800\"]")))).toBe("INVALID_STATE/INVALID_STRING"); // before the top-level object check
  });
  it("S39 null focus is SCHEMA; focus with two keys SCHEMA, none SCHEMA, other key UNKNOWN_FIELD", async () => {
    expect(await code((s) => { s["focus"] = null; })).toBe("INVALID_STATE/SCHEMA");
    expect(await code((s) => { s["focus"] = { node: ANN, edge: E0 }; })).toBe("INVALID_STATE/SCHEMA");
    expect(await code((s) => { s["focus"] = {}; })).toBe("INVALID_STATE/SCHEMA");
    expect(await code((s) => { s["focus"] = { nodes: ANN }; })).toBe("INVALID_STATE/UNKNOWN_FIELD");
  });
  it("S40 bad hash shape (uppercase, short, wrong type)", async () => {
    expect(await code((s) => { s["scene_sha256"] = SCENE_O1.toUpperCase(); })).toBe("INVALID_STATE/INVALID_HASH");
    expect(await code((s) => { s["layout_sha256"] = "abc"; })).toBe("INVALID_STATE/INVALID_HASH");
    expect(await code((s) => { s["layout_sha256"] = 5; })).toBe("INVALID_STATE/SCHEMA");
  });
  it("well-formed addresses: untagged id, bad type, bad ord are INVALID_VALUE; wrong types SCHEMA", async () => {
    expect(await code((s) => { s["selection"].nodes = [{ id: "1", type: "person" }]; })).toBe("INVALID_STATE/INVALID_VALUE");
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:01", type: "person" }]; })).toBe("INVALID_STATE/INVALID_VALUE");
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:9223372036854775808", type: "person" }]; })).toBe("INVALID_STATE/INVALID_VALUE");
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:1", type: "per son" }]; })).toBe("INVALID_STATE/INVALID_VALUE");
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:1", type: "" }]; })).toBe("INVALID_STATE/INVALID_VALUE");
    expect(await code((s) => { s["selection"].edges = [{ ...E0, ord: "01" }]; })).toBe("INVALID_STATE/INVALID_VALUE");
    expect(await code((s) => { s["selection"].edges = [{ ...E0, rel: "K:N" }]; })).toBe("INVALID_STATE/INVALID_VALUE");
    // rev 4 (4.2): the key rule applies to address objects like to every object: unknown first, then missing; wrong JSON type SCHEMA; then patterns
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:1" }]; })).toBe("INVALID_STATE/MISSING_FIELD"); // S43
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:1", type: "person", "x-a": "i:1" }]; })).toBe("INVALID_STATE/UNKNOWN_FIELD"); // S42
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:1", type: "person", extra: 1 }]; })).toBe("INVALID_STATE/UNKNOWN_FIELD");
    expect(await code((s) => { s["selection"].nodes = [{ id: "i:1", x: 1 }]; })).toBe("INVALID_STATE/UNKNOWN_FIELD"); // S46: unknown AND missing -> unknown first
    expect(await code((s) => { s["selection"].nodes = [{}]; })).toBe("INVALID_STATE/MISSING_FIELD");
    expect(await code((s) => { const { ord: _o, ...rest } = E0; s["selection"].edges = [rest]; })).toBe("INVALID_STATE/MISSING_FIELD"); // S44
    expect(await code((s) => { s["selection"].edges = [{ ...E0, src: { id: "i:1" } }]; })).toBe("INVALID_STATE/MISSING_FIELD");
    expect(await code((s) => { s["selection"].nodes = [{ id: 5, type: "person" }]; })).toBe("INVALID_STATE/SCHEMA"); // S45
    expect(await code((s) => { s["selection"].nodes = ["x"]; })).toBe("INVALID_STATE/SCHEMA");
    expect(await code((s) => { s["selection"].nodes = [{ id: 1, type: "person" }]; })).toBe("INVALID_STATE/SCHEMA");
    expect(await code((s) => { s["selection"].nodes = "x"; })).toBe("INVALID_STATE/SCHEMA");
    expect(await code((s) => { s["selection"].extra = 1; })).toBe("INVALID_STATE/UNKNOWN_FIELD");
    expect(await code((s) => { delete s["selection"].nodes; })).toBe("INVALID_STATE/MISSING_FIELD");
    expect(await code((s) => { s["hidden"].nodes = [{ id: "s:", type: "person" }]; })).toBe("INVALID_STATE/UNRESOLVED_ELEMENT"); // s: is a well-formed id that names nothing: step 3
  });
  it("S41 bytes over maxStateBytes: RESOURCE_LIMIT/BYTES_LIMIT, checked first", async () => {
    const m = await o1();
    const b = serializeState(m, await s03());
    expect(errOf(() => parseState(m, b, { maxStateBytes: b.length - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(errOf(() => parseState(m, b, { maxStateBytes: b.length }))).toBe("no error");
    expect(errOf(() => parseState(m, new Uint8Array([0xff, 0xff, 0xff]), { maxStateBytes: 2 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("parseState snapshots its bytes and rejects non-bytes", async () => {
    const m = await o1();
    expect(() => parseState(m, "x" as never)).toThrow(TypeError);
    expect(errOf(() => parseState({} as never, enc(A2)))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
  });
});

describe("serializeState is a strict writer (C2): it never reorders", () => {
  it("click-order selection throws NON_CANONICAL; duplicates throw DUPLICATE_ELEMENT", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    expect(errOf(() => serializeState(m, { ...base, selection: { nodes: [ANN, I1], edges: [] } }))).toBe("INVALID_STATE/NON_CANONICAL");
    expect(errOf(() => serializeState(m, { ...base, selection: { nodes: [I1, I1], edges: [] } }))).toBe("INVALID_STATE/DUPLICATE_ELEMENT");
  });
  it("refuses everything parseState refuses at the value level, with the same codes", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    const cases: [unknown, string][] = [
      [{ ...base, igr: "IGR/2" }, "INVALID_STATE/UNSUPPORTED_VERSION"], [{ ...base, scene_sha256: "0".repeat(64) }, "INVALID_STATE/SCENE_MISMATCH"],
      [{ ...base, viewport: { ...base.viewport, zoom: 0 } }, "INVALID_STATE/INVALID_VIEWPORT"], [{ ...base, viewport: { ...base.viewport, zoom: 1.5 } }, "INVALID_STATE/INVALID_NUMBER"],
      [{ ...base, "x-a": 1 }, "INVALID_STATE/UNKNOWN_FIELD"], [{ ...base, focus: null }, "INVALID_STATE/SCHEMA"],
      [{ ...base, viewport: { ...base.viewport, center_x: -0 } }, "INVALID_STATE/NON_CANONICAL"], [null, "INVALID_STATE/SCHEMA"], [[], "INVALID_STATE/SCHEMA"],
      [{ ...base, selection: { nodes: [{ id: "i:1", type: "person", extra: 1 }], edges: [] } }, "INVALID_STATE/UNKNOWN_FIELD"],
      [{ ...base, hidden: { nodes: [], edges: [] }, fn: () => 1 }, "INVALID_STATE/UNKNOWN_FIELD"],
    ];
    for (const [s, want] of cases) expect(errOf(() => serializeState(m, s as never)), JSON.stringify(s)).toBe(want);
  });
  it("reads each caller property once and is unaffected by getters that change their answer", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    let reads = 0;
    const hostile = { ...base, viewport: { ...base.viewport, get zoom(): number { reads++; return reads === 1 ? 1994 : 0; } } };
    expect(dec(serializeState(m, hostile as never))).toBe(A2);
    expect(reads).toBe(1);
    const thrower = { ...base, viewport: { ...base.viewport, get zoom(): number { throw new Error("boom"); } } };
    expect(errOf(() => serializeState(m, thrower as never))).toBe("INVALID_INPUT/UNREADABLE");
  });
  it("does not mutate its input", async () => {
    const m = await o1();
    const s = await s03();
    const before = JSON.stringify(s);
    serializeState(m, s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("rev 4: an undefined optional value counts as absent in a state object", () => {
  it("focus: undefined is no focus; null is still SCHEMA", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    expect(dec(serializeState(m, { ...base, focus: undefined }))).toBe(A2);
    expect(normalizeState(m, { ...base, focus: undefined }).focus).toBeUndefined();
    expect("focus" in normalizeState(m, { ...base, focus: undefined })).toBe(false);
  });
});

describe("normalizeState: the host-side sorter (C2)", () => {
  it("sorts by scene order, removes duplicates, then agrees with the strict writer", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    const messy = { ...base, selection: { nodes: [ANN, I1, ANN], edges: [E0, E0] }, hidden: { nodes: [], edges: [] } };
    const n = normalizeState(m, messy);
    expect(n.selection).toEqual({ nodes: [I1, ANN], edges: [E0] });
    expect(() => serializeState(m, n)).not.toThrow();
  });
  it("otherwise validates: unresolved, hash, hidden/selected, version", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    expect(errOf(() => normalizeState(m, { ...base, selection: { nodes: [{ id: "i:9", type: "person" }], edges: [] } }))).toBe("INVALID_STATE/UNRESOLVED_ELEMENT");
    expect(errOf(() => normalizeState(m, { ...base, scene_sha256: "1".repeat(64) }))).toBe("INVALID_STATE/SCENE_MISMATCH");
    expect(errOf(() => normalizeState(m, { ...base, selection: { nodes: [I1], edges: [] }, hidden: { nodes: [I1], edges: [] } }))).toBe("INVALID_STATE/SELECTED_HIDDEN");
  });
  it("returns fresh arrays, not aliases of the input", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    const n = normalizeState(m, base);
    expect(n.selection.nodes).not.toBe(base.selection.nodes);
    expect(n.viewport).not.toBe(base.viewport);
  });
});

describe("effective visibility and traversal order (section 4.1, D6)", () => {
  it("an edge with a hidden endpoint is effectively hidden; outside the viewport is never hidden", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    const v = effectiveVisibility(m, { ...base, hidden: { nodes: [ANN], edges: [] } });
    expect(v.nodes).toEqual([true, false]);
    expect(v.edges).toEqual([false]);
    const v2 = effectiveVisibility(m, { ...base, hidden: { nodes: [], edges: [E0] } });
    expect(v2.nodes).toEqual([true, true]);
    expect(v2.edges).toEqual([false]);
    expect(effectiveVisibility(m, base)).toEqual({ nodes: [true, true], edges: [true] });
  });
  it("nodes in scene order, then edges in scene order, hidden skipped", async () => {
    const m = await buildRenderModel(igl("scenes/mixed20.scene.json"), igl("layouts/F04.layout.json"));
    const base = initialState(m, { width: 900, height: 600 });
    const all = traversalOrder(m, base);
    expect(all).toHaveLength(57);
    expect(all.slice(0, 20).every((a) => "node" in a)).toBe(true);
    expect(all.slice(20).every((a) => "edge" in a)).toBe(true);
    expect(all.slice(0, 20).map((a) => (a as { node: unknown }).node)).toEqual(m.nodes.map((n) => n.ref));
    const hidden = { ...base, hidden: { nodes: [m.nodes[3]!.ref], edges: [] } };
    const some = traversalOrder(m, hidden);
    expect(some.some((a) => "node" in a && a.node.id === m.nodes[3]!.ref.id)).toBe(false);
    const incident = m.edges.filter((e) => e.src === 3 || e.tgt === 3).length;
    expect(some).toHaveLength(57 - 1 - incident);
    expect(traversalOrder(m, base)).not.toBe(all);
  });
});

describe("parseState fuzzing: only IgrError is ever thrown", () => {
  it("90,000 byte-level mutants of valid states", async () => {
    const m = await o1();
    const seeds = [serializeState(m, await s03()), enc(A2), serializeState(m, { ...initialState(m, { width: 900, height: 600 }), hidden: { nodes: [ANN], edges: [] } })];
    let rng = 0x9e3779b1 >>> 0;
    const next = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0);
    const interesting = [0x22, 0x7b, 0x7d, 0x5b, 0x5d, 0x2c, 0x3a, 0x00, 0xff, 0x5c, 0x30, 0x2d, 0x65, 0xc0, 0xed];
    let accepted = 0;
    for (let i = 0; i < 90_000; i++) {
      const b = Uint8Array.from(seeds[next() % seeds.length]!);
      const muts = 1 + (next() % 3);
      let cur = b;
      for (let k = 0; k < muts; k++) {
        const pos = next() % Math.max(1, cur.length);
        const op = next() % 4;
        if (op === 0) { cur = Uint8Array.from(cur); cur[pos] = interesting[next() % interesting.length]!; }
        else if (op === 1) cur = Uint8Array.from([...cur.slice(0, pos), ...cur.slice(pos + 1)]);
        else if (op === 2) cur = Uint8Array.from([...cur.slice(0, pos), interesting[next() % interesting.length]!, ...cur.slice(pos)]);
        else cur = cur.slice(0, pos);
      }
      try { const s = parseState(m, cur); accepted++; expect(serializeState(m, s)).toEqual(cur); }
      catch (e) { if (!(e instanceof IgrError)) throw e; }
    }
    expect(accepted).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

describe("identities", () => {
  it("state_sha256 binds the pair of hashes", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    expect(s.scene_sha256).toBe(SCENE_O1);
    expect(s.layout_sha256).toBe(LAYOUT_F01);
    expect(ARTIFACT_O1).toHaveLength(64);
  });
});

describe("S49: a lone surrogate in a state OBJECT is INVALID_STRING too (every (model, state) function applies step 1)", () => {
  it("in an address id, a type, and a key", async () => {
    const m = await o1();
    const base = initialState(m, { width: 900, height: 600 });
    const lone = "s:\ud800";
    expect(errOf(() => serializeState(m, { ...base, selection: { nodes: [{ id: lone, type: "person" }], edges: [] } }))).toBe("INVALID_STATE/INVALID_STRING");
    expect(errOf(() => normalizeState(m, { ...base, hidden: { nodes: [{ id: "i:1", type: "per\udc00son" }], edges: [] } }))).toBe("INVALID_STATE/INVALID_STRING");
    expect(errOf(() => serializeState(m, { ...base, ["x\ud800"]: 1 } as never))).toBe("INVALID_STATE/INVALID_STRING");
    // the string check is part of step 1: it precedes binding and integrity
    expect(errOf(() => serializeState(m, { ...base, scene_sha256: "0".repeat(64), selection: { nodes: [{ id: lone, type: "person" }], edges: [] } }))).toBe("INVALID_STATE/INVALID_STRING");
    // a well-formed astral pair is fine
    expect(errOf(() => serializeState(m, { ...base, selection: { nodes: [{ id: "s:\ud83d\ude00", type: "person" }], edges: [] } }))).toBe("INVALID_STATE/UNRESOLVED_ELEMENT");
  });
});
