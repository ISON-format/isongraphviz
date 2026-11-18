import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IgrError } from "../src/errors.js";
import { canonicalBytes, compareNodeRef, compareUtf8, nodeRefFromWire } from "isongraph-visualize-scene-core/primitives";
import { verifyScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel } from "../src/model.js";
import type { RenderLimits, RenderModel } from "../src/types.js";

export const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
export const ORACLES = join(FIXTURES, "oracles/");          // frozen IGS/1 oracles
export const ORACLES_IGL = join(FIXTURES, "oracles-igl/");  // frozen IGL/1 corpus
export const read = (path: string): Uint8Array => new Uint8Array(readFileSync(path));
export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
export const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

export const SCENE_O1 = "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc";
export const LAYOUT_F01 = "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db";
export const ARTIFACT_O1 = "1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a";

export const o1Scene = (): Uint8Array => read(join(ORACLES, "o1-basic.scene.json"));
export const o4Scene = (): Uint8Array => read(join(ORACLES, "o4-undirected.scene.json"));
export const igl = (rel: string): Uint8Array => read(join(ORACLES_IGL, rel));

/** "CODE/REASON" of a thrown IgrError (or "other:<name>" / "no error"). */
export function errOf(f: () => unknown): string {
  try { f(); } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${(e as Error).name}`; }
  return "no error";
}
export async function errOfAsync(f: () => Promise<unknown>): Promise<string> {
  try { await f(); } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${(e as { code?: string; reason?: string }).code ?? (e as Error).name}${(e as { reason?: string }).reason ? "/" + (e as { reason?: string }).reason : ""}`; }
  return "no error";
}

// ---- hand-made scenes (canonical bytes written with the shared canonical writer, verified by the frozen verifier) ----
/** `label` is accepted for readability but IS the decoded id (IGS/1 section 3.2): s:x has label x, i:7 has label 7. */
export interface HandNode { id: string; type?: string; category?: string; label?: string }
export interface HandEdge { src: string; tgt: string; rel?: string; label?: string; ord?: string; srcType?: string; tgtType?: string }

export async function handScene(nodes: HandNode[], edges: HandEdge[] = [], directed = true): Promise<Uint8Array> {
  const tpl = JSON.parse(dec(read(join(ORACLES_IGL, "scenes/S09.scene.json")))) as Record<string, unknown>;
  const ns = nodes.map((n) => ({ category: n.category ?? n.type ?? "p", label: n.id.slice(2), ref: { id: n.id, type: n.type ?? "p" } }));
  ns.sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref)));
  const es = edges.map((e) => ({ label: e.label ?? e.rel ?? "R", ref: { ord: e.ord ?? "0", rel: e.rel ?? "R", src: { id: e.src, type: e.srcType ?? "p" }, tgt: { id: e.tgt, type: e.tgtType ?? "p" } } }));
  es.sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref.src), nodeRefFromWire(b.ref.src)) || compareUtf8(a.ref.rel, b.ref.rel) || compareNodeRef(nodeRefFromWire(a.ref.tgt), nodeRefFromWire(b.ref.tgt)) || compareUtf8(a.ref.ord, b.ref.ord));
  return canonicalBytes({ ...tpl, nodes: ns, edges: es, graph: { directed, profile: "simple" } } as never);
}

/** A model over a hand-made scene; node k (scene order) is placed at positions[k] ?? [10 k, 0] layout units. */
export async function handModel(nodes: HandNode[], edges: HandEdge[] = [], opts: { directed?: boolean; positions?: [number, number][]; limits?: Partial<RenderLimits> } = {}): Promise<RenderModel> {
  const scene = await handScene(nodes, edges, opts.directed ?? true);
  const sc = (await verifyScene(scene)).scene;
  const lay = await computeFixedLayout(scene, sc.nodes.map((n, k) => ({ ref: n.ref, x: opts.positions?.[k]?.[0] ?? 10 * k, y: opts.positions?.[k]?.[1] ?? 0 })));
  return buildRenderModel(scene, lay.layoutBytes, { limits: opts.limits ?? {} });
}
