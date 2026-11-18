// Test-only random model generator (design 15.4 D rows): a seeded LCG, plain and hostile strings, FIXED layouts. Mirrors the kit's generator
// (renderer-core src/conformance/generate.ts), which does not export its random model.
import { verifyScene } from "isongraph-visualize-scene-core";
import { canonicalBytes, compareNodeRef, compareUtf8, nodeRefFromWire, sha256Hex } from "isongraph-visualize-scene-core/primitives";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, type RenderModel } from "isongraph-visualize-renderer-core";

export function lcg(seed: number): { int(n: number): number; pick<T>(a: readonly T[]): T; float(): number } {
  let s = seed >>> 0;
  const next = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  return { int: (n) => (next() >>> 8) % n, pick: (a) => a[(next() >>> 8) % a.length]!, float: () => (next() >>> 8) / 2 ** 24 };
}
export type Rng = ReturnType<typeof lcg>;

/** Scalar classes of 7.1: controls, DEL, C1, U+2028/9, bidi, astral, markup characters, LF, CR, TAB, spaces, XML-illegal scalars. */
const HOSTILE_POOL: readonly string[] = [
  "a", "Z", "0", " ", "\t", "\n", "\r", "\u0001", "\u0008", "\u000b", "\u000c", "\u001f", "\u007f", "\u0085", "\u2028", "\u2029", "\u202e", "\u2066", "\u200d", "\u0301",
  "<", ">", "&", '"', "'", "]]>", "-->", "&amp;", "</title>", "\\", "/", "😀", "\u{1f600}x", "é", "\ufffd", "\ufffe", "\uffff", "\ue000", "~",
];
export const hostileString = (rng: Rng, max: number): string => Array.from({ length: rng.int(max + 1) }, () => rng.pick(HOSTILE_POOL)).join("");
/** Identifiers (types, relations): no whitespace and none of `: | " \` (IGS 1.2), otherwise hostile. */
export const hostileIdentifier = (rng: Rng, max: number): string => {
  const pool = HOSTILE_POOL.filter((c) => !/[\s:|"\\]/u.test(c) && c !== "\u0085" && c !== "\u2028" && c !== "\u2029");
  const n = 1 + rng.int(max);
  return Array.from({ length: n }, () => rng.pick(pool)).join("");
};

export interface GenOptions { hostile?: boolean; maxNodes?: number }

export async function randomModel(seed: number, opts: GenOptions = {}): Promise<RenderModel> {
  const rng = lcg(seed ^ 0x5eed5eed);
  const hostile = opts.hostile === true;
  const types = Array.from({ length: 1 + rng.int(4) }, (_, i) => (hostile && i > 0 ? hostileIdentifier(rng, 5) : `t${i}`));
  const n = 1 + rng.int(opts.maxNodes ?? 30);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789 ";
  const seen = new Set<string>();
  const nodes: { category: string; label: string; ref: { id: string; type: string } }[] = [];
  for (let k = 0; k < n; k++) {
    const type = rng.pick(types);
    let id: string;
    if (!hostile && rng.int(2) === 0) id = `i:${rng.int(60) - 5}`;
    else id = "s:" + (hostile ? hostileString(rng, 12) : Array.from({ length: rng.int(9) }, () => alphabet[rng.int(alphabet.length)]!).join(""));
    const key = type + "\u0000" + id;
    if (seen.has(key)) continue;
    seen.add(key);
    nodes.push({ category: type, label: id.slice(2), ref: { id, type } });
  }
  nodes.sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref)));
  const directed = rng.int(2) === 0;
  const keys = new Set<string>();
  const edges: { label: string; ref: { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } } }[] = [];
  const want = rng.int(2 * nodes.length + 1);
  for (let k = 0; k < want * 3 && edges.length < want; k++) {
    let a = rng.int(nodes.length), b = rng.int(nodes.length);
    if (!directed && a > b) [a, b] = [b, a];
    const rel = hostile && rng.int(2) === 0 ? hostileIdentifier(rng, 4) : `r${rng.int(3)}`;
    const key = `${a}|${rel}|${b}`;
    if (keys.has(key)) continue;
    keys.add(key);
    edges.push({ label: rel, ref: { ord: "0", rel, src: { ...nodes[a]!.ref }, tgt: { ...nodes[b]!.ref } } });
  }
  edges.sort((x, y) => compareNodeRef(nodeRefFromWire(x.ref.src), nodeRefFromWire(y.ref.src)) || compareUtf8(x.ref.rel, y.ref.rel) || compareNodeRef(nodeRefFromWire(x.ref.tgt), nodeRefFromWire(y.ref.tgt)) || compareUtf8(x.ref.ord, y.ref.ord));
  const artifact = await sha256Hex(new TextEncoder().encode(String(seed >>> 0)));
  const scene = canonicalBytes({
    address_scheme: "igs-addr/1", edges, graph: { directed, profile: "simple" }, igs: "IGS/1", nodes,
    source: { artifact_sha256: artifact, serialization_profile: "ison-v1" },
  } as never);
  const sc = (await verifyScene(scene)).scene;
  const coords = sc.nodes.map((node) => ({ ref: node.ref, x: (rng.int(2_000_001) - 1_000_000) / 1000, y: (rng.int(2_000_001) - 1_000_000) / 1000 }));
  const lay = await computeFixedLayout(scene, coords);
  return buildRenderModel(scene, lay.layoutBytes);
}

/** `nodes` nodes whose ids are `s:` plus `idLen` characters (unique), one type, no edges, FIXED layout: a scene inside the dom capacity with a large document. */
export async function bigIdModel(nodes: number, idLen: number): Promise<RenderModel> {
  const list = Array.from({ length: nodes }, (_, k) => {
    const tag = String(k).padStart(6, "0");
    const id = "s:" + tag + "x".repeat(idLen - tag.length);
    return { category: "t", label: id.slice(2), ref: { id, type: "t" } };
  });
  list.sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref)));
  const scene = canonicalBytes({
    address_scheme: "igs-addr/1", edges: [], graph: { directed: false, profile: "simple" }, igs: "IGS/1", nodes: list,
    source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" },
  } as never);
  const sc = (await verifyScene(scene)).scene;
  const lay = await computeFixedLayout(scene, sc.nodes.map((n, k) => ({ ref: n.ref, x: k % 100, y: Math.floor(k / 100) })));
  return buildRenderModel(scene, lay.layoutBytes);
}
