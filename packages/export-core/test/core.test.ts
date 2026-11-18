// The rules no oracle row observes (design 11, 12, 15.7): the PNG container and chunk (strictness, CRC, order, bounds), the manifest reader, exportBundle option
// validation and snapshots, verifyExportBundle corners, renderHeadless corners, the metadata-string rule (11.7), no null in any writer.
import { describe, expect, it } from "vitest";
import { initialState, serializeState } from "isongraph-visualize-renderer-core";
import { SVG_FORMAT } from "isongraph-visualize-renderer-svg";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";
import * as ex from "../src/index.js";
import { crc32 } from "../src/png.js";
import { O1, initial, readOracle, readOracleText, sha256 } from "./helpers.js";

const err = async (f: () => unknown): Promise<{ name: string; code?: string; reason?: string }> => {
  try { await f(); } catch (e) { return { name: (e as Error).name, code: (e as { code?: string }).code, reason: (e as { reason?: string }).reason }; }
  return { name: "no error" };
};
const exp = (reason: string) => ({ name: "IaError", code: "INVALID_EXPORT", reason });
const fixture = (): Uint8Array => readOracle("png/fixture.png");
const BIND = { scene: "a".repeat(64), layout: "b".repeat(64), state: "c".repeat(64) };

describe("the PNG chunk (11.5)", () => {
  it("crc32 is the zlib/PNG polynomial (the check value of '123456789' is cbf43926); the chunk is 218 data bytes, inserted at offset 33, CRC over type and data", () => {
    expect(crc32(Uint8Array.from(Array.from("123456789", (c) => c.charCodeAt(0)))).toString(16)).toBe("cbf43926");
    const out = ex.embedPngBinding(fixture(), BIND);
    expect(out.length).toBe(fixture().length + 12 + 218);
    expect(Array.from(out.slice(0, 33))).toEqual(Array.from(fixture().slice(0, 33)));
    expect(Array.from(out.slice(33 + 230))).toEqual(Array.from(fixture().slice(33)));
    expect((out[33]! << 24 | out[34]! << 16 | out[35]! << 8 | out[36]!)).toBe(218);
    expect(new TextDecoder().decode(out.slice(37, 41))).toBe("tEXt");
    const body = out.slice(37, 37 + 4 + 218);
    const crc = (out[33 + 8 + 218]! << 24 | out[33 + 9 + 218]! << 16 | out[33 + 10 + 218]! << 8 | out[33 + 11 + 218]!) >>> 0;
    expect(crc).toBe(crc32(body));
    expect(ex.readPngBinding(out)).toEqual(BIND);
    expect(ex.readPngBinding(fixture())).toBeUndefined();
  });
  it("embed validates the hashes first, the container strictly, refuses a second binding, and copies the input once (the argument is not mutated)", async () => {
    const f = fixture();
    const before = f.slice();
    ex.embedPngBinding(f, BIND);
    expect(Array.from(f)).toEqual(Array.from(before));
    for (const bad of [{ ...BIND, scene: "A".repeat(64) }, { ...BIND, layout: "b".repeat(63) }, { ...BIND, state: 5 }, { scene: BIND.scene }]) expect(await err(() => ex.embedPngBinding(f, bad as never))).toMatchObject(exp("SCHEMA"));
    const mut = (g: (b: Uint8Array) => void): Uint8Array => { const b = f.slice(); g(b); return b; };
    expect(await err(() => ex.embedPngBinding(f.slice(0, 20), BIND))).toMatchObject(exp("PNG_MALFORMED"));
    expect(await err(() => ex.embedPngBinding(mut((b) => { b[7] = 0; }), BIND))).toMatchObject(exp("PNG_MALFORMED"));
    expect(await err(() => ex.embedPngBinding(mut((b) => { b[11] = 12; }), BIND))).toMatchObject(exp("PNG_MALFORMED")); // IHDR length 12
    expect(await err(() => ex.embedPngBinding(mut((b) => { b[b.length - 5] = 0x58; }), BIND))).toMatchObject(exp("PNG_MALFORMED")); // last chunk is not IEND
    expect(await err(() => ex.embedPngBinding(mut((b) => { b[12] = 0x31; }), BIND))).toMatchObject(exp("PNG_MALFORMED")); // chunk type not letters
    expect(await err(() => ex.embedPngBinding(Uint8Array.from([...f, 0]), BIND))).toMatchObject(exp("PNG_MALFORMED")); // trailing byte
    expect(await err(() => ex.embedPngBinding(mut((b) => { b[8] = 0x7f; }), BIND))).toMatchObject(exp("PNG_MALFORMED")); // length beyond the file
    expect(await err(() => ex.embedPngBinding(ex.embedPngBinding(f, BIND), BIND))).toMatchObject(exp("PNG_ALREADY_BOUND"));
  });
  it("read: more than one binding chunk or an off-template text is PNG_MALFORMED; a tEXt chunk of another keyword is ignored", async () => {
    const b = ex.embedPngBinding(fixture(), BIND);
    const twice = Uint8Array.from([...b.slice(0, 33), ...b.slice(33, 33 + 230), ...b.slice(33)]);
    expect(await err(() => ex.readPngBinding(twice))).toMatchObject(exp("PNG_MALFORMED"));
    const off = b.slice(); off[33 + 8 + 11 + 3] = 0x58; // 'igr' -> 'igX' inside the template text
    expect(await err(() => ex.readPngBinding(off))).toMatchObject(exp("PNG_MALFORMED"));
    const other = b.slice(); other[33 + 8] = 0x58; // keyword no longer begins igr-export
    expect(ex.readPngBinding(other)).toBeUndefined();
  });
});

