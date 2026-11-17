import { describe, expect, it } from "vitest";
import { deriveViewDetailed } from "../src/derive.js";
import { classTerms, lg, shaBlocks, type WorkInputs } from "../src/work.js";
import { collapseGroup, emptyState } from "../src/builders.js";
import { serializeLODState } from "../src/state.js";
import { resolveInScene } from "isongraph-visualize-scene-core";
import { deriveView } from "../src/derive.js";
import { suggestGroups } from "../src/rules.js";
import { baseState, bytes, dec, enc, errOf, example, mkScene, ref, refs, world, LABEL_POLICY } from "./helpers.js";

describe("INTERNAL paths by mocks (B13)", () => {
  it("INTERNAL/ID_COLLISION when two groups hash to one id", async () => {
    const e = await example();
    const st = bytes(baseState({ collapsed: [{ members: refs("i:1", "i:2") }, { members: refs("s:d", "s:e") }] }));
    expect(await errOf(() => deriveViewDetailed(e.sceneBytes, e.layoutBytes, st, undefined, { sha256: async () => "0".repeat(64) }))).toBe("INTERNAL/ID_COLLISION");
  });
  it("INTERNAL/CONSERVATION when the derived view loses a node or an edge", async () => {
    const e = await example();
    const st = bytes(baseState({ collapsed: [{ members: refs("s:d", "s:e") }] }));
    expect(await errOf(() => deriveViewDetailed(e.sceneBytes, e.layoutBytes, st, undefined, { mutateView: (v) => { v.nodes.pop(); } }))).toBe("INTERNAL/CONSERVATION");
    expect(await errOf(() => deriveViewDetailed(e.sceneBytes, e.layoutBytes, st, undefined, { mutateView: (v) => { v.edges.pop(); } }))).toBe("INTERNAL/CONSERVATION");
    expect(await errOf(() => deriveViewDetailed(e.sceneBytes, e.layoutBytes, st, undefined, { mutateView: (v) => { v.aggregate_edges[0]!.count++; } }))).toBe("INTERNAL/CONSERVATION");
    expect(await errOf(() => deriveViewDetailed(e.sceneBytes, e.layoutBytes, st, undefined, { mutateView: () => undefined }))).toBe("no error");
  });
  it("a view is never returned from a failed conservation check (no partial output)", async () => {
    const e = await example();
    const st = bytes(baseState({ collapsed: [{ members: refs("s:d", "s:e") }] }));
    await expect(deriveViewDetailed(e.sceneBytes, e.layoutBytes, st, undefined, { mutateView: (v) => { v.nodes.pop(); } })).rejects.toBeDefined();
  });
  it("INTERNAL/WORK_MODEL when a counter exceeds its term, never a silent overrun", async () => {
    const e = await example();
    const st = bytes(baseState());
    for (const cls of ["nodes", "edges", "members", "pins", "aggSort", "itemSort", "relSort", "keys", "idHash", "stateHash", "viewHash", "serialize", "stateBytes"] as const) {
      expect(await errOf(() => deriveViewDetailed(e.sceneBytes, e.layoutBytes, st, undefined, { bumpTicks: (m) => m.add(cls, 1_000_000) })), cls).toBe("INTERNAL/WORK_MODEL");
    }
  });
  it("the worked examples stay far below their terms class by class (ticks recorded)", async () => {
    const e = await example();
    for (const mk of [() => baseState({ collapsed: [{ members: refs("s:d", "s:e") }] }), () => baseState({ collapsed: [{ label: "outer", members: refs("s:a", "s:b", "s:c", "s:d", "s:e") }, { members: refs("s:d", "s:e") }] })]) {
      const d = await deriveViewDetailed(e.sceneBytes, e.layoutBytes, bytes(mk()));
      for (const c of Object.keys(d.terms) as Array<keyof typeof d.terms>) expect(BigInt(d.ticks[c])).toBeLessThanOrEqual(d.terms[c]);
      expect(d.ticks.stateHash).toBe(shaBlocks(d.inputs.Hs));
    }
  });
});

