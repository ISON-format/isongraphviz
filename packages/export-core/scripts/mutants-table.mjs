// The K table of design 15.6 and 15.6a, restricted to the mutants whose named killer rows belong to export-core (rows X, H), as source patches:
//   K63-K71, K109-K120, K127 (22 mutants). Every mutant is a list of exact-text patches applied to a SCRATCH COPY of packages/export-core/src; production code
//   has no switchable variants and src/ is never modified. A patch whose `find` text does not occur exactly `count` times is a harness error.
const P = (file, find, replace, count = 1) => ({ file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });
const PRED = "if (b === undefined || b.scene !== m.scene_sha256 || b.layout !== m.layout_sha256 || b.state !== m.state_sha256) throw";

export const MUTANTS = [
  m("K63", "the chunk CRC covers the data only", [P("png.ts", "const crc = crc32(body);", "const crc = crc32(data);")]),
  m("K64", "the keyword is not followed by the NUL byte", [P("png.ts", "const text = `${KEYWORD}\\u0000igr-export/1", "const text = `${KEYWORD}igr-export/1")]),
  m("K65", "the chunk is inserted before the last 12 bytes (IEND)", [
    P("png.ts", "out.set(src.subarray(0, 33), 0);", "out.set(src.subarray(0, src.length - 12), 0);"), P("png.ts", "out.set(chunk, 33);", "out.set(chunk, src.length - 12);"),
    P("png.ts", "out.set(src.subarray(33), 33 + chunk.length);", "out.set(src.subarray(src.length - 12), src.length + chunk.length - 12);"),
  ]),
  m("K66", "an existing binding chunk is not detected", [P("png.ts", "if (bindingChunks(src, chunks).length > 0) throw", "if (false) throw")]),
  m("K67", "the PNG signature is not checked", [P("png.ts", "for (let i = 0; i < 8; i++) if (png[i] !== SIGNATURE[i]) throw malformed(\"bad signature\");", "void SIGNATURE;")]),
  m("K68", "the manifest lists artifacts in insertion order (scene, layout, state, svg, png)", [P("bundle.ts", "artifacts.sort((a, b) => (a.name < b.name ? -1 : 1));", "artifacts.sort((a, b) => [\"scene\", \"layout\", \"state\", \"svg\", \"png\"].indexOf(a.name) - [\"scene\", \"layout\", \"state\", \"svg\", \"png\"].indexOf(b.name));")]),
  m("K69", "the manifest has an extra key", [P("bundle.ts", "source_sha256: model.artifactSha256, state_sha256: stateHash,", "source_sha256: model.artifactSha256, state_sha256: stateHash, producer: \"x\",")]),
  m("K70", "the layout hash is not compared with the manifest", [P("bundle.ts", " || model.layoutSha256 !== m.layout_sha256", "")]),
  m("K71", "the exported SVG lacks the declaration", [P("bundle.ts", "bytes: utf8Encode(renderSvg(model, state, { xmlDeclaration: true })) });", "bytes: utf8Encode(renderSvg(model, state, { xmlDeclaration: false })) });")]),
  m("K109", "the manifest has no svg_format", [P("bundle.ts", "if (withSvg) manifest.svg_format = SVG_FORMAT_NAME;", "void SVG_FORMAT_NAME;")]),
  m("K110", "the PNG size is not checked", [P("bundle.ts", "if (size !== undefined) { const have", "if (false) { const have")]),
  m("K111", "the manifest size is not bounded", [P("manifest.ts", "if (bytes.length > maxBytes) throw bytesLimit(\"manifest\", `the manifest exceeds ${maxBytes} bytes`);", "void bytesLimit;")]),
  m("K112", "the manifest nesting depth is not scanned (and the JSON.parse is unguarded: invalid JSON escapes as a SyntaxError; killed by the unit check U-MANIFEST-json, no oracle row has invalid JSON)", [
    P("manifest.ts", "  scanDepth(text);\n", ""), P("manifest.ts", "try { raw = JSON.parse(text); } catch { throw exportError(\"SCHEMA\", \"manifest\", \"not JSON\"); }", "raw = JSON.parse(text);"),
  ]),
  m("K113", "non-canonical manifest bytes are accepted", [P("manifest.ts", "if (again.length !== bytes.length || again.some((x, i) => x !== bytes[i])) throw", "if (false) throw")]),
  m("K114", "a listed artifact missing from the files is accepted", [P("bundle.ts", "if (b === undefined) throw exportError(\"ARTIFACT_MISMATCH\", a.name, \"listed but absent\");", "if (b === undefined) continue;")]),
  m("K115", "an unlisted extra file is accepted", [P("bundle.ts", "for (const k of unlisted) throw exportError(\"UNKNOWN_ARTIFACT\", k, \"a file that the manifest does not list\");", "void unlisted;")]),
  m("K116", "the artifact SHA-256 is not compared", [P("bundle.ts", " || (await sha256Hex(b)) !== a.sha256", "")]),
  m("K117", "the artifact length is not compared", [P("bundle.ts", "if (b.length !== a.bytes || (await", "if ((await")]),
  m("K118", "the state hash is not compared", [P("bundle.ts", "if ((await sha256Hex(stateBytes)) !== m.state_sha256) throw", "if (false) throw")]),
  m("K119", "the PNG container check does not require IHDR as the first chunk", [P("png.ts", "if (chunks[0]!.type !== \"IHDR\" || chunks[0]!.length !== 13) throw", "if (false) throw")]),
  m("K120", "the PNG binding chunk is not compared", [P("bundle.ts", PRED, "if (false) throw")]),
  m("K127", "svg_format is not checked", [P("bundle.ts", "if (m.svg_format !== SVG_FORMAT) throw exportError(\"UNKNOWN_FORMAT\", \"svg_format\", \"only igr-svg/1 can be re-rendered\");", "void SVG_FORMAT;")]),
];

/** Mutants beyond the corpus table (audit 32-code-audit-b.md): ids start with `ext:`, killed by the behaviour checks of test/oracle/extra.ts. See scripts/ext-mutants.mjs. */
export { EXTRA_MUTANTS } from "./ext-mutants.mjs";
