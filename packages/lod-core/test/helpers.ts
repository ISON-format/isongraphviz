import { compileScene } from "isongraph-visualize-scene-core";
import { canonicalBytes, canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { LODError } from "../src/errors.js";

export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
export const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/** The ISON source of design 29 section 14 (171 bytes). */
export const EXAMPLE_SOURCE =
  "nodes.t\nid\n1\n2\na\nb\nc\nd\ne\n\nedges.r\nsource target\n:t:1 :t:2\n:t:1 :t:a\n:t:1 :t:b\n:t:a :t:b\n:t:b :t:a\n:t:c :t:c\n:t:c :t:2\n:t:d :t:c\n:t:e :t:c\n\nedges.q\nsource target\n:t:1 :t:b\n";

export const SCENE_HASH = "fbf8c619017a67764fc01509aa3168418ec5fd71dafec440c0211930cc90a355";
export const LAYOUT_HASH = "d7a8924d1ec873aa782e5945efc474ee9310b3c283f32a0433e879e31fb08969";
export const EXAMPLE_POSITIONS: Array<[string, number, number]> = [
  ["i:1", 0, 0], ["i:2", 1000, -500], ["s:a", -1500, 2000], ["s:b", 2500, 3000], ["s:c", 500, -1000], ["s:d", -3, 7], ["s:e", 0, 8],
];

export const ref = (id: string, type = "t") => ({ id, type });
export const refs = (...ids: string[]) => ids.map((i) => ref(i));

export interface Example { sceneBytes: Uint8Array; layoutBytes: Uint8Array; sceneSha256: string; layoutSha256: string }
let cached: Promise<Example> | undefined;
export function example(): Promise<Example> {
  cached ??= (async () => {
    const c = await compileScene(enc(EXAMPLE_SOURCE), "ison-v1");
    const l = await computeFixedLayout(c.sceneBytes, EXAMPLE_POSITIONS.map(([id, x, y]) => ({ ref: ref(id), x: x / 1000, y: y / 1000 })));
    return { sceneBytes: c.sceneBytes, layoutBytes: l.layoutBytes, sceneSha256: c.sceneSha256, layoutSha256: l.layoutSha256 };
  })();
  return cached;
}

export const LABEL_POLICY = { full_degree: 5, full_zoom_milli: 2000, short_degree: 3, short_zoom_milli: 1000 };

/** A plain state object (not canonical-ordered by construction; use `bytes`). */
export function baseState(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    collapsed: [], label_policy: { ...LABEL_POLICY }, layout_sha256: LAYOUT_HASH, lod: "IGLOD/1", pinned: [], scene_sha256: SCENE_HASH, zoom_milli: 500,
    ...over,
  };
}
export const stateA = (): Record<string, unknown> => baseState({ collapsed: [{ members: refs("s:d", "s:e") }] });
export const stateB = (): Record<string, unknown> => baseState({ collapsed: [{ label: "outer", members: refs("s:a", "s:b", "s:c", "s:d", "s:e") }, { members: refs("s:d", "s:e") }] });
export const stateC = (): Record<string, unknown> => ({ ...stateB(), pinned: [ref("s:b")], edge_policy: { keep_forest: true, max_view_edges: 2 } });

export const bytes = (o: unknown): Uint8Array => canonicalBytes(o as CJValue);
export const signedBytes = (o: unknown): Uint8Array => canonicalBytesSigned(o as CJValue);
export const text = (o: unknown): string => dec(bytes(o));

/** "CODE/REASON" of the LODError (or other error name) a call throws, or "no error". */
export async function errOf(f: () => unknown): Promise<string> {
  try { await f(); } catch (e) {
    if (e instanceof LODError) return `${e.code}/${e.reason ?? ""}`;
    if (e instanceof Error && "code" in e) return `${(e as { name: string }).name}:${(e as { code: string }).code}/${(e as { reason?: string }).reason ?? ""}`;
    throw e;
  }
  return "no error";
}

// ------------------------------------------------------------------ hand-built scenes and layouts (accepted by the REAL verifyScene / bindLayout)
import { compareNodeRef, compareUtf8, nodeRefFromWire, sha256Hex } from "isongraph-visualize-scene-core/primitives";

