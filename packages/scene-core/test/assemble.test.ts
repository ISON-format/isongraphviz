// packages/scene-core/test/assemble.test.ts
import { describe, expect, it } from "vitest";
import { assembleScene, sceneToBytes } from "../src/assemble.js";
import { sha256Hex } from "../src/hash.js";
import type { NodeRef, SceneModel } from "../src/types.js";
import { bytesOf, hex, igsError } from "./helpers.js";

const i = (type: string, v: bigint): NodeRef => ({ type, id: { kind: "int", value: v } });
const s = (type: string, v: string): NodeRef => ({ type, id: { kind: "str", value: v } });

describe("assembleScene against the frozen oracles", () => {
  it("O1: int vs string id, key order, edge address", async () => {
    const model: SceneModel = { directed: true, nodes: [s("person", "ann"), i("person", 1n)], edges: [{ src: i("person", 1n), rel: "KNOWS", tgt: s("person", "ann") }] };
    const scene = assembleScene(await sha256Hex(bytesOf("o1-basic.source.ison")), model);
    expect(hex(sceneToBytes(scene))).toBe(hex(bytesOf("o1-basic.scene.json")));
    expect(await sha256Hex(sceneToBytes(scene))).toBe("e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc");
  });

  it("O2: INT64 extremes, numeric order and UTF-8 string order, supplied shuffled", async () => {
    const nodes = [s("p", "\u{1F600}"), i("p", 10n), s("p", "～"), i("p", 9223372036854775807n), s("p", "007"), i("p", -5n), s("p", "é"), i("p", 2n), i("p", -9223372036854775808n)];
    const edges = [{ src: i("p", 10n), rel: "R", tgt: i("p", -5n) }, { src: i("p", -9223372036854775808n), rel: "R", tgt: i("p", 2n) }];
    const scene = assembleScene(await sha256Hex(bytesOf("o2-ids-ordering.source.ison")), { directed: true, nodes, edges });
    expect(hex(sceneToBytes(scene))).toBe(hex(bytesOf("o2-ids-ordering.scene.json")));
    expect(await sha256Hex(sceneToBytes(scene))).toBe("8507fcba55d7d8e1d569357d5bcabadad99d8dddad875c80c077b6560bf1ff20");
  });

  it("O4: undirected edges are written with canonical endpoint order, self-loop kept", async () => {
    const model: SceneModel = { directed: false, nodes: [i("p", 2n), i("p", 1n)], edges: [{ src: i("p", 2n), rel: "R", tgt: i("p", 1n) }, { src: i("p", 2n), rel: "R", tgt: i("p", 2n) }] };
    const scene = assembleScene(await sha256Hex(bytesOf("o4-undirected.source.ison")), model);
    expect(hex(sceneToBytes(scene))).toBe(hex(bytesOf("o4-undirected.scene.json")));
    expect(await sha256Hex(sceneToBytes(scene))).toBe("13b1ede37d266246ef80082426eb3a08a9c24e164ac2e8bc44cb3ff2b2fa9b09");
  });
});

describe("assembleScene validity", () => {
  const sha = "0".repeat(64);
  it("rejects duplicate nodes, duplicate edges and dangling endpoints", () => {
    expect(igsError(() => assembleScene(sha, { directed: true, nodes: [i("p", 1n), i("p", 1n)], edges: [] })).code).toBe("DUPLICATE_NODE");
    const e = { src: i("p", 1n), rel: "R", tgt: i("p", 2n) };
    expect(igsError(() => assembleScene(sha, { directed: true, nodes: [i("p", 1n), i("p", 2n)], edges: [e, e] })).code).toBe("DUPLICATE_EDGE");
    expect(igsError(() => assembleScene(sha, { directed: true, nodes: [i("p", 1n)], edges: [e] })).code).toBe("INVALID_EDGE_ENDPOINT");
  });

  it("rejects what verifyScene would reject: bad identifiers and strings no JSON text can carry", () => {
    const ok = i("p", 1n);
    for (const type of ["", "a b", "a:b", "a|b", 'a"b', "a\\b", "a\tb", "\ud800"]) {
      const e = igsError(() => assembleScene(sha, { directed: true, nodes: [{ type, id: ok.id }], edges: [] }));
      expect(e.code, JSON.stringify(type)).toBe("INVALID_SCENE");
      expect(["INVALID_IDENTIFIER", "INVALID_STRING"], JSON.stringify(type)).toContain(e.reason);
    }
    for (const rel of ["", "bad rel", "a:b"]) {
      const e = igsError(() => assembleScene(sha, { directed: true, nodes: [ok], edges: [{ src: ok, rel, tgt: ok }] }));
      expect([e.code, e.reason], JSON.stringify(rel)).toEqual(["INVALID_SCENE", "INVALID_IDENTIFIER"]);
    }
    const lone = igsError(() => assembleScene(sha, { directed: true, nodes: [s("p", "\ud800")], edges: [] }));
    expect([lone.code, lone.reason]).toEqual(["INVALID_SCENE", "INVALID_STRING"]);
    expect(igsError(() => assembleScene(sha, { directed: true, nodes: [i("p", 9223372036854775808n)], edges: [] })).code).toBe("INVALID_NODE_ID");
  });

  it("rejects an artifact hash that is not 64 lowercase hex digits", () => {
    expect(igsError(() => assembleScene("ABC", { directed: true, nodes: [], edges: [] })).code).toBe("INVALID_SCENE");
  });

  it("produces an empty but valid scene for an empty model", () => {
    const sc = assembleScene(sha, { directed: true, nodes: [], edges: [] });
    expect(sc.nodes).toEqual([]);
    expect(sc.edges).toEqual([]);
  });
});
