// 28-STABLE-LAYOUT-DESIGN.md section 8: measureDisplacement, a pure function of two bound drawings.
import { admitArtifacts, admitBytes, isDrawing, readDrawing, type DrawingIdx } from "./admit.js";
import { chargeC1, diffCore } from "./diff.js";
import { StableLayoutError } from "./errors.js";
import { Meter, readOptions, resolveBudget, type StableBudget } from "./limits.js";
import { buildReport, reportCharge, writeReport } from "./report.js";
import type { MeasureResult, PreviousDrawing } from "./types.js";

export async function measureDisplacement(previous: PreviousDrawing, next: PreviousDrawing, options?: { budget?: Partial<StableBudget> }): Promise<MeasureResult> {
  const o = readOptions(options, ["budget"]);
  const budget = resolveBudget(o.get("budget"));
  const p = readDrawing(previous, "previous"), n = readDrawing(next, "next");
  const [ps, pl, ns, nl] = admitBytes([
    { value: p.sceneBytes, path: "previous.sceneBytes", cap: budget.maxSceneBytes },
    { value: p.layoutBytes, path: "previous.layoutBytes", cap: budget.maxLayoutBytes },
    { value: n.sceneBytes, path: "next.sceneBytes", cap: budget.maxSceneBytes },
    { value: n.layoutBytes, path: "next.layoutBytes", cap: budget.maxLayoutBytes },
  ]);
  const [pi, ni] = (await admitArtifacts([
    { role: "previous", path: "previous", sceneBytes: ps!, layoutBytes: pl! },
    { role: "next", path: "next", sceneBytes: ns!, layoutBytes: nl! },
  ], budget)) as [DrawingIdx, DrawingIdx];
  if (!isDrawing(pi) || !isDrawing(ni)) throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH");
  const core = diffCore(pi, ni);
  const meter = new Meter(budget.maxWork);
  chargeC1(meter, pi, ni, core.kept);
  meter.charge(reportCharge(pi, ni));
  const report = buildReport({ mode: "measured", prev: pi, next: ni, core, placement: null, placed: null });
  const w = await writeReport(report);
  if (w.bytes.length > budget.maxReportBytes) throw new StableLayoutError("RESOURCE_LIMIT", "INPUT_BYTES", "report", `${w.bytes.length} bytes > ${budget.maxReportBytes}`);
  return { report, reportBytes: w.bytes, reportSha256: w.sha256, stats: { work: meter.work } };
}
