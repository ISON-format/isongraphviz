// Test helpers of the cross-check harness (design 9.5, 13.1, 14 (6)): the corpora of V5 (oracles-svg) and V6 (oracles-dl) are read as DATA (scenes, layouts,
// states, expected readouts); nothing of their tools is read and no other corpus is touched. Nothing here is imported by a package.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IgrError, buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import type { RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, readoutFromList, readoutFromSvgReadout, serializeReadout } from "isongraph-visualize-display-list";
import type { DisplayList, DlOptions, Readout } from "isongraph-visualize-display-list";
import { readoutFromCanvasStream, recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import { readSvg, renderSvg } from "isongraph-visualize-renderer-svg";
import { planGl, readoutFromGl } from "isongraph-visualize-renderer-webgl";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PKG_DIR = resolve(HERE, "..");
export const REPO_DIR = resolve(PKG_DIR, "..", "..");
export const FIXTURES = join(REPO_DIR, "fixtures");
export const SVG_DIR = join(FIXTURES, "oracles-svg");
export const DL_DIR = join(FIXTURES, "oracles-dl");
/** The digests recorded at oracle time (design 13.1, 13.7): a regenerated corpus changes the rows this harness reads, so the gate fails loudly. */
export const SVG_DIGEST = "63a198339b40417d1a039058e9e61b5f21fa1a5c887be29decd5c3bef97cccbd";
export const DL_DIGEST = "18dbafa1473a2d94db857d1238c8576aac5ba3bfea3f239491766905f8d25452";

export const sha256 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");
export const text = (b: Uint8Array): string => new TextDecoder().decode(b);
export const digestOf = (dir: string): string => sha256(readFileSync(join(dir, "SHA256SUMS")));
export const read = (dir: string, rel: string): Uint8Array => new Uint8Array(readFileSync(join(dir, normalize(rel))));
export const readText = (dir: string, rel: string): string => readFileSync(join(dir, normalize(rel)), "utf8");

export interface Row { id: string; group: string; tier: string; scene: string; layout: string; input: string; expected: string; error: string }
export function loadRows(dir: string): Row[] {
  return readFileSync(join(dir, "EXPECT.tsv"), "utf8").split("\n").filter((l) => l !== "").slice(1).map((l) => {
    const c = l.split("\t");
    return { id: c[0] ?? "", group: c[1] ?? "", tier: c[2] ?? "", scene: c[3] ?? "", layout: c[4] ?? "", input: c[5] ?? "", expected: c[6] ?? "", error: c[7] ?? "" };
  });
}

const models = new Map<string, Promise<RenderModel>>();
export function modelOf(dir: string, scene: string, layout: string): Promise<RenderModel> {
  const key = dir + "\u0000" + scene + "\u0000" + layout;
  let m = models.get(key);
  if (!m) { m = buildRenderModel(read(dir, scene), read(dir, layout)); models.set(key, m); }
  return m;
}

/** The model and state of a corpus row (`input.state` is "initial" or a state file path relative to the corpus). */
export async function scene(dir: string, row: Row): Promise<{ model: RenderModel; state: SemanticState; options: DlOptions; size: { width: number; height: number } }> {
  const input = JSON.parse(row.input) as { size?: { width: number; height: number }; state?: string; options?: Record<string, unknown> };
  const model = await modelOf(dir, row.scene, row.layout);
  const size = input.size ?? { width: 900, height: 600 };
  const state = input.state === undefined || input.state === "initial" ? initialState(model, size) : (JSON.parse(readText(dir, input.state)) as SemanticState);
  const o = input.options ?? {};
  const options: DlOptions = {};
  for (const k of ["labels", "edgeLabels", "maxDrawnLabelUnits"] as const) if (o[k] !== undefined) (options as Record<string, unknown>)[k] = o[k];
  return { model, state, options, size };
}

/** The four readouts of XR-1 (9.5) for one model, state and the shared label options. */
export interface FourReadouts { list: DisplayList; svg: Readout; canvas: Readout; gl: Readout; dl: Readout; svgDoc: string; sizes: { svg: number; canvasStream: number; glPlan: number } }
export function readouts(model: RenderModel, state: SemanticState, options: DlOptions): FourReadouts {
  const list = buildDisplayList(model, state, options);
  const svgDoc = renderSvg(model, state, options);
  const stream = recordCanvasCalls(list);
  const plan = planGl(list);
  return {
    list, svgDoc,
    svg: readoutFromSvgReadout(readSvg(svgDoc) as never),
    canvas: readoutFromCanvasStream(stream, list),
    gl: readoutFromGl(plan),
    dl: readoutFromList(list),
    sizes: { svg: new TextEncoder().encode(svgDoc).length, canvasStream: stream.length, glPlan: plan.buffers.edge.length + plan.buffers.disc.length + plan.buffers.arrow.length },
  };
}
export const bytes = (r: Readout): string => text(serializeReadout(r));

export const code = (f: () => unknown): string => { try { f(); return "none"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${String(e)}`; } };
