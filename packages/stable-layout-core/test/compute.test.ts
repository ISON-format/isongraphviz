import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LayoutError, bindLayout, computeFixedLayout, verifyLayout } from "isongraph-visualize-layout-core";
import { describe, expect, it } from "vitest";
import { StableLayoutError, computeStableLayout } from "../src/index.js";
import type { PreviousDrawing, StableResult } from "../src/types.js";
import { PLACE_56, SPEC_A, SPEC_B, SPEC_C, SPEC_PREV, REPORT_C_TEXT, WORKED, cr, drawing, fixedLayout, prevDrawing, sceneBytes, sha, stableError, text, type SceneSpec } from "./helpers.js";

const FIX = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(FIX + p));
const CORE_CFG = { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 };
const posOf = async (r: StableResult): Promise<Record<string, [number, number]>> => {
  const out: Record<string, [number, number]> = {};
  for (const n of (await bindLayout(r.drawing.sceneBytes, r.drawing.layoutBytes)).layout.nodes) out[n.ref.id] = [n.x, n.y];
  return out;
};

describe("section 5.6 worked examples (acceptance tests: every hash, length, work value and report byte)", () => {
  it("Case A, pure addition", async () => {
    const prev = await prevDrawing();
    const r = await computeStableLayout(prev, await sceneBytes(SPEC_A), { placement: PLACE_56 });
    expect(r.mode).toBe("incremental");
    expect(r.layout.sceneSha256).toBe(WORKED.A.scene);
    expect(r.layout.layoutSha256).toBe(WORKED.A.layout);
    expect(r.reportSha256).toBe(WORKED.A.report);
    expect(r.reportBytes.length).toBe(WORKED.A.bytes);
    expect(await sha(r.reportBytes)).toBe(WORKED.A.report);
    expect(r.stats).toEqual({ work: 61, waves: 1, placed: 1 });
    expect(await posOf(r)).toEqual({ "i:1": [0, 0], "i:2": [2000, 0], "i:3": [2000, 1500], "i:4": [1000, 0], "i:6": [3000, 700] });
    expect(r.report.nodes.find((n) => n.ref.id === "i:4")).toEqual({ anchor_kind: "neighbours", anchor_x: 0, anchor_y: 0, direction: 0, offset: 1000, ref: { id: "i:4", type: "n" }, ring: 0, status: "added", wave: 0, x: 1000, y: 0 });
  });
  it("Case B, pure removal: placement {present: false}, every dist 0, transform (0,0)", async () => {
    const r = await computeStableLayout(await prevDrawing(), await sceneBytes(SPEC_B), { placement: PLACE_56 });
    expect(r.mode).toBe("incremental");
    expect(r.layout.layoutSha256).toBe(WORKED.B.layout);
    expect(r.reportSha256).toBe(WORKED.B.report);
    expect(r.reportBytes.length).toBe(WORKED.B.bytes);
    expect(r.stats).toEqual({ work: 39, waves: 0, placed: 0 });
    expect(r.report.placement).toEqual({ present: false });
    expect(r.report.transform_hint).toEqual({ present: true, dx: 0, dy: 0 });
    expect(r.report.nodes.filter((n) => n.status === "kept").every((n) => (n as { dist: number }).dist === 0)).toBe(true);
    expect(r.diff.nodes.removed).toEqual([{ id: "i:3", type: "n" }]);
  });
  it("Case C, mixed: add, add in a second wave, remove, with collisions; the report is the section 9.2 example", async () => {
    const r = await computeStableLayout(await prevDrawing(), await sceneBytes(SPEC_C), { placement: PLACE_56 });
    expect(r.layout.sceneSha256).toBe(WORKED.C.scene);
    expect(r.layout.layoutSha256).toBe(WORKED.C.layout);
    expect(r.reportSha256).toBe(WORKED.C.report);
    expect(r.reportBytes.length).toBe(WORKED.C.bytes);
    expect(text(r.reportBytes)).toBe(REPORT_C_TEXT);
    expect(r.stats).toEqual({ work: 105, waves: 2, placed: 2 });
    expect(await posOf(r)).toEqual({ "i:2": [2000, 0], "i:3": [2000, 1500], "i:4": [1076, 1133], "i:5": [1076, 2133], "i:6": [3000, 700] });
  });
  it("TL07 the meter: Case C maxWork 104 fails WORK_LIMIT at the report charge (W = 78 before it), 105 passes; Case A 60 fails, 61 passes", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_C), a = await sceneBytes(SPEC_A);
    let e: unknown;
    try { await computeStableLayout(prev, c, { placement: PLACE_56, budget: { maxWork: 104 } }); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(StableLayoutError);
    expect(e).toMatchObject({ code: "RESOURCE_LIMIT", reason: "WORK_LIMIT" });
    expect((e as StableLayoutError).detail).toBe("work 105 > 104"); // W = 78, the refused charge is 27
    expect((await computeStableLayout(prev, c, { placement: PLACE_56, budget: { maxWork: 105 } })).stats.work).toBe(105);
    expect(await cr(() => computeStableLayout(prev, a, { placement: PLACE_56, budget: { maxWork: 60 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect((await computeStableLayout(prev, a, { placement: PLACE_56, budget: { maxWork: 61 } })).stats.work).toBe(61);
    // the work is refused in the placement loop too (W = 28 + 4 + 24 = 56 .. 58 before node 5)
    expect(await cr(() => computeStableLayout(prev, c, { placement: PLACE_56, budget: { maxWork: 40 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
  it("TL10 raising the budget never changes the output bytes", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_C);
    const a = await computeStableLayout(prev, c, { placement: PLACE_56 });
    const b = await computeStableLayout(prev, c, { placement: PLACE_56, budget: { maxWork: 10_000_000, maxNodes: 99_999 } });
    expect(text(b.reportBytes)).toBe(text(a.reportBytes));
    expect(text(b.layout.layoutBytes)).toBe(text(a.layout.layoutBytes));
  });
});

describe("computeStableLayout: contracts", () => {
  it("the result is an ordinary igl-fixed/1 layout that the frozen verifiers accept; the drawing is for chaining; the diff is returned", async () => {
    const prev = await prevDrawing();
    const r = await computeStableLayout(prev, await sceneBytes(SPEC_C), { placement: PLACE_56 });
    const v = await verifyLayout(r.layout.layoutBytes);
    expect(v.layout.policy).toEqual({ algorithm: "igl-fixed/1", config: {}, family: "FIXED" });
    expect(Object.keys(v.layout).sort()).toEqual(["address_scheme", "igl", "nodes", "policy", "scale", "scene_sha256"]);
    expect(text(r.drawing.layoutBytes)).toBe(text(r.layout.layoutBytes));
    expect(r.drawing.layoutBytes).not.toBe(r.layout.layoutBytes);
    expect(r.diff.nodes.added.map((x) => x.id)).toEqual(["i:4", "i:5"]);
    // chaining: the drawing feeds the next step, which re-verifies it from bytes
    const step2 = await computeStableLayout(r.drawing, await sceneBytes({ ...SPEC_C, tag: "step2", nodes: [...SPEC_C.nodes, "i:7"], edges: [...SPEC_C.edges!, ["i:5", "e", "i:7"]] }), { placement: PLACE_56 });
    expect(step2.report.previous).toMatchObject({ present: true, scene_sha256: WORKED.C.scene, layout_sha256: WORKED.C.layout });
    expect((await posOf(step2))["i:4"]).toEqual([1076, 1133]);
  });
  it("kept nodes never move: the previous coordinates are copied, also for non-trivial values (Law 4)", async () => {
    const spec: SceneSpec = { tag: "k1", nodes: ["i:1", "i:2", "i:3"], edges: [["i:1", "e", "i:2"]] };
    const pos: Record<string, [number, number]> = { "i:1": [123457, -98765], "i:2": [-7, 1999999], "i:3": [0, 0] };
    const prev = await drawing(spec, pos);
    const next = await sceneBytes({ tag: "k2", nodes: ["i:1", "i:2", "i:3", "i:4"], edges: [["i:1", "e", "i:2"], ["i:1", "e", "i:4"]] });
    const r = await computeStableLayout(prev, next, { placement: { radius: 60000, min_separation: 40000, max_rings: 32 } });
    const out = await posOf(r);
    for (const k of ["i:1", "i:2", "i:3"]) expect(out[k]).toEqual(pos[k]);
    expect(r.report.aggregate).toMatchObject({ moved: 0, max_dist: 0, common: 3, added: 1 });
  });
  it("is deterministic: the same inputs give byte-identical layout and report bytes", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_C);
    const a = await computeStableLayout(prev, c, { placement: PLACE_56 });
    const b = await computeStableLayout(prev, c, { placement: PLACE_56 });
    expect(text(a.reportBytes)).toBe(text(b.reportBytes));
    expect(a.layout.layoutSha256).toBe(b.layout.layoutSha256);
  });
  it("snapshots caller-owned bytes, options and placement before its first await", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_C);
    const ref = await computeStableLayout(prev, c, { placement: PLACE_56 });
    const scene = new Uint8Array(c), layout = new Uint8Array(prev.layoutBytes), placement = { ...PLACE_56 };
    const pending = computeStableLayout({ sceneBytes: prev.sceneBytes, layoutBytes: layout }, scene, { placement });
    scene.fill(0); layout.fill(0); placement.radius = 1;
    expect(text((await pending).reportBytes)).toBe(text(ref.reportBytes));
  });
  it("has exactly three parameters (options is required in the type)", () => { expect(computeStableLayout.length).toBe(3); });
  it("a getter that throws on a drawing, options or placement is INVALID_REQUEST/UNREADABLE", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_A);
    const bad = { get sceneBytes(): Uint8Array { throw new Error("x"); }, layoutBytes: prev.layoutBytes } as unknown as PreviousDrawing;
    expect(await cr(() => computeStableLayout(bad, c, { placement: PLACE_56 }))).toBe("INVALID_REQUEST/UNREADABLE");
    expect(await cr(() => computeStableLayout(prev, c, { get placement(): never { throw new Error("x"); } } as never))).toBe("INVALID_REQUEST/UNREADABLE");
  });
  it("PLACEMENT_FAILED/NO_FREE_SLOT carries the node's wire reference as compact JSON and no partial output", async () => {
    const ring0 = [[1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000], [-383, 924], [-707, 707], [-924, 383], [-1000, 0], [-924, -383], [-707, -707], [-383, -924], [0, -1000], [383, -924], [707, -707], [924, -383]];
    const nodes = ["i:1", ...ring0.map((_, k) => `i:${k + 2}`)];
    const pos: Record<string, [number, number]> = { "i:1": [0, 0] };
    ring0.forEach((p, k) => { pos[`i:${k + 2}`] = [p[0]!, p[1]!]; });
    const prev = await drawing({ tag: "p13", nodes }, pos);
    const next = await sceneBytes({ tag: "n13", nodes: [...nodes, "i:99"], edges: [["i:1", "e", "i:99"]] });
    expect(await stableError(() => computeStableLayout(prev, next, { placement: { radius: 1000, min_separation: 800, max_rings: 1 } }))).toBe('PLACEMENT_FAILED/NO_FREE_SLOT/{"id":"i:99","type":"n"}');
    const ok = await computeStableLayout(prev, next, { placement: PLACE_56 });
    expect(ok.report.nodes.find((n) => n.ref.id === "i:99")).toMatchObject({ ring: 1, direction: 0, x: 2000, y: 0 });
  });
});

describe("placement vectors that need a whole pipeline", () => {
  it("TP10 a removed node's position is not reserved: a new node may land where it stood", async () => {
    const prev = await drawing({ tag: "t10a", nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] }, { "i:1": [0, 0], "i:2": [1000, 0] });
    const r = await computeStableLayout(prev, await sceneBytes({ tag: "t10b", nodes: ["i:1", "i:3"], edges: [["i:1", "e", "i:3"]] }), { placement: PLACE_56 });
    expect((await posOf(r))["i:3"]).toEqual([1000, 0]);
    expect(r.report.nodes.find((n) => n.ref.id === "i:2")).toMatchObject({ status: "removed", x_prev: 1000, y_prev: 0 });
  });
  it("TP14 a previous coordinate of 2^50 is accepted; 2^50 + 1 is INVALID_PREVIOUS/COORDINATE_DOMAIN, also on a node that is removed", async () => {
    const ok = await drawing({ tag: "t14a", nodes: ["i:1", "i:2"] }, { "i:1": [2 ** 50, -(2 ** 50)], "i:2": [0, 0] });
    const next = await sceneBytes({ tag: "t14b", nodes: ["i:1", "i:2"] });
    expect(await cr(() => computeStableLayout(ok, next, { placement: PLACE_56 }))).toBe("no error");
    const bad = await drawing({ tag: "t14c", nodes: ["i:1", "i:2", "i:3"] }, { "i:1": [0, 0], "i:2": [0, 0], "i:3": [2 ** 50 + 1, 0] });
    expect(await cr(() => computeStableLayout(bad, next, { placement: PLACE_56 }))).toBe("INVALID_PREVIOUS/COORDINATE_DOMAIN");
  });
  it("TP15 a FORCE previous layout (frozen F01): the output is FIXED and every kept node equals F01", async () => {
    const prev = { sceneBytes: read("oracles/o1-basic.scene.json"), layoutBytes: read("oracles-igl/layouts/F01.layout.json") };
    const next = await sceneBytes({ tag: "tp15", nodes: [["person", "i:1"], ["person", "s:ann"], ["person", "i:2"]], edges: [[["person", "i:1"], "KNOWS", ["person", "s:ann"]], [["person", "s:ann"], "KNOWS", ["person", "i:2"]]] });
    const r = await computeStableLayout(prev, next, { placement: { radius: 60000, min_separation: 40000, max_rings: 32 } });
    const b = await bindLayout(r.drawing.sceneBytes, r.drawing.layoutBytes);
    expect(b.layout.policy.family).toBe("FIXED");
    const pos = Object.fromEntries(b.layout.nodes.map((n) => [n.ref.id, [n.x, n.y]]));
    expect(pos["i:1"]).toEqual([173961, 81203]);
    expect(pos["s:ann"]).toEqual([593147, 187923]);
    expect(r.report.nodes.find((n) => n.ref.id === "i:2")).toMatchObject({ status: "added", anchor_x: 593147, anchor_y: 187923, direction: 0, x: 653147, y: 187923 });
  });
  it("TP16 the previous is an igl-fixed/1 layout with a negative coordinate (X01 shape)", async () => {
    const prev = await drawing({ tag: "t16", nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] }, { "i:1": [-1500, -20], "i:2": [-3000, 7] });
    const r = await computeStableLayout(prev, await sceneBytes({ tag: "t16b", nodes: ["i:1", "i:2", "i:3"], edges: [["i:1", "e", "i:2"], ["i:1", "e", "i:3"]] }), { placement: PLACE_56 });
    const out = await posOf(r);
    expect(out["i:1"]).toEqual([-1500, -20]);
    expect(out["i:3"]).toEqual([-500, -20]);
  });
  it("TP17 s:7 added while i:7 is kept: FORCE would refuse the scene, the incremental path lays it out", async () => {
    const prev = await drawing({ tag: "t17", nodes: ["i:7"] }, { "i:7": [10, 10] });
    const r = await computeStableLayout(prev, await sceneBytes({ tag: "t17b", nodes: ["i:7", "s:7"], edges: [["i:7", "e", "s:7"]] }), { placement: PLACE_56 });
    expect(r.mode).toBe("incremental");
    expect((await posOf(r))["s:7"]).toEqual([1010, 10]);
  });
  it("TP18 a node whose only edge is a self-loop is an orphan seed", async () => {
    const prev = await drawing({ tag: "t18", nodes: ["i:1"] }, { "i:1": [0, 0] });
    const r = await computeStableLayout(prev, await sceneBytes({ tag: "t18b", nodes: ["i:1", "i:2"], edges: [["i:2", "e", "i:2"]] }), { placement: PLACE_56 });
    expect(r.report.nodes.find((n) => n.ref.id === "i:2")).toMatchObject({ anchor_kind: "seed", wave: 0, anchor_x: 1000, x: 2000 });
  });
  it("TP20 an empty new scene with a previous drawing: the empty FIXED layout, mode incremental, placement still required and recorded {present: false}", async () => {
    const prev = await prevDrawing();
    const empty = await sceneBytes({ tag: "empty", nodes: [] });
    const r = await computeStableLayout(prev, empty, { placement: PLACE_56 });
    expect(r.mode).toBe("incremental");
    expect(r.report.placement).toEqual({ present: false });
    expect(r.report.nodes.every((n) => n.status === "removed")).toBe(true);
    expect(r.report.extent.next).toEqual({ present: false });
    expect(r.report.transform_hint).toEqual({ present: false });
    expect((await verifyLayout(r.layout.layoutBytes)).layout).toMatchObject({ nodes: [], policy: { family: "FIXED" } });
    expect(text(r.layout.layoutBytes)).toBe(text((await computeFixedLayout(empty, [])).layoutBytes));
    expect(await stableError(() => computeStableLayout(prev, empty, {}))).toBe("INVALID_REQUEST/PLACEMENT_REQUIRED");
  });
});

describe("cold start (section 11) and the request rules", () => {
  const o1 = (): Uint8Array => read("oracles/o1-basic.scene.json");
  it("TC01 previous null with a ForceConfig: the bytes equal the frozen F01; the report is cold, every node added (bare)", async () => {
    const r = await computeStableLayout(null, o1(), { coldStart: CORE_CFG });
    expect(r.mode).toBe("cold");
    expect(text(r.layout.layoutBytes)).toBe(text(read("oracles-igl/layouts/F01.layout.json")));
    expect(r.report.mode).toBe("cold");
    expect(r.report.previous).toEqual({ present: false });
    expect(r.report.nodes.map((n) => n.status)).toEqual(["added", "added"]);
    expect(Object.keys(r.report.nodes[0]!).sort()).toEqual(["ref", "status", "x", "y"]);
    expect(r.report.aggregate).toEqual({ added: 2, common: 0, max_dist: 0, max_offset: 0, mean_dist: 0, moved: 0, moved_ppm: 0, removed: 0, rms_dist: 0, sum_dist: "0", sum_dist_sq: "0" });
    expect(r.report.transform_hint).toEqual({ present: false });
    expect(r.report.placement).toEqual({ present: false });
    expect(r.report.extent.previous).toEqual({ present: false });
    expect(r.report.extent.next).toMatchObject({ present: true, min_x: 173961, max_x: 593147 });
    expect(r.report.edges).toMatchObject({ common: 0, removed: [] });
    expect(r.report.edges.added.length).toBe(1);
    expect(r.stats).toEqual({ work: 4 + 6, waves: 0, placed: 0 }); // C1 + C4 only
  });
  it("TC02 an empty previous scene to a non-empty one is cold", async () => {
    const prev = await drawing({ tag: "tc02", nodes: [] }, {});
    const r = await computeStableLayout(prev, o1(), { placement: PLACE_56, coldStart: CORE_CFG });
    expect(r.mode).toBe("cold");
    expect(r.layout.layoutSha256).toBe((await sha(read("oracles-igl/layouts/F01.layout.json"))));
    expect(r.report.previous).toMatchObject({ present: true });
    expect(r.report.extent.previous).toEqual({ present: false });
  });
  it("TC03 total replacement (no kept node) is cold: all previous nodes removed, all new nodes added", async () => {
    const prev = await prevDrawing();
    const r = await computeStableLayout(prev, o1(), { placement: PLACE_56, coldStart: CORE_CFG });
    expect(r.mode).toBe("cold");
    expect(r.report.aggregate).toMatchObject({ added: 2, removed: 4, common: 0 });
    expect(r.report.edges.removed.length).toBe(3);
    expect(r.report.extent.previous).toMatchObject({ present: true, max_x: 3000 });
    expect(r.stats.work).toBe((4 + 2 + 2 * (3 + 1) + 0) + 3 * (4 + 2));
  });
  it("TC04 a cold start is needed and no coldStart is given: COLD_START_REQUIRED", async () => {
    expect(await cr(() => computeStableLayout(null, o1(), {}))).toBe("INVALID_REQUEST/COLD_START_REQUIRED");
    expect(await cr(async () => computeStableLayout(await prevDrawing(), o1(), { placement: PLACE_56 }))).toBe("INVALID_REQUEST/COLD_START_REQUIRED");
  });
  it("TC05 a scene FORCE refuses (i:7 and s:7 of one type): the LayoutError passes through, no FIXED fallback", async () => {
    const twin = await sceneBytes({ tag: "tc05", nodes: ["i:7", "s:7"] });
    let e: unknown;
    try { await computeStableLayout(null, twin, { coldStart: CORE_CFG }); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(LayoutError);
    expect(e).toMatchObject({ code: "UNSUPPORTED_SCENE", reason: "AMBIGUOUS_ORDER_KEY" });
  });
  it("TC06 placement is required whenever previous is non-null, before any byte is read; an unused coldStart is ignored", async () => {
    const prev = await prevDrawing();
    const garbage = new Uint8Array([1, 2, 3]);
    expect(await stableError(() => computeStableLayout(prev, garbage, {}))).toBe("INVALID_REQUEST/PLACEMENT_REQUIRED");
    expect(await stableError(() => computeStableLayout(prev, o1(), { coldStart: CORE_CFG }))).toBe("INVALID_REQUEST/PLACEMENT_REQUIRED");
    expect(await stableError(async () => computeStableLayout(prev, await sceneBytes({ tag: "e", nodes: [] }), { coldStart: CORE_CFG }))).toBe("INVALID_REQUEST/PLACEMENT_REQUIRED");
    // validated whenever supplied, even if the run turns out cold
    expect(await stableError(() => computeStableLayout(null, o1(), { placement: { radius: 0, min_separation: 1, max_rings: 1 }, coldStart: CORE_CFG }))).toBe("INVALID_REQUEST/INVALID_PLACEMENT/INVALID_VALUE");
    // unused (even invalid) coldStart is ignored on the incremental path
    const r = await computeStableLayout(prev, await sceneBytes(SPEC_A), { placement: PLACE_56, coldStart: { nonsense: true } as never });
    expect(r.mode).toBe("incremental");
    // a supplied placement is ignored (and not recorded) on a cold run
    expect((await computeStableLayout(prev, o1(), { placement: PLACE_56, coldStart: CORE_CFG })).report.placement).toEqual({ present: false });
  });
  it("TC07 relax, groups, viewport are UNSUPPORTED_OPTION; an unknown key is UNKNOWN_KEY", async () => {
    const c = await sceneBytes(SPEC_A);
    const prev = await prevDrawing();
    for (const k of ["relax", "groups", "viewport"]) expect(await stableError(() => computeStableLayout(prev, c, { placement: PLACE_56, [k]: {} } as never))).toBe(`INVALID_REQUEST/UNSUPPORTED_OPTION/${k}`);
    expect(await cr(() => computeStableLayout(prev, c, { placement: PLACE_56, relaxx: 1 } as never))).toBe("INVALID_REQUEST/UNKNOWN_KEY");
    expect(await cr(() => computeStableLayout(prev, c, { placement: PLACE_56, budget: [] } as never))).toBe("INVALID_REQUEST/INVALID_BUDGET");
    expect(await cr(() => computeStableLayout(prev, c, "x" as never))).toBe("INVALID_REQUEST/SCHEMA");
  });
  it("TC08 previous null and an empty new scene: the empty FIXED layout, no coldStart needed, mode cold", async () => {
    const empty = await sceneBytes({ tag: "tc08", nodes: [] });
    const r = await computeStableLayout(null, empty, {});
    expect(r.mode).toBe("cold");
    expect(text(r.layout.layoutBytes)).toBe(text((await computeFixedLayout(empty, [])).layoutBytes));
    expect(r.report.previous).toEqual({ present: false });
    expect(r.stats.work).toBe(0 + 0 + 0 + 0 + 0); // C1 = 0 + 0 + 2*0 + 0, C4 = 0
  });
  it("FORCE failures and the forceBudget option surface unchanged", async () => {
    await expect(computeStableLayout(null, o1(), { coldStart: CORE_CFG, forceBudget: { maxNodes: 1 } })).rejects.toMatchObject({ code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" });
    await expect(computeStableLayout(null, o1(), { coldStart: { width: 1 } as never })).rejects.toBeInstanceOf(LayoutError);
  }, 20000);
});

describe("limits at admission (section 12.1)", () => {
  it("TL01/TL02/TL03 node and edge counts, TL04 byte caps, TL04b an oversized non-scene is INPUT_BYTES not a scene error", async () => {
    const prev = await prevDrawing();
    const a = await sceneBytes(SPEC_A);
    expect(await cr(() => computeStableLayout(prev, a, { placement: PLACE_56, budget: { maxNodes: 4 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT"); // new scene has 5
    expect(await cr(async () => computeStableLayout(prev, await sceneBytes(SPEC_B), { placement: PLACE_56, budget: { maxNodes: 3 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT"); // previous has 4
    expect(await cr(() => computeStableLayout(prev, a, { placement: PLACE_56, budget: { maxEdges: 3 } }))).toBe("RESOURCE_LIMIT/EDGE_LIMIT");
    expect(await cr(() => computeStableLayout(prev, a, { placement: PLACE_56, budget: { maxSceneBytes: a.length - 1 } }))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    expect(await cr(() => computeStableLayout(prev, a, { placement: PLACE_56, budget: { maxLayoutBytes: prev.layoutBytes.length - 1 } }))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    const junk = new Uint8Array(1000).fill(120);
    expect(await cr(() => computeStableLayout({ sceneBytes: junk, layoutBytes: prev.layoutBytes }, a, { placement: PLACE_56, budget: { maxSceneBytes: 999 } }))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
  });
  it("a non-Uint8Array argument is INVALID_REQUEST/SCHEMA", async () => {
    expect(await cr(() => computeStableLayout(null, [1, 2, 3] as never, {}))).toBe("INVALID_REQUEST/SCHEMA");
  });
  it("TL05/TL06 a node key of exactly 2,048 units passes, 2,049 is refused KEY_LENGTH (the key is JSON.stringify([type, id]))", async () => {
    const mk = (idLen: number): string => `s:${"a".repeat(idLen)}`; // key = ["n","s:aaa"] = 2 + 3 + 3 + 3 + ... computed below
    const base = JSON.stringify(["n", mk(0)]).length; // key units with an empty label
    const prev = await drawing({ tag: "tl5", nodes: ["i:1"] }, { "i:1": [0, 0] });
    const okId = mk(2048 - base), badId = mk(2049 - base);
    expect(JSON.stringify(["n", okId]).length).toBe(2048);
    expect(await cr(async () => computeStableLayout(prev, await sceneBytes({ tag: "tl5b", nodes: ["i:1", okId], edges: [["i:1", "e", okId]] }), { placement: PLACE_56 }))).toBe("no error");
    expect(await cr(async () => computeStableLayout(prev, await sceneBytes({ tag: "tl5c", nodes: ["i:1", badId] }), { placement: PLACE_56 }))).toBe("RESOURCE_LIMIT/KEY_LENGTH");
  });
});
