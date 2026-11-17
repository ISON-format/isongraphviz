import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { verifyScene } from "isongraph-visualize-scene-core";
import { canonicalBytes, compareNodeRef, compareUtf8, decodeNodeId, labelOf, nodeRefFromWire, sha256Hex, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { StableLayoutError } from "../src/errors.js";
import type { PreviousDrawing } from "../src/types.js";

export type NodeSpec = string | [type: string, wireId: string]; // a bare string is a wire id of type "n"
export type EdgeSpec = [src: NodeSpec, rel: string, tgt: NodeSpec];
export interface SceneSpec { directed?: boolean; nodes: NodeSpec[]; edges?: EdgeSpec[]; tag: string }

const ref = (n: NodeSpec): { id: string; type: string } => (typeof n === "string" ? { id: n, type: "n" } : { id: n[1], type: n[0] });
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const cmpRef = (a: { id: string; type: string }, b: { id: string; type: string }): number => compareNodeRef(nodeRefFromWire(a), nodeRefFromWire(b));

/** Canonical IGS/1 bytes; `source.artifact_sha256` = SHA-256 of the ASCII tag (the corpus convention of section 16). */
export async function sceneBytes(spec: SceneSpec): Promise<Uint8Array> {
  const directed = spec.directed ?? true;
  const nodes = spec.nodes.map(ref).sort(cmpRef).map((r) => ({ category: r.type, label: labelOf(decodeNodeId(r.id)), ref: r }));
  const edges = (spec.edges ?? []).map(([s, rel, t]) => {
    let src = ref(s), tgt = ref(t);
    if (!directed && cmpRef(src, tgt) > 0) [src, tgt] = [tgt, src];
    return { label: rel, ref: { ord: "0", rel, src, tgt } };
  }).sort((a, b) => cmpRef(a.ref.src, b.ref.src) || compareUtf8(a.ref.rel, b.ref.rel) || cmpRef(a.ref.tgt, b.ref.tgt));
  const scene = {
    address_scheme: "igs-addr/1", edges, graph: { directed, profile: "simple" }, igs: "IGS/1", nodes,
    source: { artifact_sha256: await sha256Hex(enc(spec.tag)), serialization_profile: "ison-v1" },
  };
  return canonicalBytes(scene as unknown as CJValue);
}

/** An igl-fixed/1 layout of a scene; positions are integer thousandths keyed by wire id (type "n") or by `type|wireId`. */
export async function fixedLayout(scene: Uint8Array, pos: Record<string, [number, number]>): Promise<Uint8Array> {
  const { scene: s } = await verifyScene(scene);
  const positions = s.nodes.map((n) => {
    const p = pos[n.ref.id] ?? pos[`${n.ref.type}|${n.ref.id}`];
    if (!p) throw new Error(`no position for ${n.ref.type} ${n.ref.id}`);
    return { ref: n.ref, x: p[0] / 1000, y: p[1] / 1000 };
  });
  return (await computeFixedLayout(scene, positions)).layoutBytes;
}

export async function drawing(spec: SceneSpec, pos: Record<string, [number, number]>): Promise<PreviousDrawing> {
  const s = await sceneBytes(spec);
  return { sceneBytes: s, layoutBytes: await fixedLayout(s, pos) };
}

export const sha = (b: Uint8Array): Promise<string> => sha256Hex(b);
export const text = (b: Uint8Array): string => new TextDecoder().decode(b);

// ---- section 5.6 worked examples -------------------------------------------------------------------------------------------
export const PLACE_56 = { radius: 1000, min_separation: 800, max_rings: 4 };
export const POS_PREV: Record<string, [number, number]> = { "i:1": [0, 0], "i:2": [2000, 0], "i:3": [2000, 1500], "i:6": [3000, 700] };
export const SPEC_PREV: SceneSpec = { tag: "worked-prev", nodes: ["i:1", "i:2", "i:3", "i:6"], edges: [["i:1", "e", "i:2"], ["i:2", "e", "i:3"], ["i:3", "e", "i:6"]] };
export const SPEC_A: SceneSpec = { tag: "worked-A", nodes: ["i:1", "i:2", "i:3", "i:4", "i:6"], edges: [["i:1", "e", "i:2"], ["i:2", "e", "i:3"], ["i:3", "e", "i:6"], ["i:1", "e", "i:4"]] };
export const SPEC_B: SceneSpec = { tag: "worked-B", nodes: ["i:1", "i:2", "i:6"], edges: [["i:1", "e", "i:2"]] };
export const SPEC_C: SceneSpec = { tag: "worked-C", nodes: ["i:2", "i:3", "i:4", "i:5", "i:6"], edges: [["i:2", "e", "i:3"], ["i:3", "e", "i:6"], ["i:2", "e", "i:4"], ["i:3", "e", "i:4"], ["i:4", "e", "i:5"]] };
export const WORKED = {
  prevScene: "d6ca9f78605923160b0686df780736718e53fa863f4973ab3fb74042923776d5",
  prevLayout: "3f59c6804f0d487f14046f4351e6a676f7135d5f953535c8bad14d5404c2ec55",
  A: { scene: "1de9b9f67f7173059a5e7b34ce08796efaa286dffb1d8e2bd98e13831df88f0e", layout: "318c404cbea3a274b6c5bff3b4141f7c68b48b7e67e879a046bc665f13163460", report: "9642990ad784768d8311bc548ffde2e7cc0a35af4375862c5a6f6d4528914ea8", bytes: 1703, work: 61, waves: 1, placed: 1 },
  B: { scene: "574eb85dd753858618c8739b3447dcb0a916e327a0bdc9f1fd7c30af9833c64e", layout: "2b98f86369baaf8e80e083a7a1ae44c8ace6c01308e5c178c4cde959267ce623", report: "f019567f4a35bdc61eec631ffd61e4ee16e66f796de9901b72775a6513362863", bytes: 1499, work: 39, waves: 0, placed: 0 },
  C: { scene: "abbf89d1b3dd203fcfb9ad444bc09b8b4b6da340d71039b77979dde0fdc0034c", layout: "5574bf704c5e0331a17b77390e6ca64e6ed1254c970525de0d6983ffebe13bc4", report: "f20470354ac9f7a43a54691781c5b23421570306b212d0f0daea9b0b4cfaec3f", bytes: 2099, work: 105, waves: 2, placed: 2 },
};
export const prevDrawing = (): Promise<PreviousDrawing> => drawing(SPEC_PREV, POS_PREV);

/** The text of the section 9.2 example report (Case C), compact. */
export const REPORT_C_TEXT = '{"address_scheme":"igs-addr/1","aggregate":{"added":2,"common":3,"max_dist":0,"max_offset":1000,"mean_dist":0,"moved":0,"moved_ppm":0,"removed":1,"rms_dist":0,"sum_dist":"0","sum_dist_sq":"0"},"edges":{"added":[{"ord":"0","rel":"e","src":{"id":"i:2","type":"n"},"tgt":{"id":"i:4","type":"n"}},{"ord":"0","rel":"e","src":{"id":"i:3","type":"n"},"tgt":{"id":"i:4","type":"n"}},{"ord":"0","rel":"e","src":{"id":"i:4","type":"n"},"tgt":{"id":"i:5","type":"n"}}],"common":2,"removed":[{"ord":"0","rel":"e","src":{"id":"i:1","type":"n"},"tgt":{"id":"i:2","type":"n"}}]},"extent":{"next":{"max_x":3000,"max_y":2133,"min_x":1076,"min_y":0,"present":true},"previous":{"max_x":3000,"max_y":1500,"min_x":0,"min_y":0,"present":true}},"igls":"IGLS/1","mode":"incremental","next":{"directed":true,"layout_sha256":"5574bf704c5e0331a17b77390e6ca64e6ed1254c970525de0d6983ffebe13bc4","scene_sha256":"abbf89d1b3dd203fcfb9ad444bc09b8b4b6da340d71039b77979dde0fdc0034c"},"nodes":[{"ref":{"id":"i:1","type":"n"},"status":"removed","x_prev":0,"y_prev":0},{"dist":0,"dx":0,"dy":0,"ref":{"id":"i:2","type":"n"},"status":"kept","x":2000,"x_prev":2000,"y":0,"y_prev":0},{"dist":0,"dx":0,"dy":0,"ref":{"id":"i:3","type":"n"},"status":"kept","x":2000,"x_prev":2000,"y":1500,"y_prev":1500},{"anchor_kind":"neighbours","anchor_x":2000,"anchor_y":750,"direction":7,"offset":1000,"ref":{"id":"i:4","type":"n"},"ring":0,"status":"added","wave":0,"x":1076,"y":1133},{"anchor_kind":"neighbours","anchor_x":1076,"anchor_y":1133,"direction":4,"offset":1000,"ref":{"id":"i:5","type":"n"},"ring":0,"status":"added","wave":1,"x":1076,"y":2133},{"dist":0,"dx":0,"dy":0,"ref":{"id":"i:6","type":"n"},"status":"kept","x":3000,"x_prev":3000,"y":700,"y_prev":700}],"placement":{"algorithm":"igl-stable-place/1","max_rings":4,"min_separation":800,"present":true,"radius":1000},"previous":{"directed":true,"layout_sha256":"3f59c6804f0d487f14046f4351e6a676f7135d5f953535c8bad14d5404c2ec55","present":true,"scene_sha256":"d6ca9f78605923160b0686df780736718e53fa863f4973ab3fb74042923776d5"},"scale":1000,"transform_hint":{"dx":0,"dy":0,"present":true}}';

export async function stableError(f: () => Promise<unknown>): Promise<string> {
  try { await f(); } catch (e) { if (e instanceof StableLayoutError) return `${e.code}/${e.reason ?? ""}${e.detail !== undefined ? `/${e.detail}` : ""}`; throw e; }
  return "no error";
}
/** `CODE/REASON` only (no detail). */
export async function cr(f: () => Promise<unknown>): Promise<string> {
  try { await f(); } catch (e) { if (e instanceof StableLayoutError) return `${e.code}/${e.reason ?? ""}`; throw e; }
  return "no error";
}
