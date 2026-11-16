// packages/scene-core/test/resolve.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileScene } from "../src/compile.js";
import { resolveInScene, resolveInSource } from "../src/resolve.js";
import type { ObjectRef } from "../src/types.js";
import { bytesOf, igsError, igsErrorAsync, ORACLES } from "./helpers.js";

const enc = (s: string) => new TextEncoder().encode(s);
const accepted = ["o1-basic.source.ison", "o4-undirected.source.ison", ...readFileSync(join(ORACLES, "fixtures/EXPECT.tsv"), "utf8").trim().split("\n").slice(1).map((l) => l.split("\t") as [string, string, string, string]).filter((r) => r[1] === "accept").map((r) => `fixtures/${r[0]}`)];

describe("resolveInScene returns the stored scene object", () => {
  it("returns the very SceneNode or SceneEdge of the scene, not the caller's address object", async () => {
    const { scene } = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    const addressCopy = structuredClone(scene.nodes[0]!.ref);
    const got = resolveInScene(scene, addressCopy);
    expect(got).toBe(scene.nodes[0]);
    expect(got).not.toBe(addressCopy);
    expect(resolveInScene(scene, structuredClone(scene.edges[0]!.ref))).toBe(scene.edges[0]);
  });

  it("reports UNRESOLVED_ADDRESS for an absent, a malformed and a non-canonical undirected address", async () => {
    const o1 = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    expect(igsError(() => resolveInScene(o1.scene, { id: "i:99", type: "person" })).code).toBe("UNRESOLVED_ADDRESS");
    expect(igsError(() => resolveInScene(o1.scene, { id: "bogus", type: "person" })).code).toBe("UNRESOLVED_ADDRESS");
    expect(igsError(() => resolveInScene(o1.scene, null as never)).code).toBe("UNRESOLVED_ADDRESS");
    const o4 = await compileScene(bytesOf("o4-undirected.source.ison"), "ison-v1");
    const e = o4.scene.edges[0]!.ref;
    expect(igsError(() => resolveInScene(o4.scene, { ord: e.ord, rel: e.rel, src: e.tgt, tgt: e.src })).code).toBe("UNRESOLVED_ADDRESS");
  });
});

describe("round-trip: every object of a compiled scene resolves back to the source", () => {
  for (const f of accepted) {
    it(f, async () => {
      const bytes = bytesOf(f);
      const { scene, artifactSha256 } = await compileScene(bytes, "ison-v1");
      for (const n of scene.nodes) {
        const r = await resolveInSource(bytes, { artifact_sha256: artifactSha256, address: n.ref });
        expect(r).toEqual({ kind: "node", address: n.ref, artifact_sha256: artifactSha256 });
      }
      for (const e of scene.edges) {
        const r = await resolveInSource(bytes, { artifact_sha256: artifactSha256, address: e.ref });
        expect(r).toEqual({ kind: "edge", address: e.ref, artifact_sha256: artifactSha256 });
      }
    });
  }
});

