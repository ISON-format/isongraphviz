// 28-STABLE-LAYOUT-DESIGN.md sections 9.3 to 9.5: the three verifiers.
import { LayoutError, type ForceConfig } from "isongraph-visualize-layout-core";
import { adjacencyOf, admitArtifacts, admitBytes, isDrawing, readPrevious, type DrawingIdx } from "./admit.js";
import { decideMode, produce } from "./compute.js";
import { chargeC1, diffCore } from "./diff.js";
import { StableLayoutError } from "./errors.js";
import { divRound } from "./intmath.js";
import { Meter, readOptions, resolveBudget, snapshotPlain, type StableBudget } from "./limits.js";
import { RECOMMENDED_PLACEMENT } from "./placement.js";
import { verifyReportBytes } from "./report-verify.js";
import type { DisplacementReport, NodeRecord, PlacementConfig, PreviousDrawing } from "./types.js";

const mismatch = (detail: string, path?: string): StableLayoutError => new StableLayoutError("INVALID_REPORT", "REPORT_MISMATCH", path, detail);
type Opts = { budget?: Partial<StableBudget> };

export async function verifyDisplacementReport(bytes: Uint8Array, options?: Opts): Promise<{ report: DisplacementReport; reportSha256: string }> {
  const o = readOptions(options, ["budget"]);
  const budget = resolveBudget(o.get("budget"));
  const [owned] = admitBytes([{ value: bytes, path: "reportBytes", cap: budget.maxReportBytes }]);
  const meter = new Meter(budget.maxWork);
  const v = await verifyReportBytes(owned!, budget, meter);
  return { report: v.report, reportSha256: v.sha256 };
}

interface StableCtx {
  prev: DrawingIdx | null; next: DrawingIdx; ownedScene: Uint8Array; ownedLayout: Uint8Array; ownedReport: Uint8Array;
  budget: StableBudget; meter: Meter; report: DisplacementReport; reportSha256: string;
  forceBudget: unknown;
}

/** Admission, binding, report verification (V1) and the section 9.4 checks (V2 charged first). */
async function verifyStableCore(previous: PreviousDrawing | null, sceneBytes: Uint8Array, layoutBytes: Uint8Array, reportBytes: Uint8Array, options: unknown, allowForce: boolean): Promise<StableCtx> {
  const o = readOptions(options, allowForce ? ["budget", "forceBudget"] : ["budget"]);
  const budget = resolveBudget(o.get("budget"));
  const forceBudget = snapshotPlain(o.get("forceBudget")); // an owned copy: layout-core reads it after the awaits
  const pd = readPrevious(previous);
  const owned = admitBytes([
    ...(pd === null ? [] : [
      { value: pd.sceneBytes, path: "previous.sceneBytes", cap: budget.maxSceneBytes },
      { value: pd.layoutBytes, path: "previous.layoutBytes", cap: budget.maxLayoutBytes },
    ]),
    { value: sceneBytes, path: "sceneBytes", cap: budget.maxSceneBytes },
    { value: layoutBytes, path: "layoutBytes", cap: budget.maxLayoutBytes },
    { value: reportBytes, path: "reportBytes", cap: budget.maxReportBytes },
  ]);
  const n = owned.length;
  const idx = await admitArtifacts([
    ...(pd === null ? [] : [{ role: "previous" as const, path: "previous", sceneBytes: owned[0]!, layoutBytes: owned[1]! }]),
    { role: "next" as const, path: "next", sceneBytes: owned[n - 3]!, layoutBytes: owned[n - 2]! },
  ], budget);
  const prev = pd === null ? null : idx[0]!;
  const next = idx[idx.length - 1]!;
  if ((prev !== null && !isDrawing(prev)) || !isDrawing(next)) throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH");
  const meter = new Meter(budget.maxWork);
  const v = await verifyReportBytes(owned[n - 1]!, budget, meter); // V1
  const ctx: StableCtx = { prev: prev as DrawingIdx | null, next, ownedScene: owned[n - 3]!, ownedLayout: owned[n - 2]!, ownedReport: owned[n - 1]!, budget, meter, report: v.report, reportSha256: v.sha256, forceBudget };
  bindReport(ctx);
  return ctx;
}

