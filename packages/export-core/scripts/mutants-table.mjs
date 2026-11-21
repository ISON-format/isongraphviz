// The K table of design 15.6 and 15.6a, restricted to the mutants whose named killer rows belong to export-core (rows X, H), as source patches:
//   K63-K71, K109-K120, K127, K154-K200, K233-K268, K311 (106 mutants; K154-K200 are the PNG container, binding chunk and manifest rows X27-X177 added with the gap rows, review 34; K233-K268 and K311 are the rev 4 rows X178-X275). Every mutant is a list of exact-text patches applied to a SCRATCH COPY of packages/export-core/src; production code
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
// text shared by the rev 4 mutants K233-K268 and K311
const EMBED_OWN = "  const own: PngBinding = { scene: \"\", layout: \"\", state: \"\" };\n";
/** An already-bound check that walks the chunk framing without validating it, so that it can run before the container check of parsePng. */
const LENIENT_BOUND = "  { const cs: { type: string; start: number; length: number }[] = []; let at = 8; while (at + 12 <= src.length) { const length = u32(src, at); if (at + 12 + length > src.length) break; let type = \"\"; for (let i = 4; i < 8; i++) type += String.fromCharCode(src[at + i]!); cs.push({ type, start: at, length }); at += 12 + length; } if (bindingChunks(src, cs).length > 0) throw exportError(\"PNG_ALREADY_BOUND\", \"png\"); }\n";
const LETTER = "(c >= 65 && c <= 90) || (c >= 97 && c <= 122)";
const CTYPE = "if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) throw malformed(\"chunk type is not four ASCII letters\");";
const FIRSTCHUNK = "chunks[0]!.type !== \"IHDR\"";
const LASTCHUNK = "last.type !== \"IEND\" || last.length !== 0";
const NAMES_DECL = "const NAMES = [\"layout\", \"png\", \"scene\", \"state\", \"svg\"];\n";
const UTF8LINE = "  const text = utf8Decode(bytes);\n";
const NEGZERO = "    if (Object.is(b, -0)) throw exportError(\"SCHEMA\", p, \"-0 is not an integer of the canonical form\"); // R32-07: not the foreign INVALID_NUMBER of the re-serialisation\n";
const PUSHENTRY = "    entries.push({ bytes: b, media_type: mt, name: n as ArtifactName, sha256: s });";
const ARTLOOP = "  for (const a of artifacts) if (a.bytes.length > limits.maxArtifactBytes)";
/** A JSON walker for text that already parsed: the first value of a repeated key wins, and `dup` tells whether any key repeated. */
const WALK = String.raw`
function walkJson(t: string): { value: unknown; dup: boolean } {
  let i = 0, dup = false;
  const ws = (): void => { while (i < t.length && " \t\n\r".includes(t[i]!)) i++; };
  const str = (): string => { const s = i; i++; while (t[i] !== "\"") { if (t[i] === "\\") i++; i++; } i++; return JSON.parse(t.slice(s, i)); };
  const val = (): unknown => {
    ws();
    const c = t[i]!;
    if (c === "{") { i++; const o: Record<string, unknown> = Object.create(null); ws(); if (t[i] === "}") { i++; return o; } for (;;) { ws(); const k = str(); ws(); i++; const v = val(); if (k in o) dup = true; else o[k] = v; ws(); if (t[i++] === "}") return o; } }
    if (c === "[") { i++; const a: unknown[] = []; ws(); if (t[i] === "]") { i++; return a; } for (;;) { a.push(val()); ws(); if (t[i++] === "]") return a; } }
    if (c === "\"") return str();
    let j = i; while (j < t.length && !",]} \t\n\r".includes(t[j]!)) j++; const tok = t.slice(i, j); i = j; return JSON.parse(tok);
  };
  const value = val();
  return { value, dup };
}
`;
/** The canonical-bytes comparison against the text with every number token rewritten as String(Number(token)) (spellings ignored). */
const NUMNORM = String.raw`const nb = Array.from(new TextEncoder().encode((() => { let o = "", i = 0; while (i < text.length) { const c = text[i]!; if (c === "\"") { let j = i + 1; while (text[j] !== "\"") { if (text[j] === "\\") j++; j++; } o += text.slice(i, j + 1); i = j + 1; } else if (c === "-" || (c >= "0" && c <= "9")) { let j = i; while (j < text.length && "+-.eE0123456789".includes(text[j]!)) j++; o += String(Number(text.slice(i, j))); i = j; } else { o += c; i++; } } return o; })()));
  if (again.length !== nb.length || again.some((x, i) => x !== nb[i])) throw`;
const FRACEXP = String.raw`if (/[0-9][.eE]|[eE][+-]?[0-9]/.test(text.replace(/"(?:[^"\\]|\\.)*"/g, ""))) throw exportError("SCHEMA", "manifest", "a number with a fraction or an exponent");
  `;
