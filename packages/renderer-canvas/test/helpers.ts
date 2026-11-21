// Test helpers: fixture access and the design file. Nothing here is imported by src/.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, IgrError, initialState, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PKG_DIR = resolve(HERE, "..");
export const REPO_DIR = resolve(PKG_DIR, "..", "..");
export const ORACLE_DIR = join(REPO_DIR, "fixtures", "oracles-dl");
export const DESIGN_PATH = join(REPO_DIR, "docs", "isongraph-visualize-blueprint", "31-CANVAS-WEBGL-DESIGN.md");
/** The reference digest of fixtures/oracles-dl/SHA256SUMS (design 13.7: DRAFT, reference only, not frozen). */
export const ORACLE_DIGEST = "18dbafa1473a2d94db857d1238c8576aac5ba3bfea3f239491766905f8d25452";

export const sha256 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");
export const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);
export const textOf = (b: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(b);
export const readOracle = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(ORACLE_DIR, rel)));
export const readOracleText = (rel: string): string => readFileSync(join(ORACLE_DIR, rel), "utf8");

const models = new Map<string, Promise<RenderModel>>();
/** A model from a scene and a layout path, both relative to the oracle directory; cached per process. */
export function loadModel(scene: string, layout: string): Promise<RenderModel> {
  const key = scene + "\u0000" + layout;
  let m = models.get(key);
  if (!m) { m = buildRenderModel(readOracle(scene), readOracle(layout)); models.set(key, m); }
  return m;
}
export const O1 = { scene: "../oracles/o1-basic.scene.json", layout: "../oracles-igl/layouts/F01.layout.json" } as const;
export const O4 = { scene: "../oracles/o4-undirected.scene.json", layout: "../oracles-igl/layouts/F02.layout.json" } as const;
export const MIXED20 = { scene: "../oracles-igl/scenes/mixed20.scene.json", layout: "../oracles-igl/layouts/F04.layout.json" } as const;
export const LOOPS2 = { scene: "../oracles-svg/scenes/loops2.scene.json", layout: "../oracles-svg/layouts/loops2.layout.json" } as const;
export const SIZE = { width: 900, height: 600 };

export async function o1(): Promise<{ model: RenderModel; state: SemanticState }> {
  const model = await loadModel(O1.scene, O1.layout);
  return { model, state: initialState(model, SIZE) };
}
export async function initial(s: { scene: string; layout: string }, size = SIZE): Promise<{ model: RenderModel; state: SemanticState }> {
  const model = await loadModel(s.scene, s.layout);
  return { model, state: initialState(model, size) };
}
/** A state file of the oracle corpus, parsed with plain JSON (not parseState: Y14 and Y15 are deliberately invalid). */
export const readState = (rel: string): SemanticState => JSON.parse(readOracleText(rel)) as SemanticState;
export async function errOfAsync(f: () => Promise<unknown>): Promise<string> {
  try { await f(); return "none"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${e instanceof Error ? e.message : String(e)}`; }
}

/** The code of an IgrError as the corpus writes it, or "none" / "other:...". */
export function errOf(f: () => unknown): string {
  try { f(); return "none"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${e instanceof Error ? e.message : String(e)}`; }
}

export const designText = (): string | undefined => (existsSync(DESIGN_PATH) ? readFileSync(DESIGN_PATH, "utf8") : undefined);

/** The first ```text fenced block after the line that starts with `marker` (design Appendix A extraction). */
export function blockAfter(md: string, marker: string): string {
  const at = md.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const open = md.indexOf("```text\n", at);
  const close = md.indexOf("\n```", open + 8);
  if (open < 0 || close < 0) throw new Error(`no fenced block after ${marker}`);
  return md.slice(open + 8, close);
}