/** Section 9.4. Each check is one complete pass before the next: HASH, NODE_SET, STATUS, POSITION, EDGES, ANCHOR, WAVE. */
function bindReport(c: StableCtx): void {
  const { prev, next, report } = c;
  const core = diffCore(prev, next);
  // V2: C1 plus 2*e_next plus the records
  chargeC1(c.meter, prev, next, core.kept);
  c.meter.charge(2 * next.edges.length + report.nodes.length);

  // HASH
  if (report.next.scene_sha256 !== next.sceneSha256 || report.next.layout_sha256 !== next.layoutSha256 || report.next.directed !== next.directed) throw mismatch("HASH", "$.next");
  if (prev === null) {
    if (report.previous.present) throw mismatch("HASH", "$.previous");
  } else if (!report.previous.present || report.previous.scene_sha256 !== prev.sceneSha256 || report.previous.layout_sha256 !== prev.layoutSha256 || report.previous.directed !== prev.directed) {
    throw mismatch("HASH", "$.previous");
  }
  // NODE_SET
  const rn = report.nodes;
  if (rn.length !== core.union.length) throw mismatch("NODE_SET", "$.nodes");
  core.union.forEach((u, i) => {
    const want = (u.ni >= 0 ? next.nodes[u.ni]! : prev!.nodes[u.pi]!).ref;
    if (rn[i]!.ref.id !== want.id || rn[i]!.ref.type !== want.type) throw mismatch("NODE_SET", `$.nodes[${i}]`);
  });
  // STATUS
  core.union.forEach((u, i) => { if (rn[i]!.status !== u.status) throw mismatch("STATUS", `$.nodes[${i}]`); });
  // POSITION
  core.union.forEach((u, i) => {
    const r = rn[i]!;
    if (r.status !== "removed" && (r.x !== next.x[u.ni] || r.y !== next.y[u.ni])) throw mismatch("POSITION", `$.nodes[${i}]`);
    if (r.status !== "added" && (r.x_prev !== prev!.x[u.pi] || r.y_prev !== prev!.y[u.pi])) throw mismatch("POSITION", `$.nodes[${i}]`);
  });
  // EDGES
  const sameEdge = (a: { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } }, b: typeof a): boolean =>
    a.ord === b.ord && a.rel === b.rel && a.src.id === b.src.id && a.src.type === b.src.type && a.tgt.id === b.tgt.id && a.tgt.type === b.tgt.type;
  const edgesOk = report.edges.common === core.edgesCommon && report.edges.added.length === core.edgesAdded.length && report.edges.removed.length === core.edgesRemoved.length
    && core.edgesAdded.every((e, i) => sameEdge(e.wire, report.edges.added[i]!)) && core.edgesRemoved.every((e, i) => sameEdge(e.wire, report.edges.removed[i]!));
  if (!edgesOk) throw mismatch("EDGES", "$.edges");
  if (report.mode !== "incremental") return;
  // ANCHOR and WAVE: the scene neighbours of each added node that are kept or placed in an earlier wave
  const adj = adjacencyOf(next);
  const waveOfNode = new Map<number, number>(); // new-scene index -> wave (added records) or -1 (kept)
  core.union.forEach((u, i) => {
    const r = rn[i]!;
    if (u.status === "kept") waveOfNode.set(u.ni, -1);
    else if (u.status === "added" && "wave" in r) waveOfNode.set(u.ni, r.wave);
  });
  const earlier = (ni: number, wave: number): number[] => adj[ni]!.filter((v) => { const w = waveOfNode.get(v); return w !== undefined && w < wave; });
  core.union.forEach((u, i) => {
    const r = rn[i]! as NodeRecord;
    if (u.status !== "added" || !("anchor_kind" in r) || r.anchor_kind !== "neighbours") return;
    const N = earlier(u.ni, r.wave);
    if (N.length === 0) return; // no centroid exists; the WAVE pass reports it
    let sx = 0n, sy = 0n;
    for (const v of N) { sx += BigInt(next.x[v]!); sy += BigInt(next.y[v]!); }
    const m = BigInt(N.length);
    if (BigInt(r.anchor_x) !== divRound(sx, m) || BigInt(r.anchor_y) !== divRound(sy, m)) throw mismatch("ANCHOR", `$.nodes[${i}]`);
  });
  core.union.forEach((u, i) => {
    const r = rn[i]! as NodeRecord;
    if (u.status !== "added" || !("anchor_kind" in r)) return;
    const m = earlier(u.ni, r.wave).length;
    if (r.anchor_kind === "neighbours" ? m < 1 : m !== 0) throw mismatch("WAVE", `$.nodes[${i}]`);
  });
}

