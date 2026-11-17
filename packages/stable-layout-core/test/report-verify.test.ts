/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { describe, expect, it } from "vitest";
import { computeStableLayout, measureDisplacement, verifyDisplacementReport, verifyStable, verifyStableReproducible } from "../src/index.js";
import type { PreviousDrawing } from "../src/types.js";
import { PLACE_56, SPEC_A, SPEC_B, SPEC_C, REPORT_C_TEXT, WORKED, cr, drawing, fixedLayout, prevDrawing, sceneBytes, sha, stableError, text } from "./helpers.js";

const FIX = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(FIX + p));
const enc = (o: unknown): Uint8Array => canonicalBytesSigned(o as CJValue);
const utf = (s: string): Uint8Array => new TextEncoder().encode(s);
const mut = (base: Uint8Array, f: (r: any) => void): Uint8Array => { const r = JSON.parse(text(base)); f(r); return enc(r); };
const rec = (r: any, id: string): any => r.nodes.find((n: any) => n.ref.id === id);
const vr = (b: Uint8Array, o?: any) => cr(() => verifyDisplacementReport(b, o));

interface Ctx { prev: PreviousDrawing; scene: Uint8Array; layout: Uint8Array; report: Uint8Array }
async function caseOf(spec: Parameters<typeof sceneBytes>[0], prev?: PreviousDrawing): Promise<Ctx> {
  const p = prev ?? (await prevDrawing());
  const scene = await sceneBytes(spec);
  const r = await computeStableLayout(p, scene, { placement: PLACE_56 });
  return { prev: p, scene, layout: r.layout.layoutBytes, report: r.reportBytes };
}
const stable = (c: Ctx, report = c.report, o?: any) => cr(() => verifyStable(c.prev, c.scene, c.layout, report, o));
const repro = (c: Ctx, report = c.report, o?: any) => cr(() => verifyStableReproducible(c.prev, c.scene, c.layout, report, o));

