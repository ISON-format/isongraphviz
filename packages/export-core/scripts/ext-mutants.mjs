// Mutants beyond the corpus table (audit 32-code-audit-b.md): ids start with `ext:`; they are killed by the behaviour checks of test/oracle/extra.ts (ids U-*),
// which the harness runs next to the oracle rows. `ext:K112-scan` is the documented EQUIVALENT mutant: on V8 JSON.parse is iterative, so the depth scan alone
// changes no result (the closed-key reader refuses the parsed nest with the same SCHEMA); it must survive. The other half of K112 (the unguarded JSON.parse)
// is killed by the oracle rows X31-X44 and X86 (invalid JSON, ambiguity A-75, added with the gap rows) and by the unit check U-MANIFEST-json. `ext:E16` is the second documented equivalent mutant: the
// size cap + 1 is refused one layer down by renderer-core `initialState` with the same INVALID_INPUT/OUT_OF_RANGE.
const P = (file, find, replace, count = 1) => ({ file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });
const LIM = "{ maxArtifactBytes: 268_435_456, maxPngBytes: 67_108_864, maxManifestBytes: 1_048_576 } as const";

export const EXTRA_MUTANTS = [
  m("ext:K112-scan", "only the depth scan is removed (equivalent on V8)", [P("manifest.ts", "  scanDepth(text);\n", "")]),
  m("ext:E19", "UTF-8 surrogate pair arithmetic << 9", [P("limits.ts", "((c - 0xd800) << 10)", "((c - 0xd800) << 9)")]),
  m("ext:E20", "UTF-8 decoder accepts the overlong E0 9F BF", [P("limits.ts", "n = 2; cp = c & 0x0f; min = 0x800;", "n = 2; cp = c & 0x0f; min = 0x7ff;")]),
  m("ext:E09", "manifest order not strict (<=)", [P("manifest.ts", "if (!(entries[i - 1]!.name < entries[i]!.name))", "if (!(entries[i - 1]!.name <= entries[i]!.name))")]),
  m("ext:E03", "PNG chunk type letters not checked", [P("png.ts", "if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) throw malformed(\"chunk type is not four ASCII letters\");", "void c;")]),
  m("ext:E04", "PNG IEND length not checked", [P("png.ts", "if (last.type !== \"IEND\" || last.length !== 0)", "if (last.type !== \"IEND\")")]),
  m("ext:E05", "binding keyword guard off by one", [P("png.ts", "c.length < KEYWORD.length + 1", "c.length <= KEYWORD.length + 1")]),
  m("ext:E16", "headless size cap + 1", [P("headless.ts", "x > VIEWPORT_MAX_PX", "x > VIEWPORT_MAX_PX + 1")]),
  m("ext:E18", "tree.events does not take precedence", [P("headless.ts", "{ events, ...treeOpts }", "{ ...treeOpts, events }")]),
  m("ext:E21", "readLimits upper bound 2^41", [P("limits.ts", "x > 2 ** 40", "x > 2 ** 41")]),
  m("ext:E22", "expectedPngSize accepts an extra key", [P("bundle.ts", "s.size !== 2 ||", "s.size < 2 ||")]),
  m("ext:I1", "copyBytes is a slice (a Buffer view)", [P("limits.ts", "export const copyBytes = (b: Uint8Array): Uint8Array => new Uint8Array(b);", "export const copyBytes = (b: Uint8Array): Uint8Array => b.slice();")]),
  m("ext:M1", "embedPngBinding accepts a fourth key", [P("png.ts", "bm.size !== 3", "bm.size < 3")]),
  m("ext:M3", "a lone surrogate is encoded as WTF-8", [P("limits.ts", "c >= 0xd800 && c <= 0xdfff ? 0xfffd : c", "c")]),
  m("ext:M4", "bytesArg accepts anything", [P("limits.ts", "if (!(v instanceof Uint8Array)) throw new IaError(\"INVALID_INPUT\", \"SCHEMA\", path, \"a Uint8Array expected\");", "void path;")]),
  m("ext:M12", "DEFAULT_EXPORT_LIMITS is not frozen", [P("limits.ts", `Object.freeze(${LIM})`, `(${LIM})`)]),
  m("ext:M2c", "headless intents are not snapshotted", [P("headless.ts", "[...(snap(\"intents\") as unknown[])]", "[...(intentsRaw as unknown[])]")]),
];
