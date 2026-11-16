import { compileScene } from "isongraph-visualize-scene-core";
import { describe, expect, it } from "vitest";
import { bindLayout } from "../src/bind.js";
import { layoutToBytes } from "../src/serialize.js";
import { baseLayout, enc, layoutError, o1Scene } from "./helpers.js";

const src = (edge: string) => enc(`nodes.n\nid\na\nb\nc\n\nedges.R\nsource target\n${edge}\n`);
const layoutFor = (sceneSha: string, ids: string[], type = "n") => layoutToBytes({ ...baseLayout(), scene_sha256: sceneSha, nodes: ids.map((id, i) => ({ ref: { id, type }, x: i, y: i })) });

describe("bindLayout", () => {
  it("binds a layout to its own verified scene and returns both verified objects", async () => {
    const a = await compileScene(src(":n:a :n:b"), "ison-v1");
    const r = await bindLayout(a.sceneBytes, layoutFor(a.sceneSha256, ["s:a", "s:b", "s:c"]));
    expect(r.sceneSha256).toBe(a.sceneSha256);
    expect(r.layout.nodes).toHaveLength(3);
  });
  it("B01: same node set, different edges - a layout for scene B against scene A's bytes is SCENE_MISMATCH", async () => {
    const a = await compileScene(src(":n:a :n:b"), "ison-v1");
    const b = await compileScene(src(":n:b :n:c"), "ison-v1");
    expect(a.sceneSha256).not.toBe(b.sceneSha256);
    expect(await layoutError(() => bindLayout(a.sceneBytes, layoutFor(b.sceneSha256, ["s:a", "s:b", "s:c"])))).toBe("SCENE_MISMATCH/");
  });
  it("has no hash parameter: the forged-hash scenario cannot be expressed", () => {
    expect(bindLayout.length).toBe(2);
  });
  it("a missing node, an extra node, and the right id under the wrong type", async () => {
    const a = await compileScene(src(":n:a :n:b"), "ison-v1");
    expect(await layoutError(() => bindLayout(a.sceneBytes, layoutFor(a.sceneSha256, ["s:a", "s:b"])))).toBe("INCOMPLETE_LAYOUT/MISSING_NODE");
    expect(await layoutError(() => bindLayout(a.sceneBytes, layoutFor(a.sceneSha256, ["s:a", "s:b", "s:c", "s:d"])))).toBe("INCOMPLETE_LAYOUT/UNKNOWN_NODE");
    expect(await layoutError(() => bindLayout(a.sceneBytes, layoutFor(a.sceneSha256, ["s:a", "s:b", "s:c"], "m")))).toBe("INCOMPLETE_LAYOUT/MISSING_NODE");
  });
  it("typed addresses keep i:7 and s:7 apart", async () => {
    const mk = (id: string) => ({ ...baseLayout(), nodes: [{ ref: { id, type: "p" }, x: 0, y: 0 }] });
    const sceneI7 = enc(JSON.stringify({ address_scheme: "igs-addr/1", edges: [], graph: { directed: true, profile: "simple" }, igs: "IGS/1", nodes: [{ category: "p", label: "7", ref: { id: "i:7", type: "p" } }], source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" } }));
    const { verifyScene } = await import("isongraph-visualize-scene-core");
    const { sceneSha256 } = await verifyScene(sceneI7);
    expect(await layoutError(() => bindLayout(sceneI7, layoutToBytes({ ...mk("s:7"), scene_sha256: sceneSha256 })))).toBe("INCOMPLETE_LAYOUT/MISSING_NODE");
    await expect(bindLayout(sceneI7, layoutToBytes({ ...mk("i:7"), scene_sha256: sceneSha256 }))).resolves.toBeDefined();
  });
  it("scene bytes that are not canonical raise V1a's IgsError unchanged", async () => {
    const a = await compileScene(src(":n:a :n:b"), "ison-v1");
    const pretty = enc(JSON.stringify(a.scene, null, 1));
    await expect(bindLayout(pretty, layoutFor(a.sceneSha256, ["s:a", "s:b", "s:c"]))).rejects.toMatchObject({ name: "IgsError", code: "INVALID_SCENE", reason: "NON_CANONICAL" });
  });
  it("an invalid layout is reported before any binding comparison", async () => {
    const o1 = await o1Scene();
    expect(await layoutError(() => bindLayout(o1.sceneBytes, enc("{")))).toBe("INVALID_LAYOUT/SCHEMA");
  });
  it("snapshots both inputs: mutating either array after the call starts changes nothing (regression guard)", async () => {
    const a = await compileScene(src(":n:a :n:b"), "ison-v1");
    const lb = layoutFor(a.sceneSha256, ["s:a", "s:b", "s:c"]); const sb = new Uint8Array(a.sceneBytes);
    const p = bindLayout(sb, lb); sb.fill(0); lb.fill(0);
    await expect(p).resolves.toBeDefined();
  });
});