describe("TR01 a good incremental report is accepted by all three verifiers", () => {
  it("verifyDisplacementReport returns the parsed report and its hash", async () => {
    const c = await caseOf(SPEC_C);
    expect(text(c.report)).toBe(REPORT_C_TEXT);
    const v = await verifyDisplacementReport(c.report);
    expect(v.reportSha256).toBe(WORKED.C.report);
    expect(v.report.mode).toBe("incremental");
    expect(v.report.nodes.length).toBe(6);
  });
  it("TR01s verifyStable accepts it and returns the derived layout hash", async () => {
    const c = await caseOf(SPEC_C);
    const v = await verifyStable(c.prev, c.scene, c.layout, c.report);
    expect(v).toMatchObject({ reportSha256: WORKED.C.report, layoutSha256: WORKED.C.layout });
  });
  it("TR01r verifyStableReproducible returns \"reproduced\"; the cases A and B too", async () => {
    for (const [spec, w] of [[SPEC_C, WORKED.C], [SPEC_A, WORKED.A], [SPEC_B, WORKED.B]] as const) {
      const c = await caseOf(spec);
      expect(await verifyStableReproducible(c.prev, c.scene, c.layout, c.report)).toBe("reproduced");
      expect(await sha(c.report)).toBe(w.report);
    }
  });
  it("the meter: verifyDisplacementReport V1 = 30; verifyStable 74; verifyStableReproducible 179 (section 12.3, Case C)", async () => {
    const c = await caseOf(SPEC_C);
    expect(await vr(c.report, { budget: { maxWork: 30 } })).toBe("no error");
    expect(await vr(c.report, { budget: { maxWork: 29 } })).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(await stable(c, c.report, { budget: { maxWork: 74 } })).toBe("no error");
    expect(await stable(c, c.report, { budget: { maxWork: 73 } })).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(await repro(c, c.report, { budget: { maxWork: 179 } })).toBe("no error");
    expect(await repro(c, c.report, { budget: { maxWork: 178 } })).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
});

describe("T-REPORT: standalone verifier, each row violates exactly one rule", () => {
  let C: Ctx, B: Ctx, A: Ctx;
  const setup = async () => { C ??= await caseOf(SPEC_C); B ??= await caseOf(SPEC_B); A ??= await caseOf(SPEC_A); };
  it("TR02 extra whitespace: NON_CANONICAL", async () => {
    await setup();
    expect(await vr(utf(JSON.stringify(JSON.parse(text(C.report)), null, 1)))).toBe("INVALID_REPORT/NON_CANONICAL");
    expect(await vr(utf(text(C.report) + "\n"))).toBe("INVALID_REPORT/NON_CANONICAL");
  });
  it("TR03 unknown key: UNKNOWN_FIELD; TR04 groups, TR05 relax, TR06 viewport, TR07 report_sha256: RESERVED_FIELD", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { r.zzz = 1; }))).toBe("INVALID_REPORT/UNKNOWN_FIELD");
    expect(await vr(mut(C.report, (r) => { r["x-extra"] = 1; }))).toBe("INVALID_REPORT/UNKNOWN_FIELD"); // no x- keys in rev 1
    for (const k of ["groups", "relax", "viewport", "report_sha256"]) expect(await vr(mut(C.report, (r) => { r[k] = 1; }))).toBe("INVALID_REPORT/RESERVED_FIELD");
  });
  it("TR08 wrong igls and a wrong address_scheme: UNSUPPORTED_VERSION", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { r.igls = "IGLS/2"; }))).toBe("INVALID_REPORT/UNSUPPORTED_VERSION");
    expect(await vr(mut(C.report, (r) => { r.address_scheme = "igs-addr/2"; }))).toBe("INVALID_REPORT/UNSUPPORTED_VERSION");
  });
  it("TR09 sum_dist altered: INCONSISTENT_AGGREGATE (and every other aggregate, both extents, the transform hint)", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { r.aggregate.sum_dist = "1"; }))).toBe("INVALID_REPORT/INCONSISTENT_AGGREGATE");
    for (const k of ["added", "common", "max_dist", "max_offset", "mean_dist", "moved", "moved_ppm", "removed", "rms_dist"]) {
      expect(await vr(mut(C.report, (r) => { r.aggregate[k] += 1; })), k).toBe("INVALID_REPORT/INCONSISTENT_AGGREGATE");
    }
    expect(await vr(mut(C.report, (r) => { r.aggregate.sum_dist_sq = "9"; }))).toBe("INVALID_REPORT/INCONSISTENT_AGGREGATE");
    expect(await vr(mut(C.report, (r) => { r.extent.next.min_x += 1; }))).toBe("INVALID_REPORT/INCONSISTENT_AGGREGATE");
    expect(await vr(mut(C.report, (r) => { r.extent.previous.max_y += 1; }))).toBe("INVALID_REPORT/INCONSISTENT_AGGREGATE");
    expect(await vr(mut(C.report, (r) => { r.transform_hint.dx = 1; }))).toBe("INVALID_REPORT/INCONSISTENT_AGGREGATE");
    expect(await vr(mut(C.report, (r) => { r.transform_hint = { present: false }; }))).toBe("INVALID_REPORT/INCONSISTENT_AGGREGATE");
  });
  it("TR10 dist is not isqrt(dx^2 + dy^2): INCONSISTENT_RECORD", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").dist = 1; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").dx = 1; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD"); // dx != x - x_prev
  });
  it("TR11 duplicate ref: DUPLICATE_NODE_REF; TR12 unsorted nodes: NON_CANONICAL_ORDER; edges likewise", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { r.nodes.splice(2, 0, JSON.parse(JSON.stringify(r.nodes[1]))); }))).toBe("INVALID_REPORT/DUPLICATE_NODE_REF");
    expect(await vr(mut(C.report, (r) => { [r.nodes[1], r.nodes[2]] = [r.nodes[2], r.nodes[1]]; }))).toBe("INVALID_REPORT/NON_CANONICAL_ORDER");
    expect(await vr(mut(C.report, (r) => { r.edges.added.push(JSON.parse(JSON.stringify(r.edges.added[2]))); }))).toBe("INVALID_REPORT/DUPLICATE_EDGE_REF");
    expect(await vr(mut(C.report, (r) => { r.edges.added.reverse(); }))).toBe("INVALID_REPORT/NON_CANONICAL_ORDER");
  });
  it("TR13 a kept record missing x_prev: MISSING_FIELD; an added record with an extra key is UNKNOWN_FIELD", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { delete rec(r, "i:2").x_prev; }))).toBe("INVALID_REPORT/MISSING_FIELD");
    expect(await vr(mut(C.report, (r) => { delete r.scale; }))).toBe("INVALID_REPORT/MISSING_FIELD");
    expect(await vr(mut(C.report, (r) => { delete rec(r, "i:4").wave; }))).toBe("INVALID_REPORT/MISSING_FIELD");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:1").dx = 0; }))).toBe("INVALID_REPORT/UNKNOWN_FIELD");
  });
  it("TR14 a cold report with anchor fields on an added record: UNKNOWN_FIELD", async () => {
    const cold = await computeStableLayout(null, read("oracles/o1-basic.scene.json"), { coldStart: { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 } });
    expect(await vr(cold.reportBytes)).toBe("no error");
    expect(await vr(mut(cold.reportBytes, (r) => { Object.assign(r.nodes[0], { anchor_kind: "seed", anchor_x: 0, anchor_y: 0, direction: 0, offset: 0, ring: 0, wave: 0 }); }))).toBe("INVALID_REPORT/UNKNOWN_FIELD");
  });
  it("TR15 an incremental kept node that moved: KEPT_MOVED (the report carries the formula's own values for everything else)", async () => {
    await setup();
    const moved = mut(C.report, (r) => {
      const k = rec(r, "i:2"); k.x = 2005; k.dx = 5; k.dist = 5;
      Object.assign(r.aggregate, { moved: 1, max_dist: 5, sum_dist: "5", sum_dist_sq: "25", mean_dist: 1, rms_dist: 2, moved_ppm: 333333 });
      r.transform_hint = { present: true, dx: 2, dy: 0 }; // divRound(5, 3) = 2
    });
    expect(await vr(moved)).toBe("INVALID_REPORT/KEPT_MOVED");
    // and the same report in mode "measured" is a valid report (placement absent, added bare) - Law 4 is a property of incremental reports
  });
  it("TR16 placement arithmetic wrong: INCONSISTENT_RECORD (position, offset)", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").x = 1077; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").offset = 999; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").direction = 6; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    expect(await vr(mut(C.report, (r) => { r.placement.radius = 1001; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
  });
  it("TR17 a leading-zero decimal string: INVALID_VALUE; TR18 a float coordinate: INVALID_VALUE", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { r.aggregate.sum_dist = "00"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { r.aggregate.sum_dist_sq = "-1"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { r.aggregate.sum_dist = 0; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(utf(text(C.report).replace('"x":2000', '"x":2000.5')))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").x = "2000"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(utf(text(C.report).replace('"scale":1000', '"scale":1001')))).toBe("INVALID_REPORT/INVALID_VALUE");
  });
  it("TR23 ring >= max_rings and TR24 direction 16: INVALID_VALUE (ring only bounded by max_rings when placement is present)", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").ring = 4; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").direction = 16; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").ring = -1; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").ring = 3; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD"); // in range, wrong arithmetic
  });
  it("TR25a placement.present with no added record and TR25b placement absent with incremental added records: INCONSISTENT_RECORD", async () => {
    await setup();
    expect(await vr(mut(B.report, (r) => { r.placement = { present: true, algorithm: "igl-stable-place/1", max_rings: 4, min_separation: 800, radius: 1000 }; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    expect(await vr(mut(C.report, (r) => { r.placement = { present: false }; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    // a ring beyond any max_rings with placement absent is judged by the placement rule, not by the ring range
    expect(await vr(mut(C.report, (r) => { r.placement = { present: false }; rec(r, "i:4").ring = 500; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
  });
  it("TR27 a wrong seed anchor: INCONSISTENT_RECORD; TR31 a seed record with no kept record: INCONSISTENT_RECORD", async () => {
    const seedCtx = await caseOf({ tag: "seed", nodes: ["i:1", "i:2", "i:3", "i:6", "i:9"], edges: [["i:1", "e", "i:2"], ["i:2", "e", "i:3"], ["i:3", "e", "i:6"]] });
    expect(await vr(seedCtx.report)).toBe("no error");
    const seed = rec(JSON.parse(text(seedCtx.report)), "i:9");
    expect(seed).toMatchObject({ anchor_kind: "seed", anchor_x: 4000, anchor_y: 550, x: 5000, y: 550 }); // maxX 3000 + R, divRound(2200, 4) = 550
    expect(await vr(mut(seedCtx.report, (r) => { const s = rec(r, "i:9"); s.anchor_x += 1; s.x += 1; r.extent.next.max_x += 1; }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    expect(await vr(mut(seedCtx.report, (r) => { const s = rec(r, "i:9"); s.anchor_y += 1; s.y += 1; r.extent.next.max_y = Math.max(r.extent.next.max_y, s.y); }))).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
    const lone = mut(seedCtx.report, (r) => {
      r.nodes = [rec(r, "i:9")];
      r.aggregate = { added: 1, common: 0, max_dist: 0, max_offset: 1000, mean_dist: 0, moved: 0, moved_ppm: 0, removed: 0, rms_dist: 0, sum_dist: "0", sum_dist_sq: "0" };
      r.extent = { next: { present: true, min_x: 5000, min_y: 550, max_x: 5000, max_y: 550 }, previous: { present: false } };
      r.transform_hint = { present: false };
    });
    expect(await vr(lone)).toBe("INVALID_REPORT/INCONSISTENT_RECORD");
  });
  it("TR28 a report edge with ord \"1\": INVALID_VALUE", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { r.edges.added[0].ord = "1"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { r.edges.removed[0].ord = "1"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
  });
  it("TR30 a record coordinate of 2^50 + 1: INVALID_VALUE; 2^50 itself is in the domain", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").x = 2 ** 50 + 1; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:1").x_prev = -(2 ** 50) - 1; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { r.extent.next.max_x = 2 ** 50 + 1; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").dx = 2 ** 51 + 1; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").dist = 2 ** 52; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").anchor_x = 2 ** 50 + 2 ** 26 + 1; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:4").anchor_x = 2 ** 50 + 2 ** 26; }))).not.toBe("INVALID_REPORT/INVALID_VALUE");
  });
  it("structure: not JSON, BOM, invalid UTF-8, non-object, hash shape, present shapes", async () => {
    await setup();
    expect(await vr(utf("not json"))).toBe("INVALID_REPORT/SCHEMA");
    expect(await vr(utf("[]"))).toBe("INVALID_REPORT/SCHEMA");
    expect(await vr(new Uint8Array([0xef, 0xbb, 0xbf, ...C.report]))).toBe("INVALID_REPORT/SCHEMA");
    expect(await vr(new Uint8Array([0xff, 0xfe]))).toBe("INVALID_REPORT/SCHEMA");
    expect(await vr(mut(C.report, (r) => { r.next.scene_sha256 = "ABC"; }))).toBe("INVALID_REPORT/INVALID_HASH");
    expect(await vr(mut(C.report, (r) => { r.previous.layout_sha256 = WORKED.C.layout.toUpperCase(); }))).toBe("INVALID_REPORT/INVALID_HASH");
    expect(await vr(mut(C.report, (r) => { r.previous = { present: false, scene_sha256: "x" }; }))).toBe("INVALID_REPORT/UNKNOWN_FIELD");
    expect(await vr(mut(C.report, (r) => { r.transform_hint = { present: true }; }))).toBe("INVALID_REPORT/MISSING_FIELD");
    expect(await vr(mut(C.report, (r) => { r.mode = "weird"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").status = "moved"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").ref.id = "x:2"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
    expect(await vr(mut(C.report, (r) => { rec(r, "i:2").ref.type = "a b"; }))).toBe("INVALID_REPORT/INVALID_VALUE");
  });
  it("closed-object check order: top level first, then nested in key order; within one object reserved, unknown, missing", async () => {
    await setup();
    expect(await vr(mut(C.report, (r) => { delete r.scale; r.aggregate.zzz = 1; }))).toBe("INVALID_REPORT/MISSING_FIELD"); // top level wins over the nested unknown key
    expect(await vr(mut(C.report, (r) => { delete r.scale; r.zzz = 1; r.viewport = 1; }))).toBe("INVALID_REPORT/RESERVED_FIELD");
    expect(await vr(mut(C.report, (r) => { delete r.scale; r.zzz = 1; }))).toBe("INVALID_REPORT/UNKNOWN_FIELD"); // unknown before missing
    // nested objects in canonical key order: aggregate (a) comes before nodes (n)
    expect(await vr(mut(C.report, (r) => { delete rec(r, "i:2").dx; r.aggregate.zzz = 1; }))).toBe("INVALID_REPORT/UNKNOWN_FIELD");
    expect(await vr(mut(C.report, (r) => { delete r.aggregate.moved; rec(r, "i:2").zzz = 1; }))).toBe("INVALID_REPORT/MISSING_FIELD"); // aggregate before nodes
  });
});

describe("limits of the report verifier (section 12.1, 12.2)", () => {
  it("TL17 a report over maxReportBytes is refused before parsing (not even valid JSON)", async () => {
    expect(await vr(new Uint8Array(1001).fill(0x7b), { budget: { maxReportBytes: 1000 } })).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    expect(await vr(new Uint8Array(1000).fill(0x7b), { budget: { maxReportBytes: 1000 } })).toBe("INVALID_REPORT/SCHEMA");
  });
  it("TL18 records > 2 * maxNodes: NODE_LIMIT; edge entries > 2 * maxEdges: EDGE_LIMIT (counts come after the parse)", async () => {
    const c = await caseOf(SPEC_C);
    expect(await vr(c.report, { budget: { maxNodes: 2 } })).toBe("RESOURCE_LIMIT/NODE_LIMIT"); // 6 records > 4
    expect(await vr(c.report, { budget: { maxNodes: 3 } })).toBe("no error");
    expect(await vr(c.report, { budget: { maxEdges: 1 } })).toBe("RESOURCE_LIMIT/EDGE_LIMIT"); // 4 entries > 2
    expect(await vr(c.report, { budget: { maxEdges: 2 } })).toBe("no error");
    expect(await vr(utf("not json"), { budget: { maxNodes: 2 } })).toBe("INVALID_REPORT/SCHEMA"); // the parse comes first
  });
  it("TL19 a report that decodes but exceeds maxWork under V1 (charged before the rest of the schema step)", async () => {
    const c = await caseOf(SPEC_C);
    expect(await vr(mut(c.report, (r) => { r.zzz = 1; }), { budget: { maxWork: 29 } })).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
  it("TL21 report edge endpoints and relations: 2,048 units pass, 2,049 are KEY_LENGTH, raised before any key is built", async () => {
    const c = await caseOf(SPEC_C);
    const longId = (units: number): string => { const base = JSON.stringify(["n", "s:"]).length; return `s:${"a".repeat(units - base)}`; };
    const withSrc = (id: string) => mut(c.report, (r) => { r.edges.added[2].src.id = id; });
    expect(JSON.stringify(["n", longId(2048)]).length).toBe(2048);
    expect(await vr(withSrc(longId(2048)))).toBe("no error");
    expect(await vr(withSrc(longId(2049)))).toBe("RESOURCE_LIMIT/KEY_LENGTH");
    expect(await vr(mut(c.report, (r) => { r.edges.removed[0].tgt.id = longId(2049); }))).toBe("RESOURCE_LIMIT/KEY_LENGTH");
    const rel = (k: number): string => "\u0001".repeat(340) + "x".repeat(k);
    expect(JSON.stringify(rel(6)).length).toBe(2048);
    expect(await vr(mut(c.report, (r) => { r.edges.removed[0].rel = rel(6); }))).toBe("no error");
    expect(await vr(mut(c.report, (r) => { r.edges.added[0].rel = rel(7); }))).toBe("RESOURCE_LIMIT/KEY_LENGTH");
    // node records as well
    expect(await vr(mut(c.report, (r) => { rec(r, "i:1").ref.id = longId(2049); }))).toBe("RESOURCE_LIMIT/KEY_LENGTH");
  });
});

describe("verifyStable: the report describes this pair of drawings (section 9.4)", () => {
  it("TR19 a report of a different layout/scene: REPORT_MISMATCH/HASH", async () => {
    const c = await caseOf(SPEC_C), a = await caseOf(SPEC_A);
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, a.report))).toBe("INVALID_REPORT/REPORT_MISMATCH/HASH");
    expect(await stable(c, mut(c.report, (r) => { r.next.layout_sha256 = "0".repeat(64); }))).toBe("INVALID_REPORT/REPORT_MISMATCH");
    expect(await stable(c, mut(c.report, (r) => { r.next.directed = false; }))).toBe("INVALID_REPORT/REPORT_MISMATCH");
    expect(await stable(c, mut(c.report, (r) => { r.previous.scene_sha256 = "0".repeat(64); }))).toBe("INVALID_REPORT/REPORT_MISMATCH");
    expect(await stable(c, mut(c.report, (r) => { r.previous.directed = false; }))).toBe("INVALID_REPORT/REPORT_MISMATCH");
  });
  it("previous may be null only for a report whose previous is {present: false}; any mismatch is REPORT_MISMATCH/HASH", async () => {
    const c = await caseOf(SPEC_C);
    expect(await stableError(() => verifyStable(null, c.scene, c.layout, c.report))).toBe("INVALID_REPORT/REPORT_MISMATCH/HASH");
    const cold = await computeStableLayout(null, read("oracles/o1-basic.scene.json"), { coldStart: { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 } });
    expect(await verifyStable(null, read("oracles/o1-basic.scene.json"), cold.layout.layoutBytes, cold.reportBytes)).toMatchObject({ layoutSha256: cold.layout.layoutSha256 });
    expect(await stableError(() => verifyStable(await_prev(), read("oracles/o1-basic.scene.json"), cold.layout.layoutBytes, cold.reportBytes))).toBe("INVALID_REPORT/REPORT_MISMATCH/HASH");
  });
  it("TR20 a self-consistent report whose added node sits on another admissible candidate: REPORT_MISMATCH/POSITION", async () => {
    const c = await caseOf(SPEC_C);
    const other = mut(c.report, (r) => { const n = rec(r, "i:4"); Object.assign(n, { direction: 8, x: 1000, y: 750 }); r.extent.next.min_x = 1000; });
    expect(await vr(other)).toBe("no error");
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, other))).toBe("INVALID_REPORT/REPORT_MISMATCH/POSITION");
    expect(await stable(c, mut(c.report, (r) => { rec(r, "i:1").x_prev = 5; r.extent.previous.min_x = 5; }))).toBe("INVALID_REPORT/REPORT_MISMATCH");
  });
  it("NODE_SET: the records are the union of both scenes; STATUS: each status equals the typed-address diff", async () => {
    const c = await caseOf(SPEC_C);
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, mut(c.report, (r) => { r.nodes = r.nodes.filter((n: any) => n.ref.id !== "i:6"); r.aggregate.common -= 1; r.extent.previous.max_x = 2000; r.extent.next.max_x = 2000; })))).toBe("INVALID_REPORT/REPORT_MISMATCH/NODE_SET");
    // a kept node reported as removed (status taken from the report instead of the diff would accept this)
    const asRemoved = mut(c.report, (r) => {
      const i = r.nodes.findIndex((n: any) => n.ref.id === "i:6");
      r.nodes[i] = { ref: { id: "i:6", type: "n" }, status: "removed", x_prev: 3000, y_prev: 700 };
      Object.assign(r.aggregate, { common: 2, removed: 2 });
      r.transform_hint = { present: true, dx: 0, dy: 0 };
      r.extent.next.max_x = 2000;
    });
    expect(await vr(asRemoved)).toBe("no error");
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, asRemoved))).toBe("INVALID_REPORT/REPORT_MISMATCH/STATUS");
  });
  it("NODE_SET compares the references, not only the count (a record naming a node of neither scene)", async () => {
    const c = await caseOf(SPEC_C);
    const renamed = mut(c.report, (r) => { rec(r, "i:6").ref.id = "i:7"; });
    expect(await vr(renamed)).toBe("no error");
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, renamed))).toBe("INVALID_REPORT/REPORT_MISMATCH/NODE_SET");
  });
  it("TR29 a measured report listing a moved kept node as a bare added record: REPORT_MISMATCH/STATUS", async () => {
    const spec = { tag: "tr29", nodes: ["i:1", "i:2"] as string[] };
    const s = await sceneBytes(spec);
    const p: PreviousDrawing = { sceneBytes: s, layoutBytes: await fixedLayout(s, { "i:1": [0, 0], "i:2": [100, 0] }) };
    const q: PreviousDrawing = { sceneBytes: s, layoutBytes: await fixedLayout(s, { "i:1": [10, 0], "i:2": [100, 0] }) };
    const m = await measureDisplacement(p, q);
    expect(await verifyStable(p, q.sceneBytes, q.layoutBytes, m.reportBytes)).toMatchObject({ reportSha256: m.reportSha256 });
    const forged = mut(m.reportBytes, (r) => {
      r.nodes[0] = { ref: { id: "i:1", type: "n" }, status: "added", x: 10, y: 0 };
      Object.assign(r.aggregate, { added: 1, common: 1, moved: 0, max_dist: 0, sum_dist: "0", sum_dist_sq: "0", mean_dist: 0, rms_dist: 0, moved_ppm: 0 });
      r.transform_hint = { present: true, dx: 0, dy: 0 };
      r.extent.previous = { present: true, min_x: 100, min_y: 0, max_x: 100, max_y: 0 };
    });
    expect(await vr(forged)).toBe("no error");
    expect(await stableError(() => verifyStable(p, q.sceneBytes, q.layoutBytes, forged))).toBe("INVALID_REPORT/REPORT_MISMATCH/STATUS");
  });
  it("EDGES: the edge lists and the common count equal the recomputed diff", async () => {
    const c = await caseOf(SPEC_C);
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, mut(c.report, (r) => { r.edges.common = 3; })))).toBe("INVALID_REPORT/REPORT_MISMATCH/EDGES");
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, mut(c.report, (r) => { r.edges.added.pop(); })))).toBe("INVALID_REPORT/REPORT_MISMATCH/EDGES");
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, mut(c.report, (r) => { r.edges.removed[0].rel = "f"; })))).toBe("INVALID_REPORT/REPORT_MISMATCH/EDGES");
  });
  it("TR26 a neighbours anchor that is not the centroid (the layout agrees with the false anchor): REPORT_MISMATCH/ANCHOR", async () => {
    const c = await caseOf(SPEC_C);
    const layout = await fixedLayout(c.scene, { "i:2": [2000, 0], "i:3": [2000, 1500], "i:4": [1076, 1134], "i:5": [1076, 2133], "i:6": [3000, 700] });
    const f2 = JSON.parse(text(c.report));
    const n4 = rec(f2, "i:4"); n4.anchor_y = 751; n4.y = 1134;
    f2.next.layout_sha256 = await sha(layout);
    const bytes = enc(f2);
    expect(await vr(bytes)).toBe("no error");
    expect(await stableError(() => verifyStable(c.prev, c.scene, layout, bytes))).toBe("INVALID_REPORT/REPORT_MISMATCH/ANCHOR");
  });
  it("ANCHOR counts distinct neighbours: edges in both directions and under two relations between the same pair are one neighbour", async () => {
    const spec = {
      tag: "dup", nodes: ["i:1", "i:2", "i:3", "i:6", "i:7"],
      edges: [["i:1", "e", "i:2"], ["i:2", "e", "i:3"], ["i:3", "e", "i:6"], ["i:7", "e", "i:1"], ["i:1", "e", "i:7"], ["i:7", "f", "i:1"], ["i:7", "e", "i:6"]] as Parameters<typeof sceneBytes>[0]["edges"],
    };
    const c = await caseOf(spec);
    const n7 = rec(JSON.parse(text(c.report)), "i:7");
    expect(n7).toMatchObject({ anchor_kind: "neighbours", anchor_x: 1500, anchor_y: 350 }); // centroid of (0,0) and (3000,700), each counted once
    expect((await verifyStable(c.prev, c.scene, c.layout, c.report)).reportSha256).toBe(await sha(c.report));
    expect(await verifyStableReproducible(c.prev, c.scene, c.layout, c.report)).toBe("reproduced");
  });
  it("WAVE: a neighbours node needs a kept or earlier-wave neighbour, a seed none", async () => {
    const c = await caseOf(SPEC_C);
    // i:5 is placed in wave 1 off i:4; claim wave 0 instead: its only neighbour i:4 is no longer earlier
    const f = JSON.parse(text(c.report));
    rec(f, "i:5").wave = 0;
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, enc(f)))).toMatch(/REPORT_MISMATCH\/(ANCHOR|WAVE)/); // ambiguity recorded: no neighbour is earlier, so no centroid exists
    // a seed record for a node that does have a kept neighbour
    const g = JSON.parse(text(c.report));
    const n4 = rec(g, "i:4"); n4.anchor_kind = "seed";
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, enc(g)))).toMatch(/INVALID_REPORT\//);
  });
  it("the checks run each as a complete pass in the order HASH, NODE_SET, STATUS, POSITION, EDGES, ANCHOR, WAVE", async () => {
    const c = await caseOf(SPEC_C);
    // a report with both a POSITION fault (late record) and an EDGES fault: POSITION first
    const both = mut(c.report, (r) => { r.edges.common = 3; rec(r, "i:6").x_prev = 3000; rec(r, "i:2").x = 2000; const n = rec(r, "i:4"); Object.assign(n, { direction: 8, x: 1000, y: 750 }); r.extent.next.min_x = 1000; });
    expect(await stableError(() => verifyStable(c.prev, c.scene, c.layout, both))).toBe("INVALID_REPORT/REPORT_MISMATCH/POSITION");
  });
});

