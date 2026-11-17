import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileScene } from "isongraph-visualize-scene-core";
import { LayoutError } from "../src/errors.js";
import { layoutToBytes } from "../src/serialize.js";
import type { Layout } from "../src/types.js";

export const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
export const ORACLES = join(FIXTURES, "oracles/");          // the frozen IGS/1 oracles
export const ORACLES_IGL = join(FIXTURES, "oracles-igl/");  // the frozen IGL/1 corpus
export const read = (path: string): Uint8Array => new Uint8Array(readFileSync(path));
export const SCENE_O1 = "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc";
export const CORE_CFG = { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 };

export const baseLayout = (): Layout => ({
  address_scheme: "igs-addr/1", igl: "IGL/1", scale: 1000, scene_sha256: SCENE_O1,
  policy: { family: "FORCE", algorithm: "igl-force/1", config: { ...CORE_CFG } },
  nodes: [{ ref: { id: "i:1", type: "person" }, x: 173961, y: 81203 }, { ref: { id: "s:ann", type: "person" }, x: 593147, y: 187923 }],
});
export const baseText = (): string => new TextDecoder().decode(layoutToBytes(baseLayout()));
export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
export const o1Scene = () => compileScene(read(join(ORACLES, "o1-basic.source.ison")), "ison-v1");

export async function layoutError(f: () => Promise<unknown>): Promise<string> {
  try { await f(); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason ?? ""}`; throw e; }
  return "no error";
}
