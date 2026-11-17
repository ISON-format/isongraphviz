// 28-STABLE-LAYOUT-DESIGN.md sections 4, 5, 9, 11 and 12: computeStableLayout and the production shared with recomputation.
import { computeFixedLayout, computeForceLayout } from "isongraph-visualize-layout-core";
import type { ForceBudget, ForceConfig, LayoutResult } from "isongraph-visualize-layout-core";
import { nodeKey, nodeRefFromWire } from "isongraph-visualize-scene-core/primitives";
import { adjacencyOf, admitArtifacts, admitBytes, isDrawing, readPrevious, type DrawingIdx, type SceneIdx } from "./admit.js";
import { chargeC1, diffCore, toSceneDiff, type DiffCore } from "./diff.js";
import { StableLayoutError } from "./errors.js";
import { Meter, readOptions, resolveBudget, snapshotPlain, type StableBudget } from "./limits.js";
import { placeAdded, validatePlacement } from "./placement.js";
import { buildReport, reportCharge, writeReport } from "./report.js";
import { verifyReportBytes } from "./report-verify.js";
import type { DisplacementReport, PlacementConfig, PreviousDrawing, SceneDiff, StableOptions, StableResult } from "./types.js";

/** The section 11 table, evaluated on the verified inputs. */
export function decideMode(prev: DrawingIdx | null, next: SceneIdx, core: DiffCore): "incremental" | "cold" {
  if (prev === null) return "cold";
  if (next.nodes.length === 0) return "incremental";
  return core.kept === 0 ? "cold" : "incremental";
}

export interface ProduceArgs {
  prev: DrawingIdx | null; next: SceneIdx; sceneBytes: Uint8Array;
  placement: PlacementConfig | undefined; coldStart: unknown; forceBudget: unknown;
  budget: StableBudget; meter: Meter;
}
export interface Produced {
  mode: "incremental" | "cold"; layout: LayoutResult; nextIdx: DrawingIdx; report: DisplacementReport; reportBytes: Uint8Array; reportSha256: string;
  diff: SceneDiff; stats: { waves: number; placed: number };
}

/** Maps a verified layout of `scene` onto the scene's node order. */
function attach(scene: SceneIdx, res: LayoutResult): DrawingIdx {
  const pos = new Map<string, [number, number]>();
  for (const n of res.layout.nodes) pos.set(nodeKey(nodeRefFromWire(n.ref)), [n.x, n.y]);
  const x: number[] = [], y: number[] = [];
  for (const n of scene.nodes) {
    const p = pos.get(n.key);
    if (!p) throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH", undefined, "node missing from the produced layout");
    x.push(p[0]); y.push(p[1]);
  }
  return { ...scene, layout: res.layout, layoutSha256: res.layoutSha256, x, y };
}