describe("the manifest (11.3)", () => {
  it("round trips through the strict reader; every deviation is refused; no null anywhere", async () => {
    const m = await (async () => { const { model, state } = await initial(O1); return ex.exportBundle(model, state, readOracle(O1.layout), { png: fixture() }); })();
    expect(ex.serializeExportManifest(ex.parseExportManifest(m.manifestBytes))).toEqual(m.manifestBytes);
    expect(new TextDecoder().decode(m.manifestBytes).includes("null")).toBe(false);
    const j = JSON.parse(new TextDecoder().decode(m.manifestBytes)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const refuse = async (mut: (j: Record<string, any>) => void, reason: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const c = JSON.parse(JSON.stringify(j)) as Record<string, any>; mut(c); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(await err(() => ex.parseExportManifest(new TextEncoder().encode(JSON.stringify(c))))).toMatchObject(exp(reason));
    };
    await refuse((c) => { c["export"] = "igr-export/2"; }, "SCHEMA");
    await refuse((c) => { c["igr"] = "IGR/2"; }, "SCHEMA");
    await refuse((c) => { delete c["source_sha256"]; }, "SCHEMA");
    await refuse((c) => { c["scene_sha256"] = "A".repeat(64); }, "SCHEMA");
    await refuse((c) => { c["artifacts"][0].media_type = "text/plain"; }, "SCHEMA");
    await refuse((c) => { c["artifacts"][0].bytes = -1; }, "SCHEMA");
    await refuse((c) => { c["artifacts"][0].bytes = 1.5; }, "SCHEMA");
    await refuse((c) => { c["artifacts"][0].extra = 1; }, "SCHEMA");
    await refuse((c) => { c["artifacts"] = c["artifacts"].filter((a: { name: string }) => a.name !== "scene"); }, "SCHEMA");
    await refuse((c) => { c["artifacts"] = c["artifacts"].filter((a: { name: string }) => a.name !== "svg"); }, "SCHEMA"); // svg_format without svg (A-46)
    await refuse((c) => { delete c["svg_format"]; }, "SCHEMA");
    await refuse((c) => { c["artifacts"].push(c["artifacts"][0]); }, "SCHEMA");
    expect(await err(() => ex.parseExportManifest(new TextEncoder().encode("{")))).toMatchObject(exp("SCHEMA"));
    expect(await err(() => ex.parseExportManifest(Uint8Array.from([0xff, 0xfe])))).toMatchObject(exp("SCHEMA"));
    expect(await err(() => ex.parseExportManifest(new TextEncoder().encode('{"a":{"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}}')))).toMatchObject(exp("SCHEMA")); // depth 7
    expect(SVG_FORMAT).toBe("igr-svg/1");
  });
});

describe("exportBundle (11.2)", () => {
  it("option validation, layout binding, limits; bytes are copied before the first await; the files and the manifest agree", async () => {
    const { model, state } = await initial(O1);
    const layout = readOracle(O1.layout);
    const b = (o: unknown, l: Uint8Array = layout) => err(() => ex.exportBundle(model, state, l, o as never));
    expect(await b({ svg: true })).toMatchObject({ code: "INVALID_CONFIG", reason: "SCHEMA" });
    expect(await b({ other: 1 })).toMatchObject({ code: "INVALID_CONFIG", reason: "SCHEMA" });
    expect(await b({ png: "x" })).toMatchObject({ code: "INVALID_CONFIG", reason: "SCHEMA" });
    expect(await b({ limits: { maxArtifactBytes: 1.5 } })).toMatchObject({ code: "INVALID_CONFIG", reason: "NOT_INTEGER" });
    expect(await b({ limits: { nope: 1 } })).toMatchObject({ code: "INVALID_CONFIG", reason: "SCHEMA" });
    expect(await b({ limits: { maxArtifactBytes: 10 } })).toMatchObject({ code: "RESOURCE_LIMIT", reason: "BYTES_LIMIT" });
    expect(await b({ png: fixture(), limits: { maxPngBytes: 10 } })).toMatchObject({ code: "RESOURCE_LIMIT", reason: "BYTES_LIMIT" });
    expect(await b({}, layout.slice(1))).toMatchObject(exp("BINDING_MISMATCH"));
    expect(await err(() => ex.exportBundle({} as never, state, layout))).toMatchObject({ name: "IgrError" });
    expect(await b({ png: fixture().slice(0, 30) })).toMatchObject(exp("PNG_MALFORMED"));
    const mutated = layout.slice();
    const p = ex.exportBundle(model, state, mutated, { png: fixture().slice() });
    mutated[0] = 0; // after the call began: the copy was taken before the first await
    const r = await p;
    expect(sha256(r.files.get("layout")!)).toBe(model.layoutSha256);
    for (const a of r.manifest.artifacts) { expect(sha256(r.files.get(a.name)!)).toBe(a.sha256); expect(r.files.get(a.name)!.length).toBe(a.bytes); }
    expect(r.manifest.artifacts.map((a) => a.name)).toEqual(["layout", "png", "scene", "state", "svg"]);
    expect([...r.files.keys()].sort()).toEqual(["layout", "png", "scene", "state", "svg"]);
    expect(await ex.verifyExportBundle(r.files, r.manifestBytes)).toEqual(r.manifest);
  });
});

describe("verifyExportBundle (11.4)", () => {
  it("accepts an untampered bundle with and without svg and png; refuses options it does not know; the file map is copied", async () => {
    const { model, state } = await initial(O1);
    const layout = readOracle(O1.layout);
    for (const o of [{ svg: false }, {}, { png: fixture() }]) {
      const r = await ex.exportBundle(model, state, layout, o as never);
      const files = new Map(r.files);
      const p = ex.verifyExportBundle(files, r.manifestBytes);
      files.set("svg", Uint8Array.from([1])); // after the call began
      expect((await p).state_sha256).toBe(r.manifest.state_sha256);
    }
    const r = await ex.exportBundle(model, state, layout);
    expect(await err(() => ex.verifyExportBundle(r.files, r.manifestBytes, { other: 1 } as never))).toMatchObject({ code: "INVALID_CONFIG", reason: "SCHEMA" });
    expect(await err(() => ex.verifyExportBundle(r.files, r.manifestBytes, { limits: { maxArtifactBytes: 10 } }))).toMatchObject({ code: "RESOURCE_LIMIT", reason: "BYTES_LIMIT" });
    expect(await err(() => ex.verifyExportBundle(r.files, r.manifestBytes, { limits: { maxManifestBytes: 10 } }))).toMatchObject({ code: "RESOURCE_LIMIT", reason: "BYTES_LIMIT" });
  });
  it("a bundle whose layout binds to another scene fails at the model build with the committed error, unchanged", async () => {
    const { model, state } = await initial(O1);
    const r = await ex.exportBundle(model, state, readOracle(O1.layout), { svg: false });
    const other = readOracle("scenes/G9.scene.json");
    const files = new Map(r.files); files.set("scene", other);
    const j = JSON.parse(new TextDecoder().decode(r.manifestBytes)) as { artifacts: { name: string; bytes: number; sha256: string }[] };
    const e = j.artifacts.find((a) => a.name === "scene")!; e.bytes = other.length; e.sha256 = sha256(other);
    const out = await err(() => ex.verifyExportBundle(files, canonicalBytesSigned(j as never)));
    expect(out.name).not.toBe("no error");
    expect(out.name).not.toBe("TypeError");
  });
});

describe("renderHeadless (12)", () => {
  const base = () => ({ sceneBytes: readOracle(O1.scene), layoutBytes: readOracle(O1.layout) });
  it("defaults to state and svg; every named output is exactly its function's bytes; intents feed the tree's live text; two calls give equal bytes", async () => {
    const r = await ex.renderHeadless(base());
    expect([...r.files.keys()]).toEqual(["state", "svg"]);
    const all = await ex.renderHeadless({ ...base(), outputs: ["state", "svg", "display-list", "canvas-stream", "readout", "tree"], intents: [{ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] }] });
    expect(all.events.length).toBe(1);
    expect(new TextDecoder().decode(all.files.get("tree")!)).toContain('"text":"1 selected."');
    const again = await ex.renderHeadless({ ...base(), outputs: ["state", "svg", "display-list", "canvas-stream", "readout", "tree"], intents: [{ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] }] });
    for (const k of all.files.keys()) expect(Array.from(again.files.get(k)!)).toEqual(Array.from(all.files.get(k)!));
    expect(new TextDecoder().decode(all.files.get("state")!)).toBe(new TextDecoder().decode(serializeState(all.model, all.state)));
  });
  it("argument errors are INVALID_INPUT; a state object or bytes is validated; size is used only without a state; bytes are copied before the first await", async () => {
    const e = (o: unknown) => err(() => ex.renderHeadless({ ...base(), ...(o as object) } as never));
    expect(await e({ outputs: ["nope"] })).toMatchObject({ code: "INVALID_INPUT", reason: "SCHEMA" });
    expect(await e({ outputs: "state" })).toMatchObject({ code: "INVALID_INPUT", reason: "SCHEMA" });
    expect(await e({ other: 1 })).toMatchObject({ code: "INVALID_INPUT", reason: "SCHEMA" });
    expect(await e({ size: { width: 1.5, height: 10 } })).toMatchObject({ code: "INVALID_INPUT", reason: "NOT_INTEGER" });
    expect(await e({ size: { width: 0, height: 10 } })).toMatchObject({ code: "INVALID_INPUT", reason: "OUT_OF_RANGE" });
    expect(await e({ size: { width: "9", height: 10 } })).toMatchObject({ code: "INVALID_INPUT", reason: "SCHEMA" });
    expect(await err(() => ex.renderHeadless({ sceneBytes: 5, layoutBytes: 5 } as never))).toMatchObject({ code: "INVALID_INPUT", reason: "SCHEMA" });
    const { model } = await initial(O1);
    const st = initialState(model, { width: 900, height: 600 });
    const ok = await ex.renderHeadless({ ...base(), state: st, size: { width: 900, height: 600 } });
    expect(ok.state.viewport.width).toBe(900);
    expect((await ex.renderHeadless({ ...base(), size: { width: 300, height: 200 } })).state.viewport.width).toBe(300);
    expect(await e({ state: { ...st, igr: "IGR/9" } })).toMatchObject({ name: "IgrError" });
    expect(await e({ state: readOracle("states/O1.initial.state.json").slice(1) })).toMatchObject({ name: "IgrError" });
    const input = base();
    const p = ex.renderHeadless(input);
    input.sceneBytes[0] = 0;
    expect((await p).files.size).toBe(2);
  });
});

describe("the metadata-string rule (11.7)", () => {
  it("no graph string enters the PNG chunk or the manifest: only constants, hashes and integers (a hostile scene exports clean metadata)", async () => {
    const { model, state } = await initial({ scene: "scenes/HOST.scene.json", layout: "layouts/HOST.layout.json" });
    const r = await ex.exportBundle(model, state, readOracle("layouts/HOST.layout.json"), { png: fixture() });
    const text = new TextDecoder().decode(r.manifestBytes);
    for (const frag of ["<b>", "a&b", " ", "‮", "s:"]) expect(text.includes(frag), frag).toBe(false);
    const png = new TextDecoder("latin1").decode(r.files.get("png")!);
    expect(/igr-export\u0000igr-export\/1 [0-9a-f]{64} [0-9a-f]{64} [0-9a-f]{64}/.test(png)).toBe(true);
    expect(readOracleText("generated/GENERATED.tsv").length).toBeGreaterThan(0);
  });
});
