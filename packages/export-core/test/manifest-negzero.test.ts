// R32-07 (design 32 rev 4, 11.3): a manifest whose `bytes` is spelled -0 is a value-type fault, INVALID_EXPORT/SCHEMA; the foreign scene-core error
// INVALID_SCENE/INVALID_NUMBER of the re-serialisation must not escape the manifest reader.
import { describe, expect, it } from "vitest";
import { IaError } from "isongraph-visualize-interaction-core";
import { parseExportManifest, serializeExportManifest, type ExportManifest } from "../src/index.js";

const h = (c: string): string => c.repeat(64);
const manifest: ExportManifest = {
  artifacts: [
    { bytes: 1, media_type: "application/octet-stream", name: "layout", sha256: h("a") },
    { bytes: 1, media_type: "application/octet-stream", name: "scene", sha256: h("b") },
    { bytes: 1, media_type: "application/octet-stream", name: "state", sha256: h("c") },
  ],
  export: "igr-export/1", igr: "IGR/1", layout_sha256: h("a"), scene_sha256: h("b"), source_sha256: h("e"), state_sha256: h("c"),
};
const text = new TextDecoder().decode(serializeExportManifest(manifest));
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const errOf = (f: () => unknown): unknown => { try { f(); } catch (e) { return e; } return undefined; };

describe("R32-07: -0 in a manifest", () => {
  it("the canonical manifest is accepted", () => { expect(parseExportManifest(enc(text)).artifacts.length).toBe(3); });
  it("a `bytes` value of -0 is INVALID_EXPORT/SCHEMA, an IaError", () => {
    const e = errOf(() => parseExportManifest(enc(text.replace('"bytes":1,"media_type":"application/octet-stream","name":"layout"', '"bytes":-0,"media_type":"application/octet-stream","name":"layout"'))));
    expect(e).toBeInstanceOf(IaError);
    expect((e as IaError).code).toBe("INVALID_EXPORT");
    expect((e as IaError).reason).toBe("SCHEMA");
  });
  it("a `bytes` value of 1.0 is still NON_CANONICAL (the -0 rule does not touch other spellings)", () => {
    const e = errOf(() => parseExportManifest(enc(text.replace('"bytes":1,"media_type":"application/octet-stream","name":"layout"', '"bytes":1.0,"media_type":"application/octet-stream","name":"layout"'))));
    expect((e as IaError).reason).toBe("NON_CANONICAL");
  });
});