describe("verifyStableReproducible (section 9.5)", () => {
  it("TR21 a cold report where kept >= 1: NOT_REPRODUCED/MODE", async () => {
    const c = await caseOf(SPEC_C);
    const cold = mut(c.report, (r) => {
      r.mode = "cold"; r.placement = { present: false }; r.aggregate.max_offset = 0;
      for (const n of r.nodes) if (n.status === "added") for (const k of ["anchor_kind", "anchor_x", "anchor_y", "direction", "offset", "ring", "wave"]) delete n[k];
    });
    expect(await vr(cold)).toBe("no error");
    expect(await stable(c, cold)).toBe("no error");
    expect(await stableError(() => verifyStableReproducible(c.prev, c.scene, c.layout, cold))).toBe("INVALID_REPORT/NOT_REPRODUCED/MODE");
  });
  it("TR22 a cold report for an empty new scene with a previous drawing (derived mode incremental): NOT_REPRODUCED/MODE", async () => {
    const p = await prevDrawing();
    const empty = await sceneBytes({ tag: "tr22", nodes: [] });
    const r0 = await computeStableLayout(p, empty, { placement: PLACE_56 });
    const c: Ctx = { prev: p, scene: empty, layout: r0.layout.layoutBytes, report: r0.reportBytes };
    expect(await verifyStableReproducible(c.prev, c.scene, c.layout, c.report)).toBe("reproduced");
    const cold = mut(r0.reportBytes, (r) => { r.mode = "cold"; });
    expect(await stableError(() => verifyStableReproducible(c.prev, c.scene, c.layout, cold))).toBe("INVALID_REPORT/NOT_REPRODUCED/MODE");
  });
  it("a measured report is not reproducible from these inputs (MODE) but is verified by verifyStable", async () => {
    const p = await prevDrawing();
    const q = await drawing(SPEC_B, { "i:1": [0, 0], "i:2": [2000, 0], "i:6": [3001, 700] });
    const m = await measureDisplacement(p, q);
    expect(await verifyStable(p, q.sceneBytes, q.layoutBytes, m.reportBytes)).toMatchObject({ reportSha256: m.reportSha256 });
    expect(await stableError(() => verifyStableReproducible(p, q.sceneBytes, q.layoutBytes, m.reportBytes))).toBe("INVALID_REPORT/NOT_REPRODUCED/MODE");
  });
  it("a report that differs from the recomputed one only in a field no other check covers (a wave number) is NOT_REPRODUCED/BYTES with identical layout bytes", async () => {
    const c = await caseOf(SPEC_C);
    const other = mut(c.report, (r) => { rec(r, "i:5").wave = 2; });
    expect(await stable(c, other)).toBe("no error"); // an earlier neighbour (i:4, wave 0) still exists
    expect(await stableError(() => verifyStableReproducible(c.prev, c.scene, c.layout, other))).toBe("INVALID_REPORT/NOT_REPRODUCED/BYTES");
  });
  it("M-7 a recomputation that cannot produce the artifact (NO_FREE_SLOT under the recorded placement) is NOT_REPRODUCED/BYTES; a budget refusal is still a RESOURCE_LIMIT", async () => {
    const ring0 = [[1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000], [-383, 924], [-707, 707], [-924, 383], [-1000, 0], [-924, -383], [-707, -707], [-383, -924], [0, -1000], [383, -924], [707, -707], [924, -383]];
    const ids = ["i:1", ...ring0.map((_, k) => `i:${k + 2}`)];
    const pos: Record<string, [number, number]> = { "i:1": [0, 0] };
    ring0.forEach((p, k) => { pos[`i:${k + 2}`] = [p[0]!, p[1]!]; });
    const prev = await drawing({ tag: "m7p", nodes: ids }, pos);
    const scene = await sceneBytes({ tag: "m7n", nodes: [...ids, "i:99"], edges: [["i:1", "e", "i:99"]] });
    const r = await computeStableLayout(prev, scene, { placement: PLACE_56 });
    const forged = mut(r.reportBytes, (x) => { x.placement.min_separation = 100000; });
    expect(await vr(forged)).toBe("no error");
    expect(await cr(() => verifyStable(prev, scene, r.layout.layoutBytes, forged))).toBe("no error");
    expect(await stableError(() => verifyStableReproducible(prev, scene, r.layout.layoutBytes, forged))).toBe("INVALID_REPORT/NOT_REPRODUCED/BYTES");
    expect(await cr(() => verifyStableReproducible(prev, scene, r.layout.layoutBytes, r.reportBytes, { budget: { maxWork: 100 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
  it("a self-consistent report of another placement outcome passes verifyStable but is NOT_REPRODUCED/BYTES", async () => {
    const c = await caseOf(SPEC_C);
    const other = mut(c.report, (r) => { r.placement.min_separation = 100; });
    expect(await stable(c, other)).toBe("no error");
    expect(await stableError(() => verifyStableReproducible(c.prev, c.scene, c.layout, other))).toBe("INVALID_REPORT/NOT_REPRODUCED/BYTES");
  });
  it("a layout that is not what V3 would produce (kept positions right, an added node on another candidate) is NOT_REPRODUCED/BYTES", async () => {
    const c = await caseOf(SPEC_C);
    // i:5 on ring 0 direction 0 of its anchor (1076,1133): (2076,1133) is 375 from i:3, so the first admissible candidate is elsewhere
    const l2 = await fixedLayout(c.scene, { "i:2": [2000, 0], "i:3": [2000, 1500], "i:4": [1076, 1133], "i:5": [2076, 1133], "i:6": [3000, 700] });
    const f = JSON.parse(text(c.report));
    Object.assign(rec(f, "i:5"), { direction: 0, x: 2076, y: 1133 });
    f.next.layout_sha256 = await sha(l2);
    f.extent.next.max_y = 1500;
    const bytes = enc(f);
    expect(await vr(bytes)).toBe("no error");
    expect(await cr(() => verifyStable(c.prev, c.scene, l2, bytes))).toBe("no error");
    expect(await stableError(() => verifyStableReproducible(c.prev, c.scene, l2, bytes))).toBe("INVALID_REPORT/NOT_REPRODUCED/BYTES");
  });
  it("cold reports are recomputed with the ForceConfig of the layout's own policy", async () => {
    const o1 = read("oracles/o1-basic.scene.json");
    const cold = await computeStableLayout(null, o1, { coldStart: { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 } });
    expect(await verifyStableReproducible(null, o1, cold.layout.layoutBytes, cold.reportBytes)).toBe("reproduced");
    // a FIXED layout with a cold report of a non-empty scene cannot be reproduced (no ForceConfig exists)
    const fixed = await fixedLayout(o1, { "i:1": [1, 2], "s:ann": [3, 4] });
    const f = JSON.parse(text(cold.reportBytes));
    f.next.layout_sha256 = await sha(fixed);
    f.nodes[0].x = 1; f.nodes[0].y = 2; f.nodes[1].x = 3; f.nodes[1].y = 4;
    f.extent.next = { present: true, min_x: 1, min_y: 2, max_x: 3, max_y: 4 };
    expect(await stableError(() => verifyStableReproducible(null, o1, fixed, enc(f)))).toBe("INVALID_REPORT/NOT_REPRODUCED/BYTES");
  });
  it("the empty scene with previous null: cold, the empty FIXED layout, reproduced", async () => {
    const empty = await sceneBytes({ tag: "e8", nodes: [] });
    const r = await computeStableLayout(null, empty, {});
    expect(await verifyStableReproducible(null, empty, r.layout.layoutBytes, r.reportBytes)).toBe("reproduced");
  });
  it("forceBudget reaches the cold recomputation (a FORCE failure surfaces unchanged)", async () => {
    const o1 = read("oracles/o1-basic.scene.json");
    const cold = await computeStableLayout(null, o1, { coldStart: { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 } });
    await expect(verifyStableReproducible(null, o1, cold.layout.layoutBytes, cold.reportBytes, { forceBudget: { maxNodes: 1 } })).rejects.toMatchObject({ code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" });
  });
});

describe("function-level admission for the verifiers", () => {
  it("options: unknown keys, UNSUPPORTED_OPTION, bad budget; the reserved names are refused everywhere", async () => {
    const c = await caseOf(SPEC_C);
    expect(await cr(() => verifyDisplacementReport(c.report, { relax: 1 } as never))).toBe("INVALID_REQUEST/UNSUPPORTED_OPTION");
    expect(await cr(() => verifyStable(c.prev, c.scene, c.layout, c.report, { zzz: 1 } as never))).toBe("INVALID_REQUEST/UNKNOWN_KEY");
    expect(await cr(() => verifyStableReproducible(c.prev, c.scene, c.layout, c.report, { budget: { maxWork: 0 } }))).toBe("INVALID_REQUEST/INVALID_BUDGET");
    expect(await cr(() => verifyDisplacementReport([1] as never))).toBe("INVALID_REQUEST/SCHEMA");
    expect(await cr(() => verifyStable({ sceneBytes: 1 } as never, c.scene, c.layout, c.report))).toBe("INVALID_REQUEST/SCHEMA");
  });
  it("byte caps are applied before any parse for every input of the binding verifiers", async () => {
    const c = await caseOf(SPEC_C);
    for (const [k, n] of [["maxSceneBytes", c.scene.length - 1], ["maxLayoutBytes", c.layout.length - 1], ["maxReportBytes", c.report.length - 1]] as const) {
      expect(await stable(c, c.report, { budget: { [k]: n } }), k).toBe("RESOURCE_LIMIT/INPUT_BYTES");
      expect(await repro(c, c.report, { budget: { [k]: n } }), k).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    }
  });
  it("a next layout beyond 2^50 is INVALID_NEXT/COORDINATE_DOMAIN", async () => {
    const s = await sceneBytes({ tag: "dom", nodes: ["i:1"] });
    const ok = { sceneBytes: s, layoutBytes: await fixedLayout(s, { "i:1": [0, 0] }) };
    const m = await measureDisplacement(ok, ok);
    const bad = await fixedLayout(s, { "i:1": [2 ** 50 + 1, 0] });
    expect(await cr(() => verifyStable(ok, s, bad, m.reportBytes))).toBe("INVALID_NEXT/COORDINATE_DOMAIN");
  });
});

function await_prev(): PreviousDrawing { return { sceneBytes: read("oracles/o1-basic.scene.json"), layoutBytes: read("oracles-igl/layouts/F01.layout.json") }; }
