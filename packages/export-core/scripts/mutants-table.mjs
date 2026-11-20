// The K table of design 15.6 and 15.6a, restricted to the mutants whose named killer rows belong to export-core (rows X, H), as source patches:
//   K63-K71, K109-K120, K127, K154-K200 (69 mutants; K154-K200 are the PNG container, binding chunk and manifest rows X27-X177 added with the gap rows, review 34). Every mutant is a list of exact-text patches applied to a SCRATCH COPY of packages/export-core/src; production code
//   has no switchable variants and src/ is never modified. A patch whose `find` text does not occur exactly `count` times is a harness error.
const P = (file, find, replace, count = 1) => ({ file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });
// text shared by several of the gap-row mutants K154-K200 (review 34)
const CRCCHK = "for (const k of CHUNKS) { const stored = u32(src, k.start + 8 + k.length); if (crc32(src.subarray(k.start + 4, k.start + 8 + k.length)) !== stored) throw malformed(\"CRC differs\"); }";
const EMBED_PARSE = "  const chunks = parsePng(src);\n  if (bindingChunks(src, chunks).length > 0) throw";
const READ_PARSE = "  const chunks = parsePng(src);\n  const found = bindingChunks(src, chunks);";
const TEMPLATE = "const TEMPLATE = /^igr-export\\/1 ([0-9a-f]{64}) ([0-9a-f]{64}) ([0-9a-f]{64})$/;";
const LEN = "if (c.length !== KEYWORD.length + 1 + 207) throw malformed(";
const SIZECHK = "if (have.width !== size.width || have.height !== size.height) throw";
const BIND_ON = "if (b === undefined || b.scene !== m.scene_sha256 || b.layout !== m.layout_sha256 || b.state !== m.state_sha256) throw";
const CANON = "if (again.length !== bytes.length || again.some((x, i) => x !== bytes[i])) throw";
const NAMELOOP = "  for (const e of entries) if (!NAMES.includes(e.name)) throw exportError(\"UNKNOWN_ARTIFACT\", \"manifest.artifacts\", \"unknown artifact name\");\n";
const ORDLOOP = "  for (let i = 1; i < entries.length; i++) if (!(entries[i - 1]!.name < entries[i]!.name)) throw exportError(\"SCHEMA\", \"manifest.artifacts\", \"artifacts must be strictly ascending by name\");\n";
const PARSEJSON = "  try { raw = JSON.parse(text); } catch { throw exportError(\"SCHEMA\", \"manifest\", \"not JSON\"); }\n";
const SIZELE = "{ width: u32(png, 16), height: u32(png, 20) }";

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
  m("K112", "the manifest nesting depth is not scanned (and the JSON.parse is unguarded: invalid JSON escapes as a SyntaxError; killed by the oracle rows X31-X44 and X86 (A-75) and by the unit check U-MANIFEST-json; the depth scan alone is equivalent on V8, X25 does not kill it)", [
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
  // ---- PNG container, binding chunk and manifest rows X27-X177 (corpus K154-K200, added with the gap rows of review 34). Each is this implementation's realization
  //      of the one-line text of MUTANTS.tsv; none is reference-only. K168 repeats the patches of K65; K183 the patch of K113. -------------------------------------
  m("K154", "signature compared on its first four bytes only", [P("png.ts", "for (let i = 0; i < 8; i++) if (png[i] !== SIGNATURE[i]) throw", "for (let i = 0; i < 4; i++) if (png[i] !== SIGNATURE[i]) throw")]),
  m("K155", "trailing bytes shorter than a chunk ignored", [P("png.ts", "if (at + 12 > png.length) throw malformed(\"truncated chunk header\");", "if (at + 12 > png.length) break;")]),
  m("K156", "IHDR length 13 not required", [P("png.ts", "if (chunks[0]!.type !== \"IHDR\" || chunks[0]!.length !== 13) throw", "if (chunks[0]!.type !== \"IHDR\") throw")]),
  m("K157", "first chunk not required to be IHDR (the length 13 only when it is)", [P("png.ts", "if (chunks[0]!.type !== \"IHDR\" || chunks[0]!.length !== 13) throw", "if (chunks[0]!.type === \"IHDR\" && chunks[0]!.length !== 13) throw")]),
  m("K158", "last chunk not required to be IEND", [P("png.ts", "if (last.type !== \"IEND\" || last.length !== 0) throw malformed(\"IEND must come last\");", "void last;")]),
  m("K159", "existing chunk CRCs verified by embed", [P("png.ts", EMBED_PARSE, EMBED_PARSE.replace("  const chunks = parsePng(src);\n", "  const chunks = parsePng(src);\n  " + CRCCHK.replace("CHUNKS", "chunks") + "\n"))]),
  m("K160", "chunk CRCs verified by read", [P("png.ts", READ_PARSE, READ_PARSE.replace("  const chunks = parsePng(src);\n", "  const chunks = parsePng(src);\n  " + CRCCHK.replace("CHUNKS", "chunks") + "\n"))]),
  m("K161", "CRC of the binding chunk verified by read", [P("png.ts", "  const c = found[0]!;\n", "  const c = found[0]!;\n  " + CRCCHK.replace("CHUNKS", "[c]") + "\n")]),
  m("K162", "chunk CRCs verified in bundle verification", [
    P("bundle.ts", "import { embedPngBinding, parsePng, pngSize, readPngBinding } from \"./png.js\";", "import { crc32, embedPngBinding, parsePng, pngSize, readPngBinding } from \"./png.js\";"),
    P("bundle.ts", "    parsePng(png);\n", "    for (const c of parsePng(png)) { const o = c.start + 8 + c.length; const stored = ((png[o]! << 24) | (png[o + 1]! << 16) | (png[o + 2]! << 8) | png[o + 3]!) >>> 0; if (crc32(png.subarray(c.start + 4, o)) !== stored) throw exportError(\"PNG_MALFORMED\", \"png\", \"CRC differs\"); }\n"),
  ]),
  m("K163", "any chunk type whose data begins igr-export + NUL is a binding chunk", [P("png.ts", "if (c.type !== \"tEXt\" || c.length < KEYWORD.length + 1) return false;", "if (c.length < KEYWORD.length + 1) return false;")]),
  m("K164", "binding keyword and chunk type compared case-insensitively", [
    P("png.ts", "if (c.type !== \"tEXt\" || c.length < KEYWORD.length + 1) return false;", "if (c.type.toLowerCase() !== \"text\" || c.length < KEYWORD.length + 1) return false;"),
    P("png.ts", "if (png[c.start + 8 + i] !== KEYWORD.charCodeAt(i)) return false;", "if (String.fromCharCode(png[c.start + 8 + i]!).toLowerCase().charCodeAt(0) !== KEYWORD.charCodeAt(i)) return false;"),
  ]),
  m("K165", "binding chunk detected by the keyword without the NUL", [
    P("png.ts", "c.length < KEYWORD.length + 1) return false;", "c.length < KEYWORD.length) return false;"),
    P("png.ts", "return png[c.start + 8 + KEYWORD.length] === 0;", "return true;"),
  ]),
  m("K166", "embed looks for an existing binding only right after IHDR", [P("png.ts", "if (bindingChunks(src, chunks).length > 0) throw", "if (bindingChunks(src, chunks.slice(0, 2)).length > 0) throw")]),
  m("K167", "embed refuses only an existing binding whose text matches the template", [P("png.ts", "if (bindingChunks(src, chunks).length > 0) throw",
    "if (bindingChunks(src, chunks).filter((c) => { let tx = \"\"; for (let i = KEYWORD.length + 1; i < c.length; i++) tx += String.fromCharCode(src[c.start + 8 + i]!); return TEMPLATE.test(tx); }).length > 0) throw")]),
  m("K168", "the binding chunk inserted before IEND instead of after IHDR", [
    P("png.ts", "out.set(src.subarray(0, 33), 0);", "out.set(src.subarray(0, src.length - 12), 0);"), P("png.ts", "out.set(chunk, 33);", "out.set(chunk, src.length - 12);"),
    P("png.ts", "out.set(src.subarray(33), 33 + chunk.length);", "out.set(src.subarray(src.length - 12), src.length + chunk.length - 12);"),
  ]),
  m("K169", "read returns the first of several binding chunks", [P("png.ts", "if (found.length > 1) throw malformed(\"more than one binding chunk\");", "void found;")]),
  m("K170", "binding text matched with `$` (a trailing LF accepted)", [
    P("png.ts", TEMPLATE, "const TEMPLATE = /^igr-export\\/1 ([0-9a-f]{64}) ([0-9a-f]{64}) ([0-9a-f]{64})\\n?$/;"),
    P("png.ts", LEN, "if (c.length !== KEYWORD.length + 1 + 207 && c.length !== KEYWORD.length + 1 + 208) throw malformed("),
  ]),
  m("K171", "binding text accepts uppercase hex", [P("png.ts", TEMPLATE, "const TEMPLATE = /^igr-export\\/1 ([0-9a-fA-F]{64}) ([0-9a-fA-F]{64}) ([0-9a-fA-F]{64})$/;")]),
  m("K172", "embed accepts uppercase hex hashes", [P("png.ts", "typeof v !== \"string\" || !HEX64.test(v)", "typeof v !== \"string\" || !/^[0-9a-fA-F]{64}$/.test(v)")]),
  m("K173", "embed hash check with `$` (a trailing LF accepted)", [P("png.ts", "typeof v !== \"string\" || !HEX64.test(v)", "typeof v !== \"string\" || !/^[0-9a-f]{64}\\n?$/.test(v)")]),
  m("K174", "IHDR size read little-endian", [P("png.ts", SIZELE, "{ width: (png[16]! | (png[17]! << 8) | (png[18]! << 16) | (png[19]! << 24)) >>> 0, height: (png[20]! | (png[21]! << 8) | (png[22]! << 16) | (png[23]! << 24)) >>> 0 }")]),
  m("K175", "expectedPngSize compares the width only", [P("bundle.ts", SIZECHK, "if (have.width !== size.width) throw")]),
  m("K176", "expectedPngSize compares the height only", [P("bundle.ts", SIZECHK, "if (have.height !== size.height) throw")]),
  m("K177", "a bundle png without a binding chunk accepted", [P("bundle.ts", BIND_ON, "if (b !== undefined && (b.scene !== m.scene_sha256 || b.layout !== m.layout_sha256 || b.state !== m.state_sha256)) throw")]),
  m("K178", "bundle verification does not compare the scene hash of the binding", [P("bundle.ts", BIND_ON, "if (b === undefined || b.layout !== m.layout_sha256 || b.state !== m.state_sha256) throw")]),
  m("K179", "bundle verification does not compare the layout hash of the binding", [P("bundle.ts", BIND_ON, "if (b === undefined || b.scene !== m.scene_sha256 || b.state !== m.state_sha256) throw")]),
  m("K180", "bundle verification does not compare the state hash of the binding", [P("bundle.ts", BIND_ON, "if (b === undefined || b.scene !== m.scene_sha256 || b.layout !== m.layout_sha256) throw")]),
  m("K181", "bundle verification requires a 1x1 png", [P("bundle.ts", "    parsePng(png);\n", "    parsePng(png);\n    { const sz = pngSize(png); if (sz.width !== 1 || sz.height !== 1) throw exportError(\"PNG_SIZE_MISMATCH\", \"png\", \"not 1x1\"); }\n")]),
  m("K182", "invalid JSON reported as NON_CANONICAL", [P("manifest.ts", "exportError(\"SCHEMA\", \"manifest\", \"not JSON\")", "exportError(\"NON_CANONICAL\", \"manifest\", \"not JSON\")")]),
  m("K183", "canonical bytes not checked", [P("manifest.ts", CANON, "if (false) throw")]),
  m("K184", "canonical bytes checked before the schema", [P("manifest.ts", PARSEJSON, PARSEJSON +
    "  { let a: Uint8Array | undefined; try { a = canonicalBytesSigned(raw as CJValue); } catch { a = undefined; } if (a === undefined || a.length !== bytes.length || a.some((x, i) => x !== bytes[i])) throw exportError(\"NON_CANONICAL\", \"manifest\", \"not canonical\"); }\n")]),
  m("K185", "whitespace ignored by the canonical-bytes check", [P("manifest.ts", CANON, "const sb = Array.from(bytes).filter((x) => x !== 0x20 && x !== 0x0a && x !== 0x0d && x !== 0x09);\n  if (again.length !== sb.length || again.some((x, i) => x !== sb[i])) throw")]),
  m("K186", "key order ignored by the canonical-bytes check (the input order is kept)", [P("manifest.ts", CANON, "if (JSON.stringify(raw) !== text) throw")]),
  m("K187", "escapes (\\u0069, \\/) normalised by the canonical-bytes check", [P("manifest.ts", CANON,
    "const nb = Array.from(new TextEncoder().encode(text.replace(/\\\\u00([0-7][0-9a-fA-F])/g, (_x, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\\\//g, \"/\")));\n  if (again.length !== nb.length || again.some((x, i) => x !== nb[i])) throw")]),
  m("K188", "artifact name and sort order judged in one pass", [
    P("manifest.ts", NAMELOOP, ""),
    P("manifest.ts", ORDLOOP, "  for (let i = 0; i < entries.length; i++) { if (!NAMES.includes(entries[i]!.name)) throw exportError(\"UNKNOWN_ARTIFACT\", \"manifest.artifacts\", \"unknown artifact name\"); if (i > 0 && !(entries[i - 1]!.name < entries[i]!.name)) throw exportError(\"SCHEMA\", \"manifest.artifacts\", \"artifacts must be strictly ascending by name\"); }\n"),
  ]),
  m("K189", "artifact names compared case-insensitively", [P("manifest.ts", "if (!NAMES.includes(e.name)) throw", "if (!NAMES.includes(e.name.toLowerCase())) throw")]),
  m("K190", "a negative bytes accepted", [P("manifest.ts", "!Number.isSafeInteger(b) || b < 0 || !HEX64.test(s)", "!Number.isSafeInteger(b) || !HEX64.test(s)")]),
  m("K191", "a bytes above 2^53 - 1 accepted", [P("manifest.ts", "!Number.isSafeInteger(b) || b < 0", "!Number.isInteger(b) || b < 0")]),
  m("K192", "uppercase hex accepted in manifest hashes", [P("manifest.ts", "typeof v !== \"string\" || !HEX64.test(v)", "typeof v !== \"string\" || !/^[0-9a-fA-F]{64}$/.test(v)")]),
  m("K193", "a 63-digit hash accepted", [P("manifest.ts", "typeof v !== \"string\" || !HEX64.test(v)", "typeof v !== \"string\" || !/^[0-9a-f]{63,64}$/.test(v)"), P("manifest.ts", "b < 0 || !HEX64.test(s)", "b < 0 || !/^[0-9a-f]{63,64}$/.test(s)")]),
  m("K194", "the igr value not compared", [P("manifest.ts", " || top.get(\"igr\") !== \"IGR/1\"", "")]),
  m("K195", "the export value not compared", [P("manifest.ts", "top.get(\"export\") !== EXPORT_FORMAT || ", "")]),
  m("K196", "a repeated artifact name accepted", [P("manifest.ts", "if (!(entries[i - 1]!.name < entries[i]!.name)) throw", "if (entries[i - 1]!.name > entries[i]!.name) throw")]),
  m("K197", "required entries not checked", [P("manifest.ts", "  for (const need of [\"layout\", \"scene\", \"state\"]) if (!entries.some((e) => e.name === need)) throw exportError(\"SCHEMA\", \"manifest.artifacts\", `${need} must be listed`);\n", "")]),
  m("K198", "a manifest that is not an object accepted", [P("manifest.ts", "if (top === undefined) throw exportError(\"SCHEMA\", \"manifest\", \"an object expected\");", "if (top === undefined) return raw as never;")]),
  m("K199", "extra keys in an artifact entry accepted", [P("manifest.ts", "e === undefined || e.size !== 4 ||", "e === undefined || e.size < 4 ||")]),
  m("K200", "listed files compared before the strict manifest reader", [P("bundle.ts", "  const m = readManifest(manifestCopy, limits.maxManifestBytes); // (1) synchronous: nothing else was copied yet",
    "  try { const lj = JSON.parse(new TextDecoder().decode(manifestCopy)) as { artifacts?: { name: string; bytes: number; sha256: string }[] };\n    for (const a of lj.artifacts ?? []) { const b = files.get(a.name);\n      if (b === undefined) throw exportError(\"ARTIFACT_MISMATCH\", a.name, \"listed but absent\");\n      if (b.length !== a.bytes || (await sha256Hex(b)) !== a.sha256) throw exportError(\"ARTIFACT_MISMATCH\", a.name, \"length or SHA-256 differs from the manifest\"); }\n  } catch (e) { if (e instanceof IaError) throw e; }\n  const m = readManifest(manifestCopy, limits.maxManifestBytes); // (1) synchronous: nothing else was copied yet")]),
];

/** Mutants beyond the corpus table (audit 32-code-audit-b.md): ids start with `ext:`, killed by the behaviour checks of test/oracle/extra.ts. See scripts/ext-mutants.mjs. */
export { EXTRA_MUTANTS } from "./ext-mutants.mjs";
