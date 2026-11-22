// Test helpers: fixture access and the design file. Nothing here is imported by src/.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PKG_DIR = resolve(HERE, "..");
export const REPO_DIR = resolve(PKG_DIR, "..", "..");
export const ORACLE_DIR = join(REPO_DIR, "fixtures", "oracles-ia");
export const DESIGN_PATH = join(REPO_DIR, "docs", "isongraph-visualize-blueprint", "32-INTERACTION-A11Y-EXPORT-DESIGN.md");
/** The reference digest of fixtures/oracles-ia/SHA256SUMS (design 15.1: DRAFT, reference only, not frozen). */
export const ORACLE_DIGEST = "83b8102f2229c25ae12cdc4a32b3ee58aaa9069f179e17e0f5f7e8ed80cd8a63";

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
export const G9 = { scene: "scenes/G9.scene.json", layout: "layouts/G9.layout.json" } as const;
export const O1 = { scene: "scenes/O1.scene.json", layout: "layouts/O1.layout.json" } as const;
export const SIZE = { width: 900, height: 600 };

export async function initial(s: { scene: string; layout: string }, size = SIZE): Promise<{ model: RenderModel; state: SemanticState }> {
  const model = await loadModel(s.scene, s.layout);
  return { model, state: initialState(model, size) };
}
/** A state file of the oracle corpus, parsed with plain JSON. */
export const readState = (rel: string): SemanticState => JSON.parse(readOracleText(rel)) as SemanticState;

export const designText = (): string | undefined => (existsSync(DESIGN_PATH) ? readFileSync(DESIGN_PATH, "utf8") : undefined);