export async function verifyStable(previous: PreviousDrawing | null, sceneBytes: Uint8Array, layoutBytes: Uint8Array, reportBytes: Uint8Array, options?: Opts):
  Promise<{ report: DisplacementReport; reportSha256: string; layoutSha256: string }> {
  const c = await verifyStableCore(previous, sceneBytes, layoutBytes, reportBytes, options, false);
  return { report: c.report, reportSha256: c.reportSha256, layoutSha256: c.next.layoutSha256 };
}

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export async function verifyStableReproducible(previous: PreviousDrawing | null, sceneBytes: Uint8Array, layoutBytes: Uint8Array, reportBytes: Uint8Array,
  options?: Opts & { forceBudget?: Partial<import("isongraph-visualize-layout-core").ForceBudget> }): Promise<"reproduced"> {
  const c = await verifyStableCore(previous, sceneBytes, layoutBytes, reportBytes, options, true);
  const core = diffCore(c.prev, c.next);
  const derived = decideMode(c.prev, c.next, core);
  const notReproduced = (detail: string): StableLayoutError => new StableLayoutError("INVALID_REPORT", "NOT_REPRODUCED", undefined, detail);
  if (c.report.mode !== derived) throw notReproduced("MODE");
  const plc = c.report.placement;
  const placement: PlacementConfig | undefined = plc.present
    ? { radius: plc.radius, min_separation: plc.min_separation, max_rings: plc.max_rings }
    : c.prev !== null ? { ...RECOMMENDED_PLACEMENT } : undefined; // no node is placed when the report records no placement
  let coldStart: ForceConfig | undefined;
  if (derived === "cold" && c.next.nodes.length > 0) {
    const policy = c.next.layout.policy;
    if (policy.family !== "FORCE") throw notReproduced("BYTES"); // not the output of the cold-start producer
    coldStart = policy.config as unknown as ForceConfig;
  }
  // Design 9.5 step 4: "equal gives reproduced, otherwise NOT_REPRODUCED". A recomputation that cannot produce the artifact at all (no free slot under the
  // recorded placement, a scene or config the cold-start producer refuses) is "otherwise". A budget or work refusal is a control, not a verdict (Law 6): it passes through.
  let p: Awaited<ReturnType<typeof produce>>;
  try { p = await produce({ prev: c.prev, next: c.next, sceneBytes: c.ownedScene, placement, coldStart, forceBudget: c.forceBudget, budget: c.budget, meter: c.meter }); }
  catch (e) {
    if ((e instanceof StableLayoutError && e.code === "PLACEMENT_FAILED") || (e instanceof LayoutError && e.code !== "RESOURCE_LIMIT")) throw notReproduced("BYTES");
    throw e;
  }
  if (!same(p.layout.layoutBytes, c.ownedLayout) || !same(p.reportBytes, c.ownedReport)) throw notReproduced("BYTES");
  return "reproduced";
}
