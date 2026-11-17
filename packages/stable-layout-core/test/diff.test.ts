import { IgsError } from "isongraph-visualize-scene-core";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { describe, expect, it } from "vitest";
import { diffScenes } from "../src/index.js";
import { SPEC_A, SPEC_B, SPEC_C, SPEC_PREV, cr, sceneBytes, sha, text, type SceneSpec } from "./helpers.js";

const d = (a: SceneSpec, b: SceneSpec, opts?: Parameters<typeof diffScenes>[2]) => Promise.all([sceneBytes(a), sceneBytes(b)]).then(([x, y]) => diffScenes(x, y, opts));
const ids = (l: readonly { id: string }[]): string[] => l.map((r) => r.id);
const n = (id: string): { id: string; type: string } => ({ id, type: "n" });

describe("diffScenes: typed addresses only (section 3)", () => {
  it("TD01 identical scene", async () => {
    const r = await d(SPEC_PREV, SPEC_PREV);
    expect(r.identical).toBe(true);
    expect(ids(r.nodes.kept)).toEqual(["i:1", "i:2", "i:3", "i:6"]);
    expect(r.nodes.added).toEqual([]);
    expect(r.nodes.removed).toEqual([]);
    expect(r.edges).toEqual({ added: [], common: 3, removed: [] });
    expect(r.directed).toEqual({ next: true, previous: true });
    expect(r.igls_diff).toBe("IGLS-DIFF/1");
    expect(Object.keys(r).sort()).toEqual(["directed", "edges", "identical", "igls_diff", "nodes"]);
  });
  it("TD02 pure removal: the node and its incident edges", async () => {
    const r = await d(SPEC_PREV, SPEC_B);
    expect(ids(r.nodes.removed)).toEqual(["i:3"]);
    expect(r.nodes.added).toEqual([]);
    expect(ids(r.nodes.kept)).toEqual(["i:1", "i:2", "i:6"]);
    expect(r.edges.common).toBe(1);
    expect(r.edges.removed).toEqual([
      { ord: "0", rel: "e", src: n("i:2"), tgt: n("i:3") },
      { ord: "0", rel: "e", src: n("i:3"), tgt: n("i:6") },
    ]);
    expect(r.edges.added).toEqual([]);
    expect(r.identical).toBe(false);
  });
  it("TD03 pure addition", async () => {
    const r = await d(SPEC_PREV, SPEC_A);
    expect(ids(r.nodes.added)).toEqual(["i:4"]);
    expect(r.nodes.removed).toEqual([]);
    expect(r.edges.added).toEqual([{ ord: "0", rel: "e", src: n("i:1"), tgt: n("i:4") }]);
    expect(r.edges.common).toBe(3);
  });
  it("section 5.6 Case C: kept 2,3,6 removed 1 added 4,5; edges common 2", async () => {
    const r = await d(SPEC_PREV, SPEC_C);
    expect(ids(r.nodes.kept)).toEqual(["i:2", "i:3", "i:6"]);
    expect(ids(r.nodes.removed)).toEqual(["i:1"]);
    expect(ids(r.nodes.added)).toEqual(["i:4", "i:5"]);
    expect(r.edges.common).toBe(2);
    expect(r.edges.added.map((e) => `${e.src.id}>${e.tgt.id}`)).toEqual(["i:2>i:4", "i:3>i:4", "i:4>i:5"]);
    expect(r.edges.removed.map((e) => `${e.src.id}>${e.tgt.id}`)).toEqual(["i:1>i:2"]);
  });
  it("TD04 a rename is a removal plus an addition (labels are not compared)", async () => {
    const r = await d({ tag: "a", nodes: [["person", "s:ann"]] }, { tag: "b", nodes: [["person", "s:anne"]] });
    expect(r.nodes.kept).toEqual([]);
    expect(r.nodes.removed).toEqual([{ id: "s:ann", type: "person" }]);
    expect(r.nodes.added).toEqual([{ id: "s:anne", type: "person" }]);
  });
  it("TD05 id twin: i:7 and s:7 of one type are different nodes", async () => {
    const r = await d({ tag: "a", nodes: ["i:7"] }, { tag: "b", nodes: ["s:7"] });
    expect(r.nodes.kept).toEqual([]);
    expect(ids(r.nodes.removed)).toEqual(["i:7"]);
    expect(ids(r.nodes.added)).toEqual(["s:7"]);
  });
  it("TD06 twin survives: previous {i:7, s:7}, new {s:7}", async () => {
    const r = await d({ tag: "a", nodes: ["i:7", "s:7"] }, { tag: "b", nodes: ["s:7"] });
    expect(ids(r.nodes.kept)).toEqual(["s:7"]);
    expect(ids(r.nodes.removed)).toEqual(["i:7"]);
    expect(r.nodes.added).toEqual([]);
  });
  it("TD07 same id, different type", async () => {
    const r = await d({ tag: "a", nodes: [["t", "i:1"]] }, { tag: "b", nodes: [["u", "i:1"]] });
    expect(r.nodes.kept).toEqual([]);
    expect(r.nodes.removed).toEqual([{ id: "i:1", type: "t" }]);
    expect(r.nodes.added).toEqual([{ id: "i:1", type: "u" }]);
  });
  it("TD08 edge-only change", async () => {
    const r = await d({ tag: "a", nodes: ["i:1", "i:2", "i:3"], edges: [["i:1", "e", "i:2"]] }, { tag: "b", nodes: ["i:1", "i:2", "i:3"], edges: [["i:2", "e", "i:3"]] });
    expect(ids(r.nodes.kept)).toEqual(["i:1", "i:2", "i:3"]);
    expect(r.nodes.added.length + r.nodes.removed.length).toBe(0);
    expect(r.edges.common).toBe(0);
    expect(r.edges.added.length).toBe(1);
    expect(r.edges.removed.length).toBe(1);
  });
  it("TD09 directedness flip: stored addresses are compared and both flags recorded", async () => {
    const dir = { tag: "a", directed: true, nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"], ["i:2", "e", "i:1"]] as SceneSpec["edges"] };
    const und = { tag: "b", directed: false, nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] as SceneSpec["edges"] };
    const r = await d(dir, und);
    expect(r.directed).toEqual({ next: false, previous: true });
    expect(r.edges.common).toBe(1); // 1->2 is stored identically in both
    expect(r.edges.removed).toEqual([{ ord: "0", rel: "e", src: n("i:2"), tgt: n("i:1") }]);
    const flipped = await d({ ...und, tag: "c" }, { tag: "d", directed: true, nodes: ["i:1", "i:2"], edges: [["i:2", "e", "i:1"]] });
    expect(flipped.edges.common).toBe(0);
    expect(flipped.edges.added.length).toBe(1);
    expect(flipped.edges.removed.length).toBe(1);
  });
  it("TD10 an undirected self-loop is kept", async () => {
    const s: SceneSpec = { tag: "a", directed: false, nodes: ["i:1"], edges: [["i:1", "e", "i:1"]] };
    const r = await d(s, { ...s, tag: "b" });
    expect(r.edges).toEqual({ added: [], common: 1, removed: [] });
  });
  it("TD11 UTF-8 byte order, not UTF-16 order (U+FF5E sorts before U+1F600 in UTF-8, after it in UTF-16)", async () => {
    const r = await d({ tag: "a", nodes: [] }, { tag: "b", nodes: ["s:～", "s:😀"] });
    expect(ids(r.nodes.added)).toEqual(["s:～", "s:😀"]);
    expect(["s:～", "s:😀"].sort()).toEqual(["s:😀", "s:～"]); // the trap this test guards against
  });
  it("TD12 empty to empty and TD13 empty previous to non-empty", async () => {
    const e = await d({ tag: "a", nodes: [] }, { tag: "b", nodes: [] });
    expect(e.nodes).toEqual({ added: [], kept: [], removed: [] });
    expect(e.identical).toBe(false); // the scene hashes differ (different source hash)
    const f = await d({ tag: "a", nodes: [] }, SPEC_A);
    expect(f.nodes.kept).toEqual([]);
    expect(f.nodes.added.length).toBe(5);
    expect(f.edges.added.length).toBe(4);
    expect(f.edges.common).toBe(0);
  });
  it("TD14 a renamed relation with the nodes kept", async () => {
    const r = await d({ tag: "a", nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] }, { tag: "b", nodes: ["i:1", "i:2"], edges: [["i:1", "f", "i:2"]] });
    expect(r.nodes.kept.length).toBe(2);
    expect(r.edges.common).toBe(0);
    expect(r.edges.added[0]!.rel).toBe("f");
    expect(r.edges.removed[0]!.rel).toBe("e");
  });
  it("TD15 same graph, different source.artifact_sha256: empty diff, different scene hashes, not identical", async () => {
    const r = await d(SPEC_PREV, { ...SPEC_PREV, tag: "other-source" });
    expect(r.nodes.added).toEqual([]);
    expect(r.nodes.removed).toEqual([]);
    expect(r.edges).toEqual({ added: [], common: 3, removed: [] });
    expect(r.identical).toBe(false);
    expect(await sha(await sceneBytes(SPEC_PREV))).not.toBe(await sha(await sceneBytes({ ...SPEC_PREV, tag: "other-source" })));
  });
  it("TD16 diff(A,B) twice is byte identical; diff(B,A) swaps added and removed and keeps kept", async () => {
    const ab1 = canonicalBytesSigned((await d(SPEC_PREV, SPEC_C)) as unknown as CJValue);
    const ab2 = canonicalBytesSigned((await d(SPEC_PREV, SPEC_C)) as unknown as CJValue);
    expect(text(ab1)).toBe(text(ab2));
    const ba = await d(SPEC_C, SPEC_PREV);
    const ab = await d(SPEC_PREV, SPEC_C);
    expect(ba.nodes.added).toEqual(ab.nodes.removed);
    expect(ba.nodes.removed).toEqual(ab.nodes.added);
    expect(ba.nodes.kept).toEqual(ab.nodes.kept);
    expect(ba.edges.added).toEqual(ab.edges.removed);
    expect(ba.edges.removed).toEqual(ab.edges.added);
    expect(ba.edges.common).toBe(ab.edges.common);
  });
  it("canonical form of section 3.1 (closed, IGL-CJ/1, snake_case keys)", async () => {
    const r = await d({ tag: "a", nodes: ["i:1"] }, { tag: "b", nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] });
    expect(text(canonicalBytesSigned(r as unknown as CJValue))).toBe(
      '{"directed":{"next":true,"previous":true},"edges":{"added":[{"ord":"0","rel":"e","src":{"id":"i:1","type":"n"},"tgt":{"id":"i:2","type":"n"}}],"common":0,"removed":[]},"identical":false,"igls_diff":"IGLS-DIFF/1","nodes":{"added":[{"id":"i:2","type":"n"}],"kept":[{"id":"i:1","type":"n"}],"removed":[]}}',
    );
  });
  it("scene errors propagate unchanged (IgsError)", async () => {
    await expect(diffScenes(new TextEncoder().encode("{}"), await sceneBytes(SPEC_A))).rejects.toBeInstanceOf(IgsError);
  });
  it("diffScenes charges C1 against maxWork: previous 4+3 nodes... C1 = n_prev + n_next + 2(e_prev + e_next) + n_kept", async () => {
    // prev (4 nodes, 3 edges) vs A (5 nodes, 4 edges), kept 4: 4 + 5 + 2*7 + 4 = 27
    expect(await cr(() => d(SPEC_PREV, SPEC_A, { budget: { maxWork: 27 } }))).toBe("no error");
    expect(await cr(() => d(SPEC_PREV, SPEC_A, { budget: { maxWork: 26 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
});