const LONESURR = String.raw`  if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(raw))) throw exportError("SCHEMA", "manifest", "a lone surrogate escape");
`;
/** The canonical-bytes check run on the entries read so far (the manifest of the passes up to the value types), used to move that pass earlier. */
const CANON_EARLY = "  { const mm: Record<string, unknown> = { artifacts: entries, export: EXPORT_FORMAT, igr: \"IGR/1\", layout_sha256: top.get(\"layout_sha256\"), scene_sha256: top.get(\"scene_sha256\"), source_sha256: top.get(\"source_sha256\"), state_sha256: top.get(\"state_sha256\") }; if (top.has(\"svg_format\")) mm[\"svg_format\"] = top.get(\"svg_format\"); let a: Uint8Array | undefined; try { a = serializeExportManifest(mm as never); } catch { a = undefined; } if (a === undefined || a.length !== bytes.length || a.some((x, i) => x !== bytes[i])) throw exportError(\"NON_CANONICAL\", \"manifest\", \"not the canonical bytes\"); }\n";

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
  // ---- revision 4 rows X178-X275 (corpus K233-K268 and K311, added with the rev 4 round; design 32 rev 4, 11.2-11.5). Each is this implementation's realization of the
  //      one-line text of MUTANTS.tsv; none is reference-only. K311 repeats the patch of K158 (the correction: its killers are the rows of at least 45 bytes, X97 does not
  //      kill either). K268 has the same effect as K264 on every row (a dimension of 0) and is kept under its own id. -----------------------------------------------------
  m("K233", "embed checks the container before the hashes", [P("png.ts", EMBED_OWN, "  parsePng(src);\n" + EMBED_OWN)]),
  m("K234", "embed checks the already-bound state before the container", [P("png.ts", EMBED_PARSE, LENIENT_BOUND + EMBED_PARSE)]),
  m("K235", "embed checks the already-bound state before the hashes", [P("png.ts", EMBED_OWN, LENIENT_BOUND + EMBED_OWN)]),
  m("K236", "embed ignores extra keys of the binding object", [P("png.ts", "bm === undefined || bm.size !== 3", "bm === undefined || bm.size < 3")]),
  m("K237", "chunk types not checked", [P("png.ts", CTYPE, "void c;")]),
  m("K238", "only the first byte of a chunk type checked", [P("png.ts", CTYPE, "if (i === 4 && !((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) throw malformed(\"chunk type is not four ASCII letters\");")]),
  m("K239", "the fourth byte of a chunk type not checked", [P("png.ts", CTYPE, "if (i < 7 && !((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) throw malformed(\"chunk type is not four ASCII letters\");")]),
  m("K240", "0x5B accepted as a letter (range A to [)", [P("png.ts", LETTER, "(c >= 65 && c <= 91) || (c >= 97 && c <= 122)")]),
  m("K241", "0x40 accepted as a letter (range @ to Z)", [P("png.ts", LETTER, "(c >= 64 && c <= 90) || (c >= 97 && c <= 122)")]),
  m("K242", "0x7B accepted as a letter (range a to {)", [P("png.ts", LETTER, "(c >= 65 && c <= 90) || (c >= 97 && c <= 123)")]),
  m("K243", "0x60 accepted as a letter (range ` to z)", [P("png.ts", LETTER, "(c >= 65 && c <= 90) || (c >= 96 && c <= 122)")]),
  m("K244", "Latin-1 letters accepted in a chunk type", [P("png.ts", LETTER, LETTER + " || (c >= 0xc0 && c <= 0xff && c !== 0xd7 && c !== 0xf7)")]),
  m("K245", "digits accepted in a chunk type", [P("png.ts", LETTER, LETTER + " || (c >= 48 && c <= 57)")]),
  m("K246", "the first chunk compared to IHDR case-insensitively", [P("png.ts", FIRSTCHUNK, "chunks[0]!.type.toUpperCase() !== \"IHDR\"")]),
  m("K247", "the last chunk compared to IEND case-insensitively", [P("png.ts", LASTCHUNK, "last.type.toUpperCase() !== \"IEND\" || last.length !== 0")]),
  m("K248", "IEND length not required to be 0", [P("png.ts", LASTCHUNK, "last.type !== \"IEND\"")]),
  m("K249", "a leading byte order mark skipped", [P("manifest.ts", UTF8LINE, "  const text = ((t0: string | undefined) => (t0 !== undefined && t0.charCodeAt(0) === 0xfeff ? t0.slice(1) : t0))(utf8Decode(bytes));\n")]),
  m("K250", "invalid UTF-8 decoded with replacement characters", [P("manifest.ts", UTF8LINE, "  const text = new TextDecoder(\"utf-8\", { ignoreBOM: true }).decode(bytes);\n")]),
  m("K251", "UTF-8 encoded surrogates (ED A0 80) accepted", [P("limits.ts", " || (cp >= 0xd800 && cp <= 0xdfff)", "")]),
  m("K252", "the first value of a repeated key read instead of the last", [P("manifest.ts", NAMES_DECL, NAMES_DECL + WALK), P("manifest.ts", PARSEJSON, PARSEJSON + "  raw = walkJson(text).value;\n")]),
  m("K253", "a duplicate key reported as a syntax fault (SCHEMA)", [P("manifest.ts", NAMES_DECL, NAMES_DECL + WALK), P("manifest.ts", PARSEJSON, PARSEJSON + "  if (walkJson(text).dup) throw exportError(\"SCHEMA\", \"manifest\", \"duplicate key\");\n")]),
  m("K254", "a duplicate key not detected by the canonical-bytes check", [P("manifest.ts", NAMES_DECL, NAMES_DECL + WALK), P("manifest.ts", CANON, "if (!walkJson(text).dup && (again.length !== bytes.length || again.some((x, i) => x !== bytes[i]))) throw")]),
  m("K255", "numbers compared by value in the canonical-bytes check (398.0 and 1e2 accepted)", [P("manifest.ts", CANON, NUMNORM)]),
  m("K256", "a number spelled with a fraction or an exponent reported as SCHEMA instead of NON_CANONICAL", [P("manifest.ts", CANON, FRACEXP + CANON)]),
  m("K257", "-0 read as 0 and reported as NON_CANONICAL instead of SCHEMA", [P("manifest.ts", NEGZERO, ""), P("manifest.ts", PUSHENTRY, "    entries.push({ bytes: b + 0, media_type: mt, name: n as ArtifactName, sha256: s });")]),
  m("K258", "a lone surrogate escape reported as a syntax fault (SCHEMA)", [P("manifest.ts", PARSEJSON, PARSEJSON + LONESURR)]),
  m("K259", "artifact names judged before the closed key set and value types (entry order of passes swapped)", [P("manifest.ts", "  const allowed = [", "  { const arr0 = top.get(\"artifacts\"); if (Array.isArray(arr0)) for (const x of arr0) { const ee = plainEntries(x as unknown); const nn = ee?.get(\"name\"); if (typeof nn === \"string\" && !NAMES.includes(nn)) throw exportError(\"UNKNOWN_ARTIFACT\", \"manifest.artifacts\", \"unknown artifact name\"); } }\n  const allowed = [")]),
  m("K260", "canonical bytes judged right after the value-type pass, before names and order", [P("manifest.ts", NAMELOOP, CANON_EARLY + NAMELOOP)]),
  m("K261", "canonical bytes judged after the name pass but before the order pass", [P("manifest.ts", ORDLOOP, CANON_EARLY + ORDLOOP)]),
  m("K262", "expectedPngSize checked (and mismatching) even when no png is supplied", [P("bundle.ts", ARTLOOP, "  if (png === undefined && size !== undefined) throw exportError(\"PNG_SIZE_MISMATCH\", \"png\", \"no png\");\n" + ARTLOOP)]),
  m("K263", "a non-integer expectedPngSize reported as a configuration error instead of PNG_SIZE_MISMATCH", [P("bundle.ts", SIZECHK, "if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) throw new IaError(\"INVALID_CONFIG\", \"NOT_INTEGER\", \"options.expectedPngSize\");\n    if (have.width !== size.width || have.height !== size.height) throw")]),
  m("K264", "an expectedPngSize dimension of 0 treated as any size", [P("bundle.ts", SIZECHK, "if ((size.width !== 0 && have.width !== size.width) || (size.height !== 0 && have.height !== size.height)) throw")]),
  m("K265", "expectedPngSize compared modulo 2^32", [P("bundle.ts", SIZECHK, "if (have.width !== size.width % 4294967296 || have.height !== size.height % 4294967296) throw")]),
  m("K266", "expectedPngSize compared by absolute value", [P("bundle.ts", SIZECHK, "if (have.width !== Math.abs(size.width) || have.height !== Math.abs(size.height)) throw")]),
  m("K267", "expectedPngSize rounded before the comparison", [P("bundle.ts", SIZECHK, "if (have.width !== Math.round(size.width) || have.height !== Math.round(size.height)) throw")]),
  m("K268", "a falsy expectedPngSize dimension skips the check", [P("bundle.ts", SIZECHK, "if ((size.width && have.width !== size.width) || (size.height && have.height !== size.height)) throw")]),
  m("K311", "K158 restated (correction): last chunk not required to be IEND, the 45-byte minimum kept", [P("png.ts", "if (last.type !== \"IEND\" || last.length !== 0) throw malformed(\"IEND must come last\");", "void last;")]),
];

/** Mutants beyond the corpus table (audit 32-code-audit-b.md): ids start with `ext:`, killed by the behaviour checks of test/oracle/extra.ts. See scripts/ext-mutants.mjs. */
export { EXTRA_MUTANTS } from "./ext-mutants.mjs";