describe("typed identity survives compile and resolve (adapter rule A6, end to end)", () => {
  it("string id that looks numeric: compile, then resolve in source", async () => {
    const src = enc('nodes.p\nid\n"9007199254740993"\n1\n\nedges.R\nsource target\n:p:9007199254740993 :p:1\n');
    const { scene, artifactSha256 } = await compileScene(src, "ison-v1");
    expect(scene.edges[0]!.ref.src).toEqual({ id: "s:9007199254740993", type: "p" });
    const node = await resolveInSource(src, { artifact_sha256: artifactSha256, address: { id: "s:9007199254740993", type: "p" } });
    expect(node.kind).toBe("node");
    const edge = await resolveInSource(src, { artifact_sha256: artifactSha256, address: scene.edges[0]!.ref });
    expect(edge.kind).toBe("edge");
    // the INT64 with the same digits is a different identity and is not in this artifact
    const miss = await igsErrorAsync(() => resolveInSource(src, { artifact_sha256: artifactSha256, address: { id: "i:9007199254740993", type: "p" } }));
    expect(miss.code).toBe("UNRESOLVED_ADDRESS");
  });

  it("integer tokens -0 and 007 resolve as the integers 0 and 7, and the string 007 is a different identity", async () => {
    const ints = enc("nodes.p\nid\n-0\n007\n");
    const a = await compileScene(ints, "ison-v1");
    for (const id of ["i:0", "i:7"]) {
      expect((await resolveInSource(ints, { artifact_sha256: a.artifactSha256, address: { id, type: "p" } })).kind, id).toBe("node");
    }
    expect((await igsErrorAsync(() => resolveInSource(ints, { artifact_sha256: a.artifactSha256, address: { id: "s:007", type: "p" } }))).code).toBe("UNRESOLVED_ADDRESS");
    // the quoted 007 is a string id: it cannot coexist with the integer 7 in one type (adapter id-twin rule), so it gets its own artifact
    const str = enc('nodes.p\nid\n"007"\n');
    const b = await compileScene(str, "ison-v1");
    expect((await resolveInSource(str, { artifact_sha256: b.artifactSha256, address: { id: "s:007", type: "p" } })).kind).toBe("node");
    expect((await igsErrorAsync(() => resolveInSource(str, { artifact_sha256: b.artifactSha256, address: { id: "i:7", type: "p" } }))).code).toBe("UNRESOLVED_ADDRESS");
  });
});

describe("resolveInSource failures and the input snapshot", () => {
  it("rejects bytes that do not hash to the reference", async () => {
    const o1 = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    const e = await igsErrorAsync(() => resolveInSource(bytesOf("o4-undirected.source.ison"), { artifact_sha256: o1.artifactSha256, address: o1.scene.nodes[0]!.ref }));
    expect(e.code).toBe("SOURCE_MISMATCH");
  });

  it("reports UNRESOLVED_ADDRESS for an absent object and for a malformed address", async () => {
    const bytes = bytesOf("o1-basic.source.ison");
    const { artifactSha256 } = await compileScene(bytes, "ison-v1");
    expect((await igsErrorAsync(() => resolveInSource(bytes, { artifact_sha256: artifactSha256, address: { id: "i:99", type: "person" } }))).code).toBe("UNRESOLVED_ADDRESS");
    expect((await igsErrorAsync(() => resolveInSource(bytes, { artifact_sha256: artifactSha256, address: { id: "bogus", type: "person" } }))).code).toBe("UNRESOLVED_ADDRESS");
  });

  it("resolves against the bytes it was given, even if the caller mutates the array while the call is pending", async () => {
    const bytes = bytesOf("o1-basic.source.ison").slice();
    const { scene, artifactSha256 } = await compileScene(bytes, "ison-v1");
    const pending = resolveInSource(bytes, { artifact_sha256: artifactSha256, address: scene.nodes[0]!.ref });
    bytes.fill(0x23); // the call has returned its promise but has not finished
    expect((await pending).kind).toBe("node");
  });

  it("rejects shared-memory input with a TypeError", async () => {
    await expect(resolveInSource(new Uint8Array(new SharedArrayBuffer(8)), { artifact_sha256: "0".repeat(64), address: { id: "i:1", type: "p" } })).rejects.toBeInstanceOf(TypeError);
  });

  it("returns identity only: no property data is attached", async () => {
    const bytes = bytesOf("o1-basic.source.ison");
    const { scene, artifactSha256 } = await compileScene(bytes, "ison-v1");
    const r = await resolveInSource(bytes, { artifact_sha256: artifactSha256, address: scene.nodes[0]!.ref });
    expect(Object.keys(r).sort()).toEqual(["address", "artifact_sha256", "kind"]);
  });
});