/** Section 12.1 steps (7)-(9) and the cost of section 12.3 (C1, C2, C3, C4). */
export async function produce(a: ProduceArgs): Promise<Produced> {
  const core = diffCore(a.prev, a.next);
  const mode = decideMode(a.prev, a.next, core);
  const needsForce = mode === "cold" && a.next.nodes.length > 0;
  if (needsForce && a.coldStart === undefined) throw new StableLayoutError("INVALID_REQUEST", "COLD_START_REQUIRED", "options.coldStart");
  chargeC1(a.meter, a.prev, a.next, core.kept);
  let layout: LayoutResult;
  let waves = 0, placed = 0;
  let placedRecords: ReturnType<typeof placeAdded>["records"] | null = null;
  let intended: [number, number][] | null = null;
  if (needsForce) {
    layout = await computeForceLayout(a.sceneBytes, a.coldStart as ForceConfig, { budget: a.forceBudget as Partial<ForceBudget> | undefined });
  } else if (a.next.nodes.length === 0) {
    layout = await computeFixedLayout(a.sceneBytes, []);
  } else {
    if (a.placement === undefined) throw new StableLayoutError("INVALID_REQUEST", "PLACEMENT_REQUIRED", "options.placement");
    const prev = a.prev!;
    const pos: ([number, number] | null)[] = a.next.nodes.map((n) => {
      const pi = prev.nodeIndex.get(n.key);
      return pi === undefined ? null : [prev.x[pi]!, prev.y[pi]!];
    });
    let records: ReturnType<typeof placeAdded>["records"] = pos.map(() => undefined);
    if (core.added > 0) {
      const r = placeAdded({
        pos, adj: adjacencyOf(a.next), cfg: a.placement, meter: a.meter,
        refOf: (i) => JSON.stringify({ id: a.next.nodes[i]!.ref.id, type: a.next.nodes[i]!.ref.type }),
      });
      records = r.records; waves = r.waves; placed = r.placed;
    }
    placedRecords = records;
    const want: [number, number][] = a.next.nodes.map((_, i) => pos[i] ?? [records[i]!.x, records[i]!.y]);
    intended = want;
    layout = await computeFixedLayout(a.sceneBytes, a.next.nodes.map((n, i) => ({ ref: n.ref, x: want[i]![0] / 1000, y: want[i]![1] / 1000 })));
  }
  const nextIdx = attach(a.next, layout);
  if (intended !== null) {
    intended.forEach((p, i) => {
      if (nextIdx.x[i] !== p[0] || nextIdx.y[i] !== p[1]) throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH", undefined, `node ${i}`);
    });
  }
  a.meter.charge(reportCharge(a.prev, nextIdx));
  const report = buildReport({ mode, prev: a.prev, next: nextIdx, core, placement: a.placement ?? null, placed: placedRecords });
  const w = await writeReport(report);
  if (w.bytes.length > a.budget.maxReportBytes) throw new StableLayoutError("RESOURCE_LIMIT", "INPUT_BYTES", "report", `${w.bytes.length} bytes > ${a.budget.maxReportBytes}`);
  try { await verifyReportBytes(w.bytes, a.budget, null); } // the producer meets the verifier it will meet (unmetered: the work of section 12.3 is unchanged)
  catch (e) {
    if (e instanceof StableLayoutError && e.code === "INVALID_REPORT") throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH", "report", e.message);
    throw e;
  }
  return { mode, layout, nextIdx, report, reportBytes: w.bytes, reportSha256: w.sha256, diff: toSceneDiff(core, a.prev, a.next), stats: { waves, placed } };
}

export async function computeStableLayout(previous: PreviousDrawing | null, sceneBytes: Uint8Array, options: StableOptions): Promise<StableResult> {
  // synchronous prologue: nothing below the first await sees caller-owned memory
  const o = readOptions(options, ["placement", "coldStart", "budget", "forceBudget"]);
  const budget = resolveBudget(o.get("budget"));
  const placement = o.has("placement") ? validatePlacement(o.get("placement")) : undefined;
  if (previous !== null && placement === undefined) throw new StableLayoutError("INVALID_REQUEST", "PLACEMENT_REQUIRED", "options.placement");
  const coldStart = snapshotPlain(o.get("coldStart")), forceBudget = snapshotPlain(o.get("forceBudget")); // owned copies: layout-core reads them after the awaits
  const pd = readPrevious(previous);
  const owned = admitBytes([
    ...(pd === null ? [] : [
      { value: pd.sceneBytes, path: "previous.sceneBytes", cap: budget.maxSceneBytes },
      { value: pd.layoutBytes, path: "previous.layoutBytes", cap: budget.maxLayoutBytes },
    ]),
    { value: sceneBytes, path: "sceneBytes", cap: budget.maxSceneBytes },
  ]);
  const scene = owned[owned.length - 1]!;
  const idx = await admitArtifacts([
    ...(pd === null ? [] : [{ role: "previous" as const, path: "previous", sceneBytes: owned[0]!, layoutBytes: owned[1]! }]),
    { role: "next" as const, path: "sceneBytes", sceneBytes: scene },
  ], budget);
  const prev = pd === null ? null : idx[0]!;
  if (prev !== null && !isDrawing(prev)) throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH");
  const meter = new Meter(budget.maxWork);
  const p = await produce({ prev, next: idx[idx.length - 1]!, sceneBytes: scene, placement, coldStart, forceBudget, budget, meter });
  return {
    mode: p.mode, layout: p.layout, report: p.report, reportBytes: p.reportBytes, reportSha256: p.reportSha256,
    drawing: { sceneBytes: new Uint8Array(scene), layoutBytes: new Uint8Array(p.layout.layoutBytes) },
    diff: p.diff, stats: { work: meter.work, waves: p.stats.waves, placed: p.stats.placed },
  };
}
