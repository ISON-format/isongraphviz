// src/bundle.ts - exportBundle and verifyExportBundle (design 11.2, 11.4). DOM-free; hashing through WebCrypto (`sha256Hex`, only this package hashes).
// Every Uint8Array argument is copied before the first await; caller objects are read once as own data.
import { buildRenderModel, modelSceneBytes, parseState, serializeState, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { SVG_FORMAT, renderSvg } from "isongraph-visualize-renderer-svg";
import { IaError } from "isongraph-visualize-interaction-core";
import { sha256Hex } from "isongraph-visualize-scene-core/primitives";
import { EXPORT_FORMAT, DEFAULT_EXPORT_LIMITS, SVG_FORMAT_NAME, bytesArg, bytesLimit, copyBytes, exportError, plainEntries, readLimits, utf8Encode, type ExportLimits } from "./limits.js";
import { MEDIA_TYPES, readManifest, serializeExportManifest, type ArtifactEntry, type ExportManifest } from "./manifest.js";
import { embedPngBinding, parsePng, pngSize, readPngBinding } from "./png.js";

export interface ExportOptions { svg?: false; png?: Uint8Array; expectedPngSize?: { width: number; height: number }; limits?: Partial<ExportLimits> }
export interface ExportBundle { files: Map<string, Uint8Array>; manifest: ExportManifest; manifestBytes: Uint8Array }

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export async function exportBundle(model: RenderModel, state: SemanticState, layoutBytes: Uint8Array, options?: ExportOptions): Promise<ExportBundle> {
  // snapshot first: the bytes are copied before the first await, the options are read once as own data
  const layout = bytesArg(layoutBytes, "layoutBytes");
  const o = options === undefined ? new Map<string, unknown>() : plainEntries(options);
  if (o === undefined) throw new IaError("INVALID_CONFIG", "SCHEMA", "options");
  for (const k of o.keys()) if (!["svg", "png", "expectedPngSize", "limits"].includes(k)) throw new IaError("INVALID_CONFIG", "SCHEMA", `options.${k}`);
  if (o.has("svg") && o.get("svg") !== false) throw new IaError("INVALID_CONFIG", "SCHEMA", "options.svg", "only false is accepted (the SVG uses default options, 11.1)");
  const withSvg = !o.has("svg");
  let png: Uint8Array | undefined;
  if (o.has("png")) { const p = o.get("png"); if (!(p instanceof Uint8Array)) throw new IaError("INVALID_CONFIG", "SCHEMA", "options.png"); png = copyBytes(p); }
  let size: { width: number; height: number } | undefined;
  if (o.has("expectedPngSize")) {
    const s = plainEntries(o.get("expectedPngSize"));
    if (s === undefined || s.size !== 2 || !s.has("width") || !s.has("height") || typeof s.get("width") !== "number" || typeof s.get("height") !== "number") throw new IaError("INVALID_CONFIG", "SCHEMA", "options.expectedPngSize");
    size = { width: s.get("width") as number, height: s.get("height") as number };
  }
  const limits = readLimits(o.get("limits"), DEFAULT_EXPORT_LIMITS);
  const stateBytes = serializeState(model, state); // validates the model and the state (IgrError unchanged)
  const sceneBytes = modelSceneBytes(model);
  if ((await sha256Hex(layout)) !== model.layoutSha256) throw exportError("BINDING_MISMATCH", "layout", "sha256(layoutBytes) differs from the model's layout hash");
  const artifacts: { name: ArtifactEntry["name"]; bytes: Uint8Array }[] = [{ name: "layout", bytes: layout }, { name: "scene", bytes: sceneBytes }, { name: "state", bytes: stateBytes }];
  const stateHash = await sha256Hex(stateBytes);
  if (withSvg) artifacts.push({ name: "svg", bytes: utf8Encode(renderSvg(model, state, { xmlDeclaration: true })) });
  if (png !== undefined) {
    if (png.length > limits.maxPngBytes) throw bytesLimit("png", `the PNG exceeds ${limits.maxPngBytes} bytes`);
    const bound = embedPngBinding(png, { scene: model.sceneSha256, layout: model.layoutSha256, state: stateHash }); // embed first, size second (A-48)
    if (size !== undefined) { const have = pngSize(bound); if (have.width !== size.width || have.height !== size.height) throw exportError("PNG_SIZE_MISMATCH", "png", "IHDR size differs from expectedPngSize"); }
    artifacts.push({ name: "png", bytes: bound });
  }
  for (const a of artifacts) if (a.bytes.length > limits.maxArtifactBytes) throw bytesLimit(a.name, `the artifact exceeds ${limits.maxArtifactBytes} bytes`);
  artifacts.sort((a, b) => (a.name < b.name ? -1 : 1));
  const entries: ArtifactEntry[] = [];
  for (const a of artifacts) entries.push({ bytes: a.bytes.length, media_type: MEDIA_TYPES.get(a.name)!, name: a.name, sha256: await sha256Hex(a.bytes) });
  const manifest: ExportManifest = {
    artifacts: entries, export: EXPORT_FORMAT, igr: "IGR/1", layout_sha256: model.layoutSha256, scene_sha256: model.sceneSha256, source_sha256: model.artifactSha256, state_sha256: stateHash,
  };
  if (withSvg) manifest.svg_format = SVG_FORMAT_NAME;
  return { files: new Map(artifacts.map((a) => [a.name, a.bytes])), manifest, manifestBytes: serializeExportManifest(manifest) };
}

/** Verifies a bundle against its manifest, in the order of design 11.4 (first failure wins); returns the manifest. */
export async function verifyExportBundle(files: ReadonlyMap<string, Uint8Array>, manifestBytes: Uint8Array, options?: { limits?: Partial<ExportLimits> }): Promise<ExportManifest> {
  const manifestCopy = bytesArg(manifestBytes, "manifestBytes");
  if (!(files instanceof Map)) throw new IaError("INVALID_INPUT", "SCHEMA", "files", "a Map of name -> bytes expected");
  const o = options === undefined ? new Map<string, unknown>() : plainEntries(options);
  if (o === undefined) throw new IaError("INVALID_CONFIG", "SCHEMA", "options");
  for (const k of o.keys()) if (k !== "limits") throw new IaError("INVALID_CONFIG", "SCHEMA", `options.${k}`);
  const limits = readLimits(o.get("limits"), DEFAULT_EXPORT_LIMITS);
  const m = readManifest(manifestCopy, limits.maxManifestBytes); // (1) synchronous: nothing else was copied yet
  // only the files the manifest lists are copied (an unlisted file of any size costs no allocation), all before the first await
  const copy = new Map<string, Uint8Array>();
  const unlisted: string[] = [];
  for (const [k, v] of files) {
    if (!(v instanceof Uint8Array)) throw new IaError("INVALID_INPUT", "SCHEMA", `files.${k}`, "a Uint8Array expected");
    if (m.artifacts.some((a) => a.name === k)) copy.set(k, copyBytes(v)); else unlisted.push(k);
  }
  for (const a of m.artifacts) { // (2)
    const b = copy.get(a.name);
    if (b === undefined) throw exportError("ARTIFACT_MISMATCH", a.name, "listed but absent");
    if (b.length > limits.maxArtifactBytes) throw bytesLimit(a.name, `the artifact exceeds ${limits.maxArtifactBytes} bytes`);
    if (b.length !== a.bytes || (await sha256Hex(b)) !== a.sha256) throw exportError("ARTIFACT_MISMATCH", a.name, "length or SHA-256 differs from the manifest");
  }
  for (const k of unlisted) throw exportError("UNKNOWN_ARTIFACT", k, "a file that the manifest does not list");
  const scene = copy.get("scene")!, layout = copy.get("layout")!, stateBytes = copy.get("state")!;
  const model = await buildRenderModel(scene, layout); // (3) IgsError, LayoutError, IgrError propagate unchanged
  if (model.sceneSha256 !== m.scene_sha256 || model.layoutSha256 !== m.layout_sha256 || model.artifactSha256 !== m.source_sha256) throw exportError("BINDING_MISMATCH", "manifest", "the artifacts do not bind to the manifest's hashes");
  const state = parseState(model, stateBytes); // (4)
  if ((await sha256Hex(stateBytes)) !== m.state_sha256) throw exportError("STATE_MISMATCH", "state", "SHA-256 of the state differs from state_sha256");
  const svg = copy.get("svg"); // (5)
  if (svg !== undefined) {
    if (m.svg_format !== SVG_FORMAT) throw exportError("UNKNOWN_FORMAT", "svg_format", "only igr-svg/1 can be re-rendered");
    if (!same(utf8Encode(renderSvg(model, state, { xmlDeclaration: true })), svg)) throw exportError("SVG_NOT_REPRODUCIBLE", "svg", "differs from the re-rendering of the state");
  }
  const png = copy.get("png"); // (6)
  if (png !== undefined) {
    parsePng(png);
    const b = readPngBinding(png);
    if (b === undefined || b.scene !== m.scene_sha256 || b.layout !== m.layout_sha256 || b.state !== m.state_sha256) throw exportError("BINDING_MISMATCH", "png", "the PNG binding differs from the manifest");
  }
  return m;
}
