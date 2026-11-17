import { describe, expect, it } from "vitest";
import { sha256Hex, IDENTIFIER } from "isongraph-visualize-scene-core/primitives";
import { verifyScene } from "isongraph-visualize-scene-core";
import { aggregatePreimage, deriveAggregateId, isAggregateId } from "../src/aggregate.js";
import { enc, errOf, ref, refs, SCENE_HASH } from "./helpers.js";

const INNER = "igagg1:1f0a7d87706cb0271fcb451e67c7be8e9df7fae0b751f527a1480891cc5ad1dc";
const OUTER = "igagg1:877702b4003afc31868a3ffc0d607bdf9760a13155cc275e732560e6be00083e";

describe("deriveAggregateId", () => {
  it("W01/W02 reproduces the ids of the worked examples", async () => {
    expect(await deriveAggregateId(SCENE_HASH, refs("s:d", "s:e"))).toBe(INNER);
    expect(await deriveAggregateId(SCENE_HASH, refs("s:a", "s:b", "s:c", "s:d", "s:e"))).toBe(OUTER);
  });
  it("the preimage is 163 and 235 bytes of key-sorted compact JSON", () => {
    const p = aggregatePreimage(SCENE_HASH, refs("s:d", "s:e"));
    expect(new TextDecoder().decode(p)).toBe(`{"agg":"IGLOD-AGG/1","members":[{"id":"s:d","type":"t"},{"id":"s:e","type":"t"}],"scene_sha256":"${SCENE_HASH}"}`);
    expect(p.length).toBe(163);
    expect(aggregatePreimage(SCENE_HASH, refs("s:a", "s:b", "s:c", "s:d", "s:e")).length).toBe(235);
  });
  it("A02 derived twice is identical; the id is sha256 of the preimage with the igagg1: prefix", async () => {
    const a = await deriveAggregateId(SCENE_HASH, refs("s:d", "s:e"));
    expect(a).toBe(await deriveAggregateId(SCENE_HASH, refs("s:d", "s:e")));
    expect(a).toBe("igagg1:" + (await sha256Hex(aggregatePreimage(SCENE_HASH, refs("s:d", "s:e")))));
    expect(a.length).toBe(71);
  });
  it("members are sorted internally: order of the argument does not matter", async () => {
    expect(await deriveAggregateId(SCENE_HASH, refs("s:e", "s:d"))).toBe(INNER);
  });
  it("A03 another scene gives another id", async () => {
    expect(await deriveAggregateId("0".repeat(64), refs("s:d", "s:e"))).not.toBe(INNER);
  });
  it("A04 id twins {i:7, s:7} and {i:7, s:8} differ", async () => {
    expect(await deriveAggregateId(SCENE_HASH, refs("i:7", "s:7"))).not.toBe(await deriveAggregateId(SCENE_HASH, refs("i:7", "s:8")));
  });
  it("A12 members whose UTF-8 and UTF-16 orders differ hash in NodeRef/2 (UTF-8) order", async () => {
    const lo = ref("s:\uFF5E"), hi = ref("s:\u{1F600}");
    const expected = `{"agg":"IGLOD-AGG/1","members":[{"id":"s:\uFF5E","type":"t"},{"id":"s:\u{1F600}","type":"t"}],"scene_sha256":"${SCENE_HASH}"}`;
    const want = "igagg1:" + (await sha256Hex(enc(expected)));
    expect(await deriveAggregateId(SCENE_HASH, [hi, lo])).toBe(want);
    expect(await deriveAggregateId(SCENE_HASH, [lo, hi])).toBe(want);
  });
  it("rejects duplicates, aggregate refs, bad refs and bad hashes", async () => {
    expect(await errOf(() => deriveAggregateId(SCENE_HASH, refs("s:d", "s:d")))).toBe("INVALID_GROUP/DUPLICATE_MEMBER");
    expect(await errOf(() => deriveAggregateId(SCENE_HASH, [{ agg: INNER } as never, ref("s:d")]))).toBe("INVALID_GROUP/AGGREGATE_AS_MEMBER");
    expect(await errOf(() => deriveAggregateId(SCENE_HASH, [{ id: "x", type: "t" }]))).toBe("INVALID_LOD/INVALID_ID");
    expect(await errOf(() => deriveAggregateId("ABC", refs("s:d", "s:e")))).toBe("INVALID_LOD/INVALID_HASH");
    expect(await errOf(() => deriveAggregateId(SCENE_HASH, "nope" as never))).toBe("INVALID_LOD/SCHEMA");
  });
  it("Z16/Z17 (rev 4): any member count is accepted, including 0 and 1", async () => {
    expect(await deriveAggregateId(SCENE_HASH, [])).toBe("igagg1:b1e79a39f4c99cc4dfe4e68b8361efb3028c59d15ae40cfd09251baf5ea045e5");
    expect(await deriveAggregateId(SCENE_HASH, refs("s:a"))).toBe("igagg1:006f09658f08dddcbbef1c32072449dc764182b05dc643bc1620adb73ca72568");
    expect(aggregatePreimage(SCENE_HASH, []).length).toBe(116);
    expect(aggregatePreimage(SCENE_HASH, refs("s:a")).length).toBe(139);
  });
  it("snapshots the members before the first await", async () => {
    const m = refs("s:d", "s:e");
    const p = deriveAggregateId(SCENE_HASH, m);
    m[0] = ref("s:a");
    expect(await p).toBe(INNER);
  });
});

describe("isAggregateId and distinguishability", () => {
  it("A11 exact match only", () => {
    expect(isAggregateId(INNER)).toBe(true);
    expect(isAggregateId(INNER + "\n")).toBe(false);
    expect(isAggregateId("\n" + INNER)).toBe(false);
    expect(isAggregateId(INNER.toUpperCase())).toBe(false);
    expect(isAggregateId(INNER.slice(0, -1))).toBe(false);
    expect(isAggregateId("igagg2:" + "a".repeat(64))).toBe(false);
    expect(isAggregateId(5 as never)).toBe(false);
  });
  it("A05/A06 an aggregate id is neither a valid node id nor a valid type (real scene verifier)", async () => {
    expect(IDENTIFIER.test(INNER)).toBe(false); // contains ':'
    const scene = (id: string, type: string) => {
      const nodes = [{ category: type, label: id.slice(2), ref: { id, type } }];
      return enc(JSON.stringify({ address_scheme: "igs-addr/1", edges: [], graph: { directed: true, profile: "simple" }, igs: "IGS/1", nodes, source: { artifact_sha256: SCENE_HASH, serialization_profile: "ison-v1" } }));
    };
    await expect(verifyScene(scene(INNER, "t"))).rejects.toMatchObject({ reason: "INVALID_ID" });
    await expect(verifyScene(scene("s:x", INNER))).rejects.toMatchObject({ reason: "INVALID_IDENTIFIER" });
    // A09: a scene node whose id text begins igagg1: has wire id s:igagg1:... and is valid and distinct
    await expect(verifyScene(scene("s:" + INNER, "t"))).resolves.toBeDefined();
  });
});
