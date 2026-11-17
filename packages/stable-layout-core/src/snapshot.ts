// 28-STABLE-LAYOUT-DESIGN.md section 2.1: snapshotLayout, a deep-frozen inspection value that is never accepted as an argument.
import { admitArtifacts, admitBytes, isDrawing, readDrawing } from "./admit.js";
import { StableLayoutError } from "./errors.js";
import { Meter, readOptions, resolveBudget, type StableBudget } from "./limits.js";
import { wireEdge } from "./report.js";
import type { LayoutSnapshot, PreviousDrawing } from "./types.js";

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

export async function snapshotLayout(drawing: PreviousDrawing, options?: { budget?: Partial<StableBudget> }): Promise<LayoutSnapshot> {
  const o = readOptions(options, ["budget"]);
  const budget = resolveBudget(o.get("budget"));
  const d = readDrawing(drawing, "drawing");
  const [s, l] = admitBytes([
    { value: d.sceneBytes, path: "drawing.sceneBytes", cap: budget.maxSceneBytes },
    { value: d.layoutBytes, path: "drawing.layoutBytes", cap: budget.maxLayoutBytes },
  ]);
  const [idx] = await admitArtifacts([{ role: "previous", path: "drawing", sceneBytes: s!, layoutBytes: l! }], budget);
  if (!isDrawing(idx!)) throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH");
  new Meter(budget.maxWork).charge(idx.nodes.length + 2 * idx.edges.length); // S1
  return deepFreeze({
    sceneSha256: idx.sceneSha256, layoutSha256: idx.layoutSha256, directed: idx.directed,
    nodes: idx.nodes.map((n, i) => ({ ref: { id: n.ref.id, type: n.ref.type }, x: idx.x[i]!, y: idx.y[i]! })),
    edges: idx.edges.map((e) => wireEdge(e.wire)),
  });
}