describe("the requested identity is snapshotted with the bytes (owner requirement)", () => {
  it("resolves the address it was given, even if the caller mutates the reference while the call is pending", async () => {
    const bytes = bytesOf("o1-basic.source.ison");
    const { scene, artifactSha256 } = await compileScene(bytes, "ison-v1");
    const wanted = structuredClone(scene.nodes[0]!.ref);
    const ref = { artifact_sha256: artifactSha256, address: structuredClone(wanted) };
    const pending = resolveInSource(bytes, ref);
    (ref.address as { id: string }).id = "i:999"; // the digest has not been taken yet
    const r = await pending;
    expect(r).toEqual({ kind: "node", address: wanted, artifact_sha256: artifactSha256 });
  });

  it("uses the artifact hash it was given, even if the caller mutates that field while the call is pending", async () => {
    const bytes = bytesOf("o1-basic.source.ison");
    const { scene, artifactSha256 } = await compileScene(bytes, "ison-v1");
    const ref: ObjectRef = { artifact_sha256: artifactSha256, address: scene.nodes[0]!.ref };
    const pending = resolveInSource(bytes, ref);
    ref.artifact_sha256 = "0".repeat(64);
    expect((await pending).kind).toBe("node");
  });

  it("snapshots a nested edge address too", async () => {
    const bytes = bytesOf("o1-basic.source.ison");
    const { scene, artifactSha256 } = await compileScene(bytes, "ison-v1");
    const wanted = structuredClone(scene.edges[0]!.ref);
    const ref = { artifact_sha256: artifactSha256, address: structuredClone(wanted) };
    const pending = resolveInSource(bytes, ref);
    ref.address.src.id = "i:999";
    ref.address.rel = "OTHER";
    const r = await pending;
    expect(r).toEqual({ kind: "edge", address: wanted, artifact_sha256: artifactSha256 });
  });

  it("returns the scene's stored address, not an object the caller still holds", async () => {
    const bytes = bytesOf("o1-basic.source.ison");
    const { scene, artifactSha256 } = await compileScene(bytes, "ison-v1");
    const ref = { artifact_sha256: artifactSha256, address: structuredClone(scene.nodes[0]!.ref) };
    const r = await resolveInSource(bytes, ref);
    expect(r.address).not.toBe(ref.address);
    (ref.address as { id: string }).id = "i:999";
    expect(r.address).toEqual(scene.nodes[0]!.ref);
  });

  describe("malformed reference shapes are rejected, not silently ignored", () => {
    const node = { id: "i:1", type: "person" };
    const edge = { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } };
    const h = "0".repeat(64);
    const shapes: [string, unknown][] = [
      ["null reference", null],
      ["array reference", []],
      ["string reference", "x"],
      ["extra top-level field", { artifact_sha256: h, address: node, note: "x" }],
      ["missing address", { artifact_sha256: h }],
      ["missing artifact_sha256", { address: node }],
      ["non-string artifact_sha256", { artifact_sha256: 5, address: node }],
      ["null address", { artifact_sha256: h, address: null }],
      ["array address", { artifact_sha256: h, address: [] }],
      ["extra node-address field", { artifact_sha256: h, address: { ...node, label: "x" } }],
      ["non-string node id", { artifact_sha256: h, address: { id: 1, type: "person" } }],
      ["missing node type", { artifact_sha256: h, address: { id: "i:1" } }],
      ["extra edge-address field", { artifact_sha256: h, address: { ...edge, extra: 1 } }],
      ["extra field inside an edge endpoint", { artifact_sha256: h, address: { ...edge, src: { ...edge.src, extra: 1 } } }],
      ["non-string ordinal", { artifact_sha256: h, address: { ...edge, ord: 0 } }],
      ["edge with a missing endpoint", { artifact_sha256: h, address: { ord: "0", rel: "KNOWS", src: edge.src } }],
    ];
    for (const [name, ref] of shapes) {
      it(name, async () => {
        const e = await igsErrorAsync(() => resolveInSource(bytesOf("o1-basic.source.ison"), ref as ObjectRef));
        expect([e.code, e.reason]).toEqual(["UNRESOLVED_ADDRESS", "MALFORMED_REFERENCE"]);
      });
    }
  });
});