describe("work formula properties", () => {
  const w = (o: Partial<WorkInputs> = {}): WorkInputs => ({ Hs: 400, n: 10, m: 20, M: 4, T: 1, G: 2, R: 3, Lrel: 5, Lkey: 20, Hids: 400, Hscene: 2000, Hlayout: 600, ...o });
  it("lg is the bit length, lg(0) = 0", () => { expect([0, 1, 2, 3, 4, 255, 256].map(lg)).toEqual([0, 1, 2, 2, 3, 8, 9]); });
  it("each term is non-decreasing in every input", () => {
    const base = classTerms(w());
    for (const k of ["Hs", "n", "m", "M", "T", "G", "R", "Lrel", "Lkey", "Hids", "Hscene", "Hlayout"] as const) {
      const up = classTerms(w({ [k]: w()[k] * 3 }));
      for (const c of Object.keys(base) as Array<keyof typeof base>) expect(up[c], `${k}/${c}`).toBeGreaterThanOrEqual(base[c]);
    }
  });
  it("relation terms vanish without edges (R = 0)", () => {
    expect(classTerms(w({ R: 0, m: 0, Lrel: 0 })).relSort).toBe(0n);
  });
});

describe("DD-1 (design defect, documented): the aggregate-id hash term is not an upper bound for every group length", () => {
  it("the section 11 claim ceil((L+9)/64) <= L/64 + 1 is false for L mod 64 in 55..63, so Sum blocks can exceed ceil(Hids/64) + G", () => {
    // 8 groups whose preimages are 184 bytes: 4 SHA-256 blocks each = 32, but the term is ceil(8*184/64) + 8 = 23 + 8 = 31
    const L = 184, G = 8;
    expect(shaBlocks(L) * G).toBe(32);
    expect(classTerms({ Hs: 400, n: 20, m: 0, M: 16, T: 0, G, R: 0, Lrel: 0, Lkey: 11, Hids: L * G, Hscene: 1, Hlayout: 1 }).idHash).toBe(31n);
  });
});

describe("DD-1 regression: realistic group families never trip INTERNAL/WORK_MODEL", () => {
  it("12 two-member groups with identifier lengths 3..30 (every preimage residue mod 64)", async () => {
    const { suggestGroups } = await import("../src/rules.js");
    for (let len = 3; len <= 30; len++) {
      const nodes: string[] = [], edges: Array<[string, string, string]> = [];
      for (let k = 0; k < 12; k++) {
        const host = "s:h" + String(k).padStart(2, "0"); nodes.push(host);
        for (const c of ["a", "b"]) { const leaf = ("s:" + String(k).padStart(2, "0") + c).padEnd(len + 2, "x"); nodes.push(leaf); edges.push([host, "r", leaf]); }
      }
      const w2 = await world({ nodes, edges });
      const cat = await suggestGroups(w2.sceneBytes, [{ rule: "pendant-fold/1", min_leaves: 2 }]);
      expect(cat.groups.length).toBe(12);
      const st = baseState({ scene_sha256: w2.sceneSha256, layout_sha256: w2.layoutSha256, collapsed: cat.groups });
      const d = await deriveViewDetailed(w2.sceneBytes, w2.layoutBytes, serializeLODState(st as never));
      expect(d.result.view.aggregates.length).toBe(12);
    }
  }, 60_000);
});

describe("limits and measured hazards (B14, recorded not claimed)", () => {
  it("identifiers of 1,000 and 16,384 UTF-16 units: derivation works and the counter stays within its terms (no latency claim)", async () => {
    for (const len of [1000, 16_384]) {
      const ids = ["s:" + "a".repeat(len - 2), "s:" + "b".repeat(len - 2), "s:c"];
      const w2 = await world({ nodes: ids, edges: [[ids[0]!, "r", ids[2]!], [ids[1]!, "r", ids[2]!]] });
      const st = baseState({ scene_sha256: w2.sceneSha256, layout_sha256: w2.layoutSha256, collapsed: [{ members: [ref(ids[0]!), ref(ids[1]!)] }], pinned: [ref(ids[2]!)] });
      const d = await deriveViewDetailed(w2.sceneBytes, w2.layoutBytes, serializeLODState(st as never));
      expect(d.result.view.aggregates[0]!.hidden.length).toBe(2);
      expect(d.inputs.Lkey).toBeGreaterThanOrEqual(len);
    }
  }, 60_000);
  it("FINDING DD-2: the key length of a pin lookup has no term in W, so it is not charged (a model gap, like the unmeasured Map hazard); derivation succeeds", async () => {
    const long = "s:" + "p".repeat(300);
    const w2 = await world({ nodes: [long, "s:a", "s:b"], edges: [[long, "r", "s:a"]] });
    const st = baseState({ scene_sha256: w2.sceneSha256, layout_sha256: w2.layoutSha256, pinned: [ref(long)] });
    const d = await deriveViewDetailed(w2.sceneBytes, w2.layoutBytes, serializeLODState(st as never));
    expect(d.ticks.pins).toBe(1);
    expect(d.result.view.nodes.find((n) => n.ref.id === long)!.label_level).toBe("full");
  });
  it("hard limit consistency: GROUP_LIMIT cannot be reached through deriveView at the default node budget (a laminar family has at most n-1 groups)", async () => {
    // 20,001 distinct groups need at least 20,002 nodes > the default maxNodes of 20,000
    const e = await example();
    const s = emptyState({ sceneSha256: e.sceneSha256, layoutSha256: e.layoutSha256, label_policy: LABEL_POLICY, zoom_milli: 0 });
    const t = collapseGroup(s, { members: refs("s:d", "s:e") });
    expect(t.collapsed.length).toBe(1);
  });
});