export type EdgeSpec = [src: string, rel: string, tgt: string];
const nodeOf = (id: string): { id: string; type: string } => ({ id, type: "t" });
const cmpRef = (a: { id: string; type: string }, b: { id: string; type: string }): number => compareNodeRef(nodeRefFromWire(a), nodeRefFromWire(b));

/** A canonical scene: nodes `ids` (wire ids such as "i:3" or "s:a", one type `t` unless `type` is given), edges `[src, rel, tgt]` (wire ids). */
export function mkScene(o: { directed?: boolean; nodes: string[]; edges?: EdgeSpec[]; type?: string }): Uint8Array {
  const directed = o.directed ?? true;
  const type = o.type ?? "t";
  const withType = (id: string) => ({ id, type });
  const nodes = [...new Set(o.nodes)].map(withType).sort(cmpRef);
  const label = (id: string): string => id.slice(2);
  const seen = new Set<string>();
  const edges = (o.edges ?? []).map(([s, rel, t]) => {
    let src = withType(s), tgt = withType(t);
    if (!directed && cmpRef(src, tgt) > 0) [src, tgt] = [tgt, src];
    return { src, rel, tgt };
  }).filter((e) => { const k = JSON.stringify(e); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => cmpRef(a.src, b.src) || compareUtf8(a.rel, b.rel) || cmpRef(a.tgt, b.tgt));
  return canonicalBytes({
    address_scheme: "igs-addr/1",
    edges: edges.map((e) => ({ label: e.rel, ref: { ord: "0", rel: e.rel, src: e.src, tgt: e.tgt } })),
    graph: { directed, profile: "simple" },
    igs: "IGS/1",
    nodes: nodes.map((n) => ({ category: n.type, label: label(n.id), ref: n })),
    source: { artifact_sha256: "a".repeat(64), serialization_profile: "ison-v1" },
  } as never);
}

/** An igl-fixed/1 layout for the scene (positions by node index unless given: `pos[wireId] = [x, y]` in layout integers). */
export async function mkLayout(sceneBytes: Uint8Array, pos: Record<string, [number, number]> = {}, type = "t"): Promise<Uint8Array> {
  const scene = JSON.parse(dec(sceneBytes)) as { nodes: { ref: { id: string; type: string } }[] };
  const nodes = scene.nodes.map((n, i) => { const p = pos[n.ref.id] ?? [i * 10, (i * -7) || 0]; return { ref: { id: n.ref.id, type }, x: p[0], y: p[1] }; });
  return canonicalBytesSigned({
    address_scheme: "igs-addr/1", igl: "IGL/1", nodes,
    policy: { algorithm: "igl-fixed/1", config: {}, family: "FIXED" }, scale: 1000, scene_sha256: await sha256Hex(sceneBytes),
  } as never);
}

export interface World { sceneBytes: Uint8Array; layoutBytes: Uint8Array; sceneSha256: string; layoutSha256: string }
export async function world(o: { directed?: boolean; nodes: string[]; edges?: EdgeSpec[]; pos?: Record<string, [number, number]>; type?: string }): Promise<World> {
  const sceneBytes = mkScene(o);
  const layoutBytes = await mkLayout(sceneBytes, o.pos ?? {}, o.type ?? "t");
  return { sceneBytes, layoutBytes, sceneSha256: await sha256Hex(sceneBytes), layoutSha256: await sha256Hex(layoutBytes) };
}
void nodeOf;

// ------------------------------------------------------------------ bytes printed in design 29 section 14 (read from the document, not retyped)
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const DOC = fileURLToPath(new URL("../../../docs/isongraph-visualize-blueprint/29-LOD-DESIGN.md", import.meta.url));
/** The design document is git-ignored (kept local), so a clean clone (CI) does not have it: tests that compare against its printed bytes then check the pinned hash and length only. */
export const DOC_PRESENT = existsSync(DOC);
let docLinesCache: string[] | undefined;
/** The fenced one-line JSON blocks of the document starting with `prefix`. */
export function docJsonLines(prefix: string): string[] {
  docLinesCache ??= readFileSync(DOC, "utf8").split(/\r?\n/);
  return docLinesCache.filter((l) => l.startsWith(prefix));
}
export const DOC_VIEWS = (): string[] => docJsonLines('{"address_scheme":"igs-addr/1","aggregate_edges"');
export const DOC_STATES = (): string[] => docJsonLines('{"collapsed":');
