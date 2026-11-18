// Behaviour checks of export-core beyond the oracle rows (audit 32-code-audit-b.md I-1, I-4, M-1 .. M-14), written as plain functions with no vitest
// import so that the SAME checks run in the unit suite (test/extra.test.ts) and against the scratch copies of the mutation harness (scripts/mutate.mjs: the
// `ext:` mutants of scripts/mutants-table.mjs are killed by these checks, reported as ids U-*). `lib` is the module namespace of src/index.ts, `int` the
// internal modules of src/ (utf8 codec, png helpers) imported by path.
import { buildRenderModel, initialState, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import type { Corpus } from "./runner.js";

export interface Check { id: string; run(): Promise<void> }
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const fail = (m: string): never => { throw new Error(m); };
const eq = (a: unknown, b: unknown, what: string): void => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const bytesEq = (a: Uint8Array, b: Uint8Array, what: string): void => { if (a.length !== b.length || a.some((x, i) => x !== b[i])) fail(`${what}: bytes differ`); };
async function rejects(f: () => unknown, code: string, reason: string, what: string): Promise<void> {
  try { await f(); } catch (e) { const k = `${(e as Any).code}/${(e as Any).reason}`; if (k !== `${code}/${reason}`) fail(`${what}: expected ${code}/${reason}, got ${k} ${(e as Error).message?.slice(0, 120)}`); return; }
  fail(`${what}: expected ${code}/${reason}, got no error`);
}
const tick = (): Promise<void> => Promise.resolve();
/** A Node Buffer holding a copy of the bytes: `Buffer.prototype.slice` is a view, which is what the audit found. */
const buf = (b: Uint8Array): Uint8Array => Buffer.from(b);
const flip = (b: Uint8Array): void => { for (let i = 0; i < b.length; i += 7) b[i] = b[i]! ^ 0x55; };

export function exportChecks(lib: Any, int: Any, c: Corpus): Check[] {
  const model = (): Promise<RenderModel> => buildRenderModel(c.read("scenes/O1.scene.json"), c.read("layouts/O1.layout.json"));
  const state = (m: RenderModel): SemanticState => initialState(m, { width: 900, height: 600 });
  const layout = (): Uint8Array => c.read("layouts/O1.layout.json");
  const png = (): Uint8Array => c.read("png/fixture.png");
  const checks: Check[] = [];
  const add = (id: string, run: () => Promise<void>): void => { checks.push({ id, run }); };

  // ---- I-1: a Buffer argument is copied (design 2, 14.1) ----
  for (const when of ["sync", "after-await"] as const) {
    const mut = async (...bs: Uint8Array[]): Promise<void> => { if (when === "after-await") await tick(); for (const b of bs) flip(b); };
    add(`U-BUF-export-${when}`, async () => {
      const m = await model(), s = state(m);
      const lay = buf(layout()), p = buf(png());
      const pr = lib.exportBundle(m, s, lay, { png: p });
      await mut(lay, p);
      const r = await pr;
      bytesEq(r.files.get("layout"), layout(), "layout artifact");
      await lib.verifyExportBundle(r.files, r.manifestBytes);
    });
    add(`U-BUF-verify-${when}`, async () => {
      const m = await model(), s = state(m);
      const r = await lib.exportBundle(m, s, layout(), { png: png() });
      const files = new Map<string, Uint8Array>([...r.files].map(([k, v]: [string, Uint8Array]) => [k, buf(v)]));
      const mb = buf(r.manifestBytes);
      const pr = lib.verifyExportBundle(files, mb);
      await mut(mb, ...files.values());
      eq((await pr).scene_sha256, r.manifest.scene_sha256, "verified");
    });
    add(`U-BUF-headless-${when}`, async () => {
      const sc = buf(c.read("scenes/O1.scene.json")), ly = buf(layout()), st = buf(c.read("states/O1.initial.state.json"));
      const want = await lib.renderHeadless({ sceneBytes: c.read("scenes/O1.scene.json"), layoutBytes: layout(), state: c.read("states/O1.initial.state.json"), outputs: ["state", "svg"] });
      const pr = lib.renderHeadless({ sceneBytes: sc, layoutBytes: ly, state: st, outputs: ["state", "svg"] });
      await mut(sc, ly, st);
      const r = await pr;
      bytesEq(r.files.get("svg"), want.files.get("svg"), "svg");
    });
    add(`U-BUF-png-${when}`, async () => {
      const f = buf(png());
      const out = lib.embedPngBinding(f, { scene: "a".repeat(64), layout: "b".repeat(64), state: "c".repeat(64) });
      await mut(f);
      eq(lib.readPngBinding(out)?.scene, "a".repeat(64), "binding survives mutation of the input");
      const o2 = buf(out);
      const rb = lib.readPngBinding(o2);
      await mut(o2);
      eq(rb?.state, "c".repeat(64), "readPngBinding result is owned");
    });
  }
  add("U-BUF-manifest", async () => {
    const m = await model();
    const r = await lib.exportBundle(m, state(m), layout());
    const mb = buf(r.manifestBytes);
    const parsed = lib.parseExportManifest(mb);
    flip(mb);
    eq(parsed.artifacts.length, r.manifest.artifacts.length, "parsed manifest owned");
  });

  // ---- M-4: structured errors for wrong-typed binary arguments ----
  add("U-ARGS", async () => {
    const m = await model(), s = state(m);
    await rejects(() => lib.exportBundle(m, s, undefined), "INVALID_INPUT", "SCHEMA", "layout undefined");
    await rejects(() => lib.exportBundle(m, s, "abc"), "INVALID_INPUT", "SCHEMA", "layout string");
    await rejects(() => lib.verifyExportBundle({}, new Uint8Array(1)), "INVALID_INPUT", "SCHEMA", "files not a Map");
    await rejects(() => lib.verifyExportBundle(new Map(), undefined), "INVALID_INPUT", "SCHEMA", "manifest undefined");
    await rejects(() => lib.embedPngBinding(undefined, {}), "INVALID_INPUT", "SCHEMA", "png undefined");
    await rejects(() => lib.readPngBinding([1, 2, 3]), "INVALID_INPUT", "SCHEMA", "png array");
    await rejects(() => lib.parseExportManifest("abc"), "INVALID_INPUT", "SCHEMA", "manifest string");
  });

  // ---- M-1: embedPngBinding reads each property once and accepts exactly three keys ----
  add("U-EMBED-once", async () => {
    let reads = 0;
    const b: Any = { layout: "b".repeat(64), state: "c".repeat(64) };
    Object.defineProperty(b, "scene", { enumerable: true, get() { reads++; return reads === 1 ? "a".repeat(64) : "A\u0000B"; } });
    await rejects(() => lib.embedPngBinding(png(), b), "INVALID_EXPORT", "SCHEMA", "an accessor is refused");
    await rejects(() => lib.embedPngBinding(png(), { scene: "a".repeat(64), layout: "b".repeat(64), state: "c".repeat(64), extra: "x" }), "INVALID_EXPORT", "SCHEMA", "a fourth key");
  });

  // ---- I-4 / M-3: the UTF-8 codec against TextEncoder / TextDecoder ----
  add("U-UTF8-encode", async () => {
    const te = new TextEncoder();
    const cps = [0, 1, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10001, 0x1f600, 0x10ffff, 0xfffd];
    for (let cp = 0x400; cp < 0x110000; cp += 0x1237) if (cp < 0xd800 || cp > 0xdfff) cps.push(cp);
    for (const cp of cps) { const s = String.fromCodePoint(cp); bytesEq(int.utf8Encode(`a${s}b`), te.encode(`a${s}b`), `U+${cp.toString(16)}`); }
    for (const lone of ["\ud800", "\udfff", "a\ud83d", "\ude00b", "\ud83d😀"]) bytesEq(int.utf8Encode(lone), te.encode(lone), `lone surrogate ${JSON.stringify(lone)}`); // TextEncoder semantics: U+FFFD
    const big = "x\u{1f600}".repeat(20000);
    bytesEq(int.utf8Encode(big), te.encode(big), "long astral string");
  });
  add("U-UTF8-decode", async () => {
    const td = new TextDecoder("utf-8", { fatal: true });
    const ref = (b: Uint8Array): string | undefined => { try { return td.decode(b); } catch { return undefined; } };
    for (const hexs of ["e09fbf", "e0a080", "edA080", "ed9fbf", "f08fbfbf", "f0908080", "f4908080", "f48fbfbf", "c080", "c2", "e0a0", "f0", "80", "c2a9", "ff", "e18080", "f1808080"]) {
      const b = Uint8Array.from(hexs.match(/../g)!.map((h) => parseInt(h, 16)));
      eq(int.utf8Decode(b), ref(b), `decode ${hexs}`);
    }
    let seed = 12345;
    const next = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let i = 0; i < 4000; i++) { const n = 1 + (next() >>> 24) % 6; const b = Uint8Array.from({ length: n }, () => [0x41, 0x7f, 0x80, 0xbf, 0xc2, 0xe0, 0xe1, 0xed, 0xf0, 0xf4, 0xf5, 0xa0, 0x9f, 0x8f, 0x90][(next() >>> 24) % 15]!); eq(int.utf8Decode(b), ref(b), `random ${i}`); }
  });

  // ---- I-4: manifest strict order, PNG container rules, limits, headless corners ----
  add("U-MAN-order", async () => {
    const j = JSON.parse(new TextDecoder().decode(c.read("json/X02.manifest.json"))) as Any;
    j.artifacts.splice(1, 0, JSON.parse(JSON.stringify(j.artifacts[0])));
    await rejects(() => lib.parseExportManifest(new TextEncoder().encode(JSON.stringify(j))), "INVALID_EXPORT", "SCHEMA", "two adjacent layout entries");
  });
  const withChunk = (insertAt: number, type: string, data: Uint8Array): Uint8Array => {
    const p = png();
    const ch = new Uint8Array(12 + data.length);
    new DataView(ch.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i++) ch[4 + i] = type.charCodeAt(i);
    ch.set(data, 8);
    return Uint8Array.from([...p.slice(0, insertAt), ...ch, ...p.slice(insertAt)]);
  };
  add("U-PNG-rules", async () => {
    const p = png();
    const m = (b: Uint8Array): Promise<void> => rejects(() => lib.readPngBinding(b), "INVALID_EXPORT", "PNG_MALFORMED", "malformed png");
    await m(withChunk(33, "ab1d", new Uint8Array(0)));
    const noEnd = p.slice(); noEnd[noEnd.length - 12 + 3] = 1; // IEND length 1 (and 1 byte too many: the framing refuses as well)
    await m(Uint8Array.from([...p.slice(0, p.length - 12), 0, 0, 0, 1, 0x49, 0x45, 0x4e, 0x44, 0xff, 0, 0, 0, 0]));
    await m(withChunk(33, "tEXt", Uint8Array.from("igr-export\u0000".split("").map((ch) => ch.charCodeAt(0))))); // a binding chunk of 11 bytes: empty text is off the template
    await m(p.slice(0, 44));
    eq(lib.readPngBinding(withChunk(33, "tEXt", Uint8Array.from("other\u0000x".split("").map((ch) => ch.charCodeAt(0))))), undefined, "another keyword is ignored");
    await rejects(() => lib.embedPngBinding(withChunk(33, "tEXt", Uint8Array.from("igr-export\u0000".split("").map((ch) => ch.charCodeAt(0)))), { scene: "a".repeat(64), layout: "b".repeat(64), state: "c".repeat(64) }), "INVALID_EXPORT", "PNG_ALREADY_BOUND", "a short binding chunk still counts as bound");
  });
  add("U-LIMITS", async () => {
    const m = await model(), s = state(m);
    const ok = await lib.exportBundle(m, s, layout(), { svg: false, limits: { maxArtifactBytes: 2 ** 40 } });
    eq(ok.manifest.artifacts.length, 3, "2^40 accepted");
    await rejects(() => lib.exportBundle(m, s, layout(), { limits: { maxPngBytes: 2 ** 40 + 1 } }), "INVALID_CONFIG", "OUT_OF_RANGE", "2^40 + 1");
    await rejects(() => lib.exportBundle(m, s, layout(), { png: png(), expectedPngSize: { width: 1, height: 1, depth: 8 } }), "INVALID_CONFIG", "SCHEMA", "expectedPngSize extra key");
    if (!Object.isFrozen(lib.DEFAULT_EXPORT_LIMITS)) fail("DEFAULT_EXPORT_LIMITS must be frozen");
  });
  add("U-HEAD", async () => {
    const base = { sceneBytes: c.read("scenes/O1.scene.json"), layoutBytes: layout(), outputs: ["state"] };
    eq((await lib.renderHeadless({ ...base, size: { width: 16384, height: 10 } })).state.viewport.width, 16384, "size at the maximum");
    await rejects(() => lib.renderHeadless({ ...base, size: { width: 16385, height: 10 } }), "INVALID_INPUT", "OUT_OF_RANGE", "size above the maximum");
    const ev = [{ type: "selection-changed", selection: [] }];
    const r = await lib.renderHeadless({ ...base, outputs: ["tree"], tree: { events: ev }, intents: [{ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] }, { type: "focus", target: { node: { id: "i:1", type: "person" } } }] });
    if (!new TextDecoder().decode(r.files.get("tree")).includes('"text":"1 selected."')) fail("tree.events must take precedence over the intents' events");
    const r2 = await lib.renderHeadless({ ...base, outputs: ["tree"], intents: [{ type: "focus", target: { node: { id: "i:1", type: "person" } } }] });
    if (!new TextDecoder().decode(r2.files.get("tree")).includes('"text":"person 1"')) fail("without tree.events the intents' events feed the live text");
    // caller-owned objects are read once, before the first await
    const intents: Any[] = [{ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] }];
    const pr = lib.renderHeadless({ ...base, intents });
    intents[0].mode = "nope"; intents.push({ type: "bogus" });
    eq((await pr).events.length, 1, "intents snapshot");
    const g: Any = { ...base }; Object.defineProperty(g, "svg", { enumerable: true, get() { return {}; } });
    await rejects(() => lib.renderHeadless({ ...base, svg: g.svg, dl: (() => { const o = {}; Object.defineProperty(o, "x", { enumerable: true, get() { return 1; } }); return o; })() }), "INVALID_INPUT", "SCHEMA", "an accessor in dl");
  });
  add("U-MANIFEST-json", async () => {
    await rejects(() => lib.parseExportManifest(new TextEncoder().encode("{")), "INVALID_EXPORT", "SCHEMA", "invalid JSON is SCHEMA, never a SyntaxError");
    await rejects(() => lib.parseExportManifest(new TextEncoder().encode("[".repeat(100_000) + "]".repeat(100_000))), "INVALID_EXPORT", "SCHEMA", "a bracket bomb");
  });
  return checks;
}
