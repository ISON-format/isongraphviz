// Test helpers: fixture access and the design file. Nothing here is imported by src/.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, IgrError, initialState, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PKG_DIR = resolve(HERE, "..");
export const REPO_DIR = resolve(PKG_DIR, "..", "..");
export const ORACLE_DIR = join(REPO_DIR, "fixtures", "oracles-gl");
export const DESIGN_PATH = join(REPO_DIR, "docs", "isongraph-visualize-blueprint", "31-CANVAS-WEBGL-DESIGN.md");
/** The reference digest of fixtures/oracles-gl/SHA256SUMS (design 13.7: DRAFT, reference only, not frozen). */
export const ORACLE_DIGEST = "c5596057cf8ffe958306020122beca69dab6effbcf8bce506952a0e90a7cf86b";
/** The pinned digest of the shader set (design A.8, 7.4). */
export const SHADER_DIGEST = "eaf76017c4e62f6a445e9b550ace6301d75ea22143f27e9c66d9e97a631e6968";

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

export async function initial(s: { scene: string; layout: string }, size = SIZE): Promise<{ model: RenderModel; state: SemanticState }> {
  const model = await loadModel(s.scene, s.layout);
  return { model, state: initialState(model, size) };
}
/** A state file of the oracle corpus (path relative to the oracle directory), parsed with plain JSON. */
export const readState = (rel: string): SemanticState => JSON.parse(readOracleText(rel)) as SemanticState;

/** The code of an IgrError as the corpus writes it, or "none" / "other:...". */
export function errOf(f: () => unknown): string {
  try { f(); return "none"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${e instanceof Error ? e.message : String(e)}`; }
}

export const designText = (): string | undefined => (existsSync(DESIGN_PATH) ? readFileSync(DESIGN_PATH, "utf8") : undefined);

/** The first fenced block (of the given language) after the first occurrence of `marker` in the design file; the block text without its final LF. */
export function blockAfter(md: string, marker: string, lang = "text", from = 0): string {
  const at = md.indexOf(marker, from);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const fence = "```" + lang + "\n";
  const open = md.indexOf(fence, at);
  const close = md.indexOf("\n```", open + fence.length);
  if (open < 0 || close < 0) throw new Error(`no fenced block after ${marker}`);
  return md.slice(open + fence.length, close);
}
