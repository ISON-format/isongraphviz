import { describe, expect, it } from "vitest";
import { measureDisplacement } from "../src/index.js";
import type { PreviousDrawing } from "../src/types.js";
import { SPEC_B, SPEC_PREV, POS_PREV, cr, drawing, fixedLayout, prevDrawing, sceneBytes, sha, text, type SceneSpec } from "./helpers.js";

const six: SceneSpec = { tag: "tm", nodes: ["i:1", "i:2", "i:3", "i:4", "i:5", "i:6"] };
const zeros = (): Record<string, [number, number]> => Object.fromEntries(["i:1", "i:2", "i:3", "i:4", "i:5", "i:6"].map((k) => [k, [0, 0] as [number, number]]));
async function pair(spec: SceneSpec, a: Record<string, [number, number]>, b: Record<string, [number, number]>): Promise<[PreviousDrawing, PreviousDrawing]> {
  const s = await sceneBytes(spec);
  return [{ sceneBytes: s, layoutBytes: await fixedLayout(s, a) }, { sceneBytes: s, layoutBytes: await fixedLayout(s, b) }];
}

describe("measureDisplacement (section 8)", () => {
  it("TM01 an identical drawing: zero displacement, every kept node dist 0, moved_ppm 0, mode measured", async () => {
    const p = await prevDrawing();
    const r = await measureDisplacement(p, p);
    expect(r.report.mode).toBe("measured");
    expect(r.report.aggregate).toEqual({ added: 0, common: 4, max_dist: 0, max_offset: 0, mean_dist: 0, moved: 0, moved_ppm: 0, removed: 0, rms_dist: 0, sum_dist: "0", sum_dist_sq: "0" });
    expect(r.report.placement).toEqual({ present: false });
    expect(r.report.transform_hint).toEqual({ present: true, dx: 0, dy: 0 });
    expect(r.report.previous).toMatchObject({ present: true, scene_sha256: await sha(p.sceneBytes), layout_sha256: await sha(p.layoutBytes), directed: true });
    expect(r.stats.work).toBe(4 + 4 + 2 * (3 + 3) + 4 + 3 * (4 + 4)); // C1 + C4
    expect(await sha(r.reportBytes)).toBe(r.reportSha256);
    expect(r.report.scale).toBe(1000);
    expect(r.report.igls).toBe("IGLS/1");
    expect(r.report.address_scheme).toBe("igs-addr/1");
  });
  it("TM02 displacements (3,4), (-1,1), (2,0), (-2,2), (0,-3), (1,2) give dist 5, 1, 2, 2, 3, 2 (d2 = 8 kills rounding to nearest)", async () => {
    const d: [number, number][] = [[3, 4], [-1, 1], [2, 0], [-2, 2], [0, -3], [1, 2]];
    const b: Record<string, [number, number]> = {};
    d.forEach((v, i) => { b[`i:${i + 1}`] = v; });
    const [a, c] = await pair(six, zeros(), b);
    const r = (await measureDisplacement(a, c)).report;
    const kept = r.nodes.filter((n) => n.status === "kept");
    expect(kept.map((n) => (n as { dist: number }).dist)).toEqual([5, 1, 2, 2, 3, 2]);
    expect(kept.map((n) => [(n as { dx: number }).dx, (n as { dy: number }).dy])).toEqual(d);
    expect(r.aggregate).toMatchObject({ moved: 6, max_dist: 5, sum_dist: "15", sum_dist_sq: "53", mean_dist: 2, rms_dist: 2, moved_ppm: 1_000_000 });
  });
  it("TM05 mean_dist and rms_dist are floors: sum 5 over 2 -> 2; sum_sq 13 over 2 -> isqrt(6) = 2", async () => {
    const [a, c] = await pair({ tag: "tm5", nodes: ["i:1", "i:2"] }, { "i:1": [0, 0], "i:2": [0, 0] }, { "i:1": [3, 4], "i:2": [0, 0] });
    const r1 = (await measureDisplacement(a, c)).report.aggregate;
    expect(r1).toMatchObject({ sum_dist: "5", sum_dist_sq: "25", mean_dist: 2, rms_dist: 3, moved: 1, moved_ppm: 500_000 }); // floor(25/2) = 12, isqrt = 3
    const [a2, c2] = await pair({ tag: "tm5b", nodes: ["i:1", "i:2"] }, { "i:1": [0, 0], "i:2": [0, 0] }, { "i:1": [2, 3], "i:2": [0, 0] });
    expect((await measureDisplacement(a2, c2)).report.aggregate).toMatchObject({ sum_dist: "3", mean_dist: 1, sum_dist_sq: "13", rms_dist: 2 }); // dist isqrt(13) = 3; floor(13/2) = 6; isqrt = 2
  });
  it("TM06 moved_ppm is a floor: 1 of 3 moved gives 333,333", async () => {
    const [a, c] = await pair({ tag: "tm6", nodes: ["i:1", "i:2", "i:3"] }, { "i:1": [0, 0], "i:2": [0, 0], "i:3": [0, 0] }, { "i:1": [7, 0], "i:2": [0, 0], "i:3": [0, 0] });
    expect((await measureDisplacement(a, c)).report.aggregate.moved_ppm).toBe(333_333);
  });
  it("TM07 transform_hint is the mean translation rounded half up, also for negative sums", async () => {
    const [a, c] = await pair({ tag: "tm7", nodes: ["i:1", "i:2"] }, { "i:1": [0, 0], "i:2": [0, 0] }, { "i:1": [-1, -3], "i:2": [0, 0] });
    expect((await measureDisplacement(a, c)).report.transform_hint).toEqual({ present: true, dx: 0, dy: -1 }); // divRound(-1,2) = 0, divRound(-3,2) = -1
    const [a2, c2] = await pair({ tag: "tm7b", nodes: ["i:1", "i:2", "i:3"] }, { "i:1": [0, 0], "i:2": [0, 0], "i:3": [0, 0] }, { "i:1": [-1, 0], "i:2": [-1, 0], "i:3": [0, 0] });
    expect((await measureDisplacement(a2, c2)).report.transform_hint).toEqual({ present: true, dx: -1, dy: 0 }); // divRound(-2,3) = -1
  });
  it("TM04 sums beyond 2^53 are decimal strings; coordinates 2^50 apart", async () => {
    const lim = 2 ** 50;
    const spec: SceneSpec = { tag: "tm4", nodes: ["i:1", "i:2", "i:3", "i:4"] };
    const a: Record<string, [number, number]> = {}, b: Record<string, [number, number]> = {};
    for (const k of ["i:1", "i:2", "i:3", "i:4"]) { a[k] = [-lim, -lim]; b[k] = [lim, lim]; }
    const [p, q] = await pair(spec, a, b);
    const r = (await measureDisplacement(p, q)).report;
    const dd = 2n ** 51n;
    const sq = (2n * dd * dd);
    let root = 0n; for (let bit = 1n << 60n; bit > 0n; bit >>= 1n) if ((root + bit) ** 2n <= sq) root += bit;
    expect(r.aggregate.sum_dist_sq).toBe((4n * sq).toString());
    expect(r.aggregate.sum_dist).toBe((4n * root).toString());
    expect(BigInt(r.aggregate.sum_dist_sq) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(r.aggregate.max_dist).toBe(Number(root));
    expect(r.nodes[0]).toMatchObject({ dx: 2 ** 51, dy: 2 ** 51, dist: Number(root) });
    expect(r.transform_hint).toEqual({ present: true, dx: 2 ** 51, dy: 2 ** 51 });
  });
  it("TM03 baseline: previous against a different layout of a changed scene; added, removed and kept are reported by typed address", async () => {
    const p = await prevDrawing();
    const nextScene = await sceneBytes(SPEC_B);
    const next = { sceneBytes: nextScene, layoutBytes: await fixedLayout(nextScene, { "i:1": [10, 0], "i:2": [2000, 0], "i:6": [3000, 700] }) };
    const r = (await measureDisplacement(p, next)).report;
    expect(r.nodes.map((n) => `${n.ref.id}:${n.status}`)).toEqual(["i:1:kept", "i:2:kept", "i:3:removed", "i:6:kept"]);
    expect(r.nodes[2]).toEqual({ ref: { id: "i:3", type: "n" }, status: "removed", x_prev: 2000, y_prev: 1500 });
    expect(r.aggregate).toMatchObject({ common: 3, removed: 1, added: 0, moved: 1, max_dist: 10, sum_dist: "10", mean_dist: 3, moved_ppm: 333_333, max_offset: 0 });
    expect(r.edges.removed.length).toBe(2);
  });
  it("added nodes have the bare shape in a measured report", async () => {
    const [p, q] = [await drawing({ tag: "x", nodes: ["i:1"] }, { "i:1": [0, 0] }), await drawing({ tag: "y", nodes: ["i:1", "i:2"] }, { "i:1": [0, 0], "i:2": [5, 6] })];
    const r = (await measureDisplacement(p, q)).report;
    expect(r.nodes[1]).toEqual({ ref: { id: "i:2", type: "n" }, status: "added", x: 5, y: 6 });
  });
  it("TM08 extent over all nodes of each layout; an empty layout has {present: false}", async () => {
    const e = await drawing({ tag: "e", nodes: [] }, {});
    const p = await prevDrawing();
    const r = (await measureDisplacement(e, p)).report;
    expect(r.extent.previous).toEqual({ present: false });
    expect(r.extent.next).toEqual({ present: true, min_x: 0, min_y: 0, max_x: 3000, max_y: 1500 });
    const r2 = (await measureDisplacement(p, e)).report;
    expect(r2.extent.next).toEqual({ present: false });
    expect(r2.extent.previous).toEqual({ present: true, min_x: 0, min_y: 0, max_x: 3000, max_y: 1500 });
  });
  it("TM09 common = 0: every aggregate 0 and transform_hint absent", async () => {
    const e = await drawing({ tag: "e2", nodes: ["i:9"] }, { "i:9": [1, 2] });
    const p = await prevDrawing();
    const r = (await measureDisplacement(p, e)).report;
    expect(r.aggregate).toEqual({ added: 1, common: 0, max_dist: 0, max_offset: 0, mean_dist: 0, moved: 0, moved_ppm: 0, removed: 4, rms_dist: 0, sum_dist: "0", sum_dist_sq: "0" });
    expect(r.transform_hint).toEqual({ present: false });
  });
  it("TM10 a directedness flip is recorded and not an error", async () => {
    const p = await drawing({ tag: "d1", directed: true, nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] }, { "i:1": [0, 0], "i:2": [1, 1] });
    const q = await drawing({ tag: "d2", directed: false, nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] }, { "i:1": [0, 0], "i:2": [1, 1] });
    const r = (await measureDisplacement(p, q)).report;
    expect(r.previous).toMatchObject({ directed: true });
    expect(r.next.directed).toBe(false);
  });
  it("the report bytes are IGL-CJ/1 canonical: compact, UTF-16 key order, no trailing newline, and verify by their own hash", async () => {
    const p = await prevDrawing();
    const r = await measureDisplacement(p, p);
    const t = text(r.reportBytes);
    expect(t.startsWith('{"address_scheme":"igs-addr/1","aggregate":{"added":0,')).toBe(true);
    expect(t.endsWith("}")).toBe(true);
    expect(JSON.parse(t)).toEqual(JSON.parse(JSON.stringify(r.report)));
  });
  it("admission: INVALID_NEXT for a next layout beyond 2^50 and INVALID_PREVIOUS for the previous one (TL20, TP14)", async () => {
    const s = await sceneBytes({ tag: "c", nodes: ["i:1"] });
    const ok = { sceneBytes: s, layoutBytes: await fixedLayout(s, { "i:1": [2 ** 50, 0] }) };
    const bad = { sceneBytes: s, layoutBytes: await fixedLayout(s, { "i:1": [2 ** 50 + 1, 0] }) };
    expect(await cr(() => measureDisplacement(ok, ok))).toBe("no error");
    expect(await cr(() => measureDisplacement(ok, bad))).toBe("INVALID_NEXT/COORDINATE_DOMAIN");
    expect(await cr(() => measureDisplacement(bad, ok))).toBe("INVALID_PREVIOUS/COORDINATE_DOMAIN");
  });
  it("a snapshot or any non-drawing argument is INVALID_REQUEST/SCHEMA; a byte array of the wrong kind too", async () => {
    const p = await prevDrawing();
    expect(await cr(() => measureDisplacement({ sceneSha256: "x", layoutSha256: "y", directed: true, nodes: [], edges: [] } as never, p))).toBe("INVALID_REQUEST/SCHEMA");
    expect(await cr(() => measureDisplacement(p, null as never))).toBe("INVALID_REQUEST/SCHEMA");
    expect(await cr(() => measureDisplacement({ sceneBytes: [1, 2] as never, layoutBytes: p.layoutBytes }, p))).toBe("INVALID_REQUEST/SCHEMA");
  });
  it("work: C1 + C4 with the budget boundary exact", async () => {
    const p = await prevDrawing();
    const w = 4 + 4 + 2 * 6 + 4 + 24;
    expect(await cr(() => measureDisplacement(p, p, { budget: { maxWork: w } }))).toBe("no error");
    expect(await cr(() => measureDisplacement(p, p, { budget: { maxWork: w - 1 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
  void SPEC_PREV; void POS_PREV;
});