describe("propagated errors and namespaces", () => {
  it("X02 a scene with non-empty extensions is IgsError UNSUPPORTED_EXTENSION (propagated unchanged)", async () => {
    const e = await example();
    const scene = enc(JSON.stringify({ ...JSON.parse(dec(mkScene({ nodes: ["s:a"] }))), extensions: [{ id: "x" }] }));
    expect(await errOf(() => deriveView(scene, e.layoutBytes, bytes(baseState())))).toBe("IgsError:UNSUPPORTED_EXTENSION/");
    expect(await errOf(() => suggestGroups(scene, []))).toBe("IgsError:UNSUPPORTED_EXTENSION/");
  });
  it("A08 resolveInScene never returns an aggregate (a scene-core unit test)", async () => {
    const e = await example();
    const { verifyScene } = await import("isongraph-visualize-scene-core");
    const { scene } = await verifyScene(e.sceneBytes);
    expect(() => resolveInScene(scene, { id: "igagg1:" + "a".repeat(64), type: "t" })).toThrow(/UNRESOLVED_ADDRESS/);
    expect(() => resolveInScene(scene, { agg: "igagg1:" + "a".repeat(64) } as never)).toThrow();
  });
  it("B01 suggestGroups: INPUT_BYTES before any parse", async () => {
    expect(await errOf(() => suggestGroups(new Uint8Array(268_435_457), []))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
  }, 60_000);
  it("Z01-Z03 (rev 4): the size check comes right after the budget shape and before RULE_LIMIT and the specs; the size limit is inclusive", async () => {
    const nine = Array.from({ length: 9 }, () => ({ rule: "pendant-fold/1", min_leaves: 2 }));
    expect(await errOf(() => suggestGroups(new Uint8Array(268_435_457), nine as never))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    expect(await errOf(() => suggestGroups(new Uint8Array(268_435_456), nine as never))).toBe("RESOURCE_LIMIT/RULE_LIMIT");
    expect(await errOf(() => suggestGroups(new Uint8Array(268_435_457), [{ rule: "kcore/1" }] as never))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    expect(await errOf(() => suggestGroups(new Uint8Array(268_435_457), [] as never, { budget: { maxNodes: 0 } } as never))).toBe("INVALID_POLICY/INVALID_BUDGET");
  }, 120_000);
  it("rev 4: caller spec graphs are copied under the visit budget: a cycle is SCHEMA, an exponential alias is VISIT_LIMIT", async () => {
    const e2 = await example();
    const spec: Record<string, unknown> = { rule: "components/1", min_size: 2 };
    spec["x"] = spec;
    expect(await errOf(() => suggestGroups(e2.sceneBytes, [spec] as never))).toBe("INVALID_LOD/SCHEMA");
    let v: unknown = 1;
    for (let k = 0; k < 23; k++) v = { a: v, b: v }; // about 16.8M visits as a tree
    expect(await errOf(() => suggestGroups(e2.sceneBytes, [{ rule: "components/1", min_size: 2, extra: v }] as never))).toBe("RESOURCE_LIMIT/VISIT_LIMIT");
    expect(await errOf(() => suggestGroups(e2.sceneBytes, [{ rule: "components/1", min_size: 2 }]))).toBe("no error");
  });
});
