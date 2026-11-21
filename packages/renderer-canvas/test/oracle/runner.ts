// The oracle row runner for fixtures/oracles-dl, renderer side (design 13.2, 13.3). The `both` rows of the function families are re-run against the
// Canvas renderer (its list, stream, pick, bounds and readout), and the `subject` rows U01-U21 are the lifecycle scripts and the outcome files. The
// function side of every row is packages/display-list/test/oracle/runner.ts (imported, so the corpus logic exists once). Parameterized by the
// implementation under test so that the same code runs against src/ and against scratch mutants (scripts/mutate.mjs).
import { IgrError, hitTest, initialState, verifyManifest } from "isongraph-visualize-renderer-core";
import type { ElementAddress, RenderModel, Renderer, SemanticState } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { AUDIT_ROWS } from "../../../display-list/test/audit-rows.js";
import * as Dl from "isongraph-visualize-display-list";
import * as Cv from "isongraph-visualize-display-list/canvas2d";
import {
  code, eq, eqBytes, fail, modelAndState, parseInput, sha256, type Oracle, type Row, type RowResult,
} from "../../../display-list/test/oracle/runner.js";

export { loadOracle, verifySums, sumsDigest, type Oracle, type Row, type RowResult } from "../../../display-list/test/oracle/runner.js";

// ---- the implementation under test ----------------------------------------------------------------------------------------------
export interface CanvasRendererLike extends Renderer {
  displayList(): ReturnType<typeof Dl.buildDisplayList>;
  displayListBytes(): Uint8Array;
  canvasCalls(): Uint8Array;
  pick(point: { x: number; y: number }): ElementAddress | undefined;
  elementBounds(): ReturnType<typeof Dl.elementBounds>;
  status(): { phase: string; failure?: string };
}
export interface CvImpl {
  createCanvasRenderer(options?: unknown): CanvasRendererLike;
  canvasManifest(host: "headless" | "dom", options?: unknown): unknown;
  createCanvasSubject(options?: unknown): { manifest: unknown; create(env: unknown): Promise<Renderer>; witness?(r: Renderer): Promise<unknown> };
}
export type FnImpl = typeof Dl & typeof Cv;
export interface RendererImpl extends CvImpl { fn: FnImpl }

const cj = (v: unknown): Uint8Array => canonicalBytesSigned(v as CJValue);
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const addr = (x: unknown): ElementAddress | undefined => (x === null || x === undefined ? undefined : (x as ElementAddress));
const SIZE = { width: 900, height: 600 };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function token(v: unknown): unknown { return v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : v; }
function tokens(options: unknown): unknown {
  if (Array.isArray(options)) return options.map(tokens);
  if (typeof options !== "object" || options === null) return token(options);
  const out: Record<string, unknown> = { ...(options as Record<string, unknown>) };
  for (const k of Object.keys(out)) out[k] = tokens(out[k]);
  return out;
}

async function load(impl: RendererImpl, model: RenderModel, state: SemanticState, options: unknown): Promise<CanvasRendererLike> {
  const r = impl.createCanvasRenderer(options);
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model, state);
  return r;
}

// ---- both rows, renderer side ---------------------------------------------------------------------------------------------------------
async function listRow(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const model = await c.model(row.scene, row.layout);
  const options = tokens(input["options"]);
  const cases: { state?: string; expected: string }[] = [{ state: input["state"] as string, expected: row.expected }, ...((input["also"] as { state: string; expected: string }[]) ?? [])];
  for (const k of cases) {
    const { state } = await modelAndState(c, row, input, k.state);
    const r = await load(impl, model, state, options === undefined ? undefined : { dl: options });
    if (row.error) {
      let got = "none";
      try { r.displayListBytes(); } catch (e) { got = code(e); }
      if (got !== row.error) fail(`${row.id} displayListBytes(): got ${got} want ${row.error}`);
      got = "none";
      try { r.displayList(); } catch (e) { got = code(e); }
      if (got !== row.error) fail(`${row.id} displayList(): got ${got} want ${row.error}`);
      await r.dispose();
      continue;
    }
    eqBytes(`${row.id} displayListBytes() ${k.expected}`, r.displayListBytes(), c.bytes(k.expected));
    eqBytes(`${row.id} serialize(displayList())`, impl.fn.serializeDisplayList(r.displayList()), c.bytes(k.expected));
    await r.dispose();
  }
}

async function pickRow(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const { model, state } = await modelAndState(c, row, input);
  const r = await load(impl, model, state, undefined);
  let i = 0;
  for (const p of input["points"] as { x: unknown; y: unknown; hit?: ElementAddress; error?: string }[]) {
    i++;
    const pt = { x: token(p.x) as number, y: token(p.y) as number };
    let got: ElementAddress | undefined, err = "none";
    try { got = r.pick(pt); } catch (e) { err = code(e); }
    if (p.error) { if (err !== p.error) fail(`${row.id} renderer.pick point ${i}: got ${err} want ${p.error}`); continue; }
    if (err !== "none") fail(`${row.id} renderer.pick point ${i}: threw ${err}`);
    eq(`${row.id} renderer.pick point ${i}`, addr(got), addr(p.hit));
  }
  await r.dispose();
}

async function boundsRow(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const { model, state } = await modelAndState(c, row, parseInput(row));
  const r = await load(impl, model, state, undefined);
  eqBytes(`${row.id} renderer.elementBounds()`, impl.fn.serializeBounds(r.elementBounds()), c.bytes(row.expected));
  await r.dispose();
}

/** The renderer has the two replay options `dprMilli` and `ink`; the replay-only options (layers, onElement) and C13, C18 are function rows. */
async function callsRow(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const replay = (input["replay"] ?? {}) as Json;
  if (Object.keys(replay).some((k) => k !== "dprMilli" && k !== "ink") || row.id === "C18") return;
  const { model, state } = await modelAndState(c, row, input);
  const options: Json = {};
  if (input["options"] !== undefined) options["dl"] = tokens(input["options"]);
  for (const k of ["dprMilli", "ink"]) if (replay[k] !== undefined) options[k] = replay[k];
  if (row.error) {
    let got = "none";
    try { impl.createCanvasRenderer(options); } catch (e) { got = code(e); }
    if (got !== row.error) fail(`createCanvasRenderer: got ${got} want ${row.error}`);
    return;
  }
  const r = await load(impl, model, state, options);
  eqBytes(`${row.id} renderer.canvasCalls()`, r.canvasCalls(), c.bytes(row.expected));
  await r.dispose();
}

async function readoutRow(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  if (input["from"] !== "list") return;
  const { model, state } = await modelAndState(c, row, input);
  const r = await load(impl, model, state, undefined);
  const list = r.displayList();
  const want = c.bytes(row.expected);
  eqBytes(`${row.id} readoutFromList(renderer.displayList())`, impl.fn.serializeReadout(impl.fn.readoutFromList(list)), want);
  eqBytes(`${row.id} readoutFromCanvasStream(renderer.canvasCalls())`, impl.fn.serializeReadout(impl.fn.readoutFromCanvasStream(r.canvasCalls(), list)), want);
  await r.dispose();
}

// ---- U rows --------------------------------------------------------------------------------------------------------------------------------
interface Call { op: string; arg?: any; expect: string; await?: boolean; expect_state?: string; expect_dl?: string; expect_calls?: string; expect_hit?: unknown; expect_fidelity?: unknown; expect_media_type?: string; expect_bytes_sha256?: string } // eslint-disable-line @typescript-eslint/no-explicit-any
interface Script { calls: Call[]; env: { host: string; reducedMotion: boolean; size: { width: number; height: number } }; listener: string; model: { scene: string; layout: string } }

async function runScript(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const script = c.json(row.input) as Script;
  const model = await c.model(script.model.scene, script.model.layout);
  let renderer: CanvasRendererLike = impl.createCanvasRenderer();
  let pending: Promise<unknown> | undefined;
  let i = 0;
  for (const call of script.calls) {
    i++;
    const where = `${row.id} call ${i} (${call.op})`;
    let got = "ok";
    let result: unknown;
    const r = renderer;
    try {
      switch (call.op) {
        case "create": renderer = impl.createCanvasRenderer(tokens(call.arg)); break;
        case "initialize": await r.initialize({ ...script.env, ...(call.arg ?? {}) } as never); break;
        case "loadScene": {
          const m = call.arg?.model ? await c.model(call.arg.model.scene, call.arg.model.layout) : model;
          const p = r.loadScene(m);
          if (call.await === false) { pending = p; p.catch(() => undefined); } else { await p; }
          break;
        }
        case "render": await r.render(); if (pending) { await pending; pending = undefined; } break;
        case "displayList": result = r.displayListBytes(); break;
        case "canvasCalls": result = r.canvasCalls(); break;
        case "dispatch": result = r.dispatch(call.arg); break;
        case "getState": result = r.getState(); break;
        case "probe": result = r.probe(); break;
        case "pick": result = r.pick(call.arg); break;
        case "hitTest": result = r.hitTest(call.arg); break;
        case "export": result = await r.export(call.arg); break;
        case "setReducedMotion": r.setReducedMotion(call.arg); break;
        case "dispose": await r.dispose(); break;
        default: fail(`${where}: unknown op`);
      }
    } catch (e) { got = code(e); }
    if (got !== call.expect) fail(`${where}: got ${got} want ${call.expect}`);
    if (got !== "ok") continue;
    if (call.expect_dl !== undefined) eqBytes(`${where} displayList`, result as Uint8Array, c.bytes(call.expect_dl));
    if (call.expect_calls !== undefined) eqBytes(`${where} canvasCalls`, result as Uint8Array, c.bytes(call.expect_calls));
    if (call.expect_state !== undefined) eq(`${where} state`, call.op === "dispatch" ? r.getState() : result, c.json(call.expect_state));
    if (call.expect_fidelity !== undefined) eq(`${where} fidelity`, (result as { fidelity: unknown }).fidelity, call.expect_fidelity);
    if (call.op === "pick" || call.op === "hitTest") eq(`${where} hit`, addr(result), addr(call.expect_hit));
    if (call.op === "export") {
      const ex = result as { media_type: string; bytes: Uint8Array };
      if (call.expect_media_type !== undefined) eq(`${where} media type`, ex.media_type, call.expect_media_type);
      if (call.expect_bytes_sha256 !== undefined) eq(`${where} bytes sha`, sha256(ex.bytes), call.expect_bytes_sha256);
    }
  }
  if (pending) await pending;
}

async function u06(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  for (const host of parseInput(row)["hosts"] as ("headless" | "dom")[]) {
    const m = impl.canvasManifest(host);
    if (!sameBytes(cj(m), c.bytes(`json/U06.${host}.manifest.json`))) fail(`canvasManifest(${host}) bytes differ from json/U06.${host}.manifest.json`);
    verifyManifest(m);
  }
}

async function u07(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const want = c.json(row.expected) as { options: unknown; result: string }[];
  const cases = parseInput(row)["cases"] as unknown[];
  eq("U07 case count", want.length, cases.length);
  for (const k of want) {
    const options = tokens(k.options);
    let got = "ok";
    try { impl.createCanvasRenderer(options); } catch (e) { got = code(e); }
    if (got !== k.result) fail(`createCanvasRenderer(${JSON.stringify(k.options)}): got ${got} want ${k.result}`);
    let manifestGot = "ok";
    try { impl.canvasManifest("headless", options); } catch (e) { manifestGot = code(e); }
    if (manifestGot !== k.result) fail(`canvasManifest(${JSON.stringify(k.options)}): got ${manifestGot} want ${k.result}`);
  }
}

/**
 * The witness rows: U09 and U15-U21 (an inline input with a `calls` path). U09 has empty scene and layout cells: the list is the one of the C row whose stream
 * is named (the table is all the witness takes from it) and the expected file is json/U09.<C row>.witness.json. U15-U21 fill the scene and layout cells
 * (AMBIGUITIES A-52): the list is built from them with the initial state and the row names its outcome (an error, or the expected witness file).
 */
async function witnessRow(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const cases = [{ calls: input["calls"] as string }, ...((input["also"] as { calls: string }[]) ?? [])];
  for (const k of cases) {
    let list: ReturnType<typeof impl.fn.buildDisplayList>, want: Uint8Array | undefined;
    if (row.scene === "") {
      const id = /(C\d+)\.calls$/.exec(k.calls)![1]!;
      const src = c.byId.get(id)!;
      const { model, state } = await modelAndState(c, src, parseInput(src));
      list = impl.fn.buildDisplayList(model, state, tokens(parseInput(src)["options"]) as never);
      want = c.bytes(`json/U09.${id}.witness.json`);
    } else {
      const { model, state } = await modelAndState(c, row, { state: "initial" });
      list = impl.fn.buildDisplayList(model, state);
      want = row.expected === "" ? undefined : c.bytes(row.expected);
    }
    let got = "none", bytes: Uint8Array | undefined;
    try { bytes = cj(impl.fn.canvasStreamWitness(c.bytes(k.calls), list)); } catch (e) { got = code(e); }
    if (row.error) {
      if (got !== row.error) fail(`${row.id}: canvasStreamWitness(${k.calls}) got ${got} want ${row.error}`);
      if (bytes !== undefined) fail(`${row.id}: a witness was returned for a refused stream`);
      continue;
    }
    if (got !== "none" || bytes === undefined) fail(`${row.id}: canvasStreamWitness(${k.calls}) threw ${got}`);
    if (!sameBytes(bytes!, want!)) fail(`canvasStreamWitness(${k.calls}) bytes differ from the expected witness`);
  }
}

async function u13(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const model = await c.model(row.scene, row.layout);
  const want = c.json(row.expected) as { render: string; displayListBytes: string; displayList: string };
  const r = impl.createCanvasRenderer(input["subject_options"]);
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model);
  const run = async (f: () => unknown): Promise<string> => { try { await f(); return "ok"; } catch (e) { return code(e); } };
  eq("U13 render()", await run(() => r.render()), want.render);
  eq("U13 displayListBytes()", await run(() => r.displayListBytes()), want.displayListBytes);
  eq("U13 displayList()", await run(() => r.displayList()), want.displayList);
}

// ---- heavy rows: the kit run over the IGR/1 corpus (U10, U11, U12) ------------------------------------------------------------------------------
export const HEAVY = new Set(["U10", "U11", "U12"]);

/** Splits a stream into its marker sections: the lines before the first marker, then one array per marker. */
function sectionsOf(stream: string): string[][] {
  const out: string[][] = [[]];
  for (const l of stream.split("\n")) { if (l === "") continue; if (l.startsWith('["#"')) out.push([l]); else out[out.length - 1]!.push(l); }
  return out;
}

export async function runHeavy(impl: RendererImpl, c: Oracle, row: Row, igrCorpusDir: string): Promise<void> {
  const { runConformance } = await import("isongraph-visualize-renderer-core");
  const { loadCorpus } = await import("isongraph-visualize-renderer-core/conformance/node");
  const corpus = await loadCorpus(igrCorpusDir);
  if (row.id === "U10") {
    const rep = await runConformance(impl.createCanvasSubject() as never, corpus, { seeds: [1] });
    if (rep.verdict === "fail") fail(`kit verdict fail: ${JSON.stringify(rep.results.filter((r) => r.verdict === "fail").slice(0, 4))}`);
    eq("U10 level", rep.level, 2);
    eq("U10 claimable", rep.claimable, false);
    return;
  }
  if (row.id === "U11") {
    const want = c.json(row.expected) as { honest: boolean; drops_painting_calls_W01_passes: boolean; omits_element_W01_passes: boolean; probe_stays_correct: boolean };
    const honest = impl.createCanvasSubject();
    const double = (edit: (stream: string) => string) => ({
      ...honest,
      create: async (env: unknown) => {
        const r = (await honest.create(env)) as CanvasRendererLike;
        const orig = r.canvasCalls.bind(r);
        r.canvasCalls = () => new TextEncoder().encode(edit(new TextDecoder().decode(orig())));
        return r;
      },
    });
    // keeps the marker of the first node in layer 7 and drops its painting calls
    const dropsPainting = (s: string): string => {
      const secs = sectionsOf(s);
      const at = secs.findIndex((x) => x[0]!.endsWith(",7]"));
      return secs.map((x, i) => (i === at ? [x[0]!] : x)).flat().join("\n") + "\n";
    };
    // omits the first element (a node: its layer 7 section is dropped altogether)
    const omits = (s: string): string => {
      const secs = sectionsOf(s);
      const at = secs.findIndex((x) => x[0]!.endsWith(",7]"));
      return secs.filter((_, i) => i !== at).flat().join("\n") + "\n";
    };
    const verdict = async (subject: unknown): Promise<string | undefined> => (await runConformance(subject as never, corpus, { seeds: [1] })).results.find((r) => r.id === "W01")?.verdict;
    eq("U11 honest W01 passes", (await verdict(honest)) === "pass", want.honest);
    eq("U11 drops_painting_calls W01 passes", (await verdict(double(dropsPainting))) === "pass", want.drops_painting_calls_W01_passes);
    eq("U11 omits_element W01 passes", (await verdict(double(omits))) === "pass", want.omits_element_W01_passes);
    // probe() stays correct while the stream lies: the double's drawn set equals the honest renderer's
    const model = await c.model(row.scene, row.layout);
    const a = (await honest.create({})) as CanvasRendererLike, b = (await double(dropsPainting).create({})) as CanvasRendererLike;
    for (const r of [a, b]) { await r.initialize({ host: "headless", size: SIZE, reducedMotion: false }); await r.loadScene(model); }
    eq("U11 probe stays correct", JSON.stringify(a.probe().drawn) === JSON.stringify(b.probe().drawn), want.probe_stays_correct);
    return;
  }
  if (row.id === "U12") {
    const input = parseInput(row);
    const want = c.json(row.expected) as { capacity: unknown; fidelity_agrees_with_manifest: boolean; labels_edge: unknown; manifest_bytes_equal: boolean; manifest_valid: boolean };
    const subject = impl.createCanvasSubject(input["subject_options"]);
    const rep = await runConformance(subject as never, corpus, { only: ["L01"], seeds: [1] });
    eq("U12 CHK-CAP passes", rep.results.some((r) => r.check === "CHK-CAP" && r.verdict === "fail"), false);
    const model = await c.model(row.scene, row.layout);
    const r = (await subject.create({ host: "headless" })) as CanvasRendererLike;
    await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
    await r.loadScene(model);
    eq("U12 manifest bytes equal", sameBytes(cj(subject.manifest), cj(r.manifest)), want.manifest_bytes_equal);
    eq("U12 manifest valid", (() => { try { verifyManifest(r.manifest); return true; } catch { return false; } })(), want.manifest_valid);
    eq("U12 capacity", r.manifest.capacity, want.capacity);
    eq("U12 labels.edge", (r.manifest.capabilities as Record<string, unknown>)["labels.edge"], want.labels_edge);
    const f = r.probe().fidelity;
    eq("U12 fidelity agrees with the manifest", f.edge_labels === false && f.degradations.includes("EDGE_LABELS_OMITTED"), want.fidelity_agrees_with_manifest);
    return;
  }
}

// ---- dispatch ------------------------------------------------------------------------------------------------------------------------------
/** The renderer-side groups: the `both` rows of G N X Y O P B C R, and the U rows. Core rows are the function side only. */
export async function runRow(impl: RendererImpl, c: Oracle, row: Row): Promise<void> {
  if (row.tier === "both") {
    switch (row.group) {
      case "G": case "N": case "X": case "Y": case "O": return listRow(impl, c, row);
      case "P": return pickRow(impl, c, row);
      case "B": return boundsRow(impl, c, row);
      case "C": return callsRow(impl, c, row);
      case "R": return readoutRow(impl, c, row);
      default: return;
    }
  }
  if (row.group !== "U") return;
  if (HEAVY.has(row.id)) return fail("heavy row: run through runHeavy");
  // by the form of the input (13.2): a path is a script; an inline object is told by its key
  if (!/^[{[]/.test(row.input)) return runScript(impl, c, row);
  const input = parseInput(row);
  if (typeof input["calls"] === "string") return witnessRow(impl, c, row);
  if (input["hosts"] !== undefined) return u06(impl, c, row);
  if (input["cases"] !== undefined) return u07(impl, c, row);
  if (input["subject_options"] !== undefined) return u13(impl, c, row);
  return fail(`${row.id}: an inline U input of an unknown form`);
}

export const RENDERER_GROUPS = new Set(["G", "N", "X", "Y", "O", "P", "B", "C", "R", "U"]);

/** Runs every renderer-side row (or the ids given), heavy rows excluded; never throws: failures are returned. */
export async function runAll(impl: RendererImpl, c: Oracle, ids?: readonly string[]): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const row of c.rows) {
    if (!RENDERER_GROUPS.has(row.group) || (row.tier !== "both" && row.group !== "U")) continue;
    if (ids ? !ids.includes(row.id) : HEAVY.has(row.id)) continue;
    try { await runRow(impl, c, row); out.push({ id: row.id, ok: true }); }
    catch (e) { out.push({ id: row.id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}

void IgrError; void hitTest;

// ---- extra rows (ext:), mutation-matrix only ------------------------------------------------------------------------------------------------------
// Rows of this implementation that are not in the corpus: they pin behaviour that the corpus rows cannot separate in this implementation because
// renderer-core's own validation answers with the same code (defence in depth), so that a mutant of the check cannot hide behind it. They run in the
// mutation harness and in test/extra.test.ts; they are never reported as oracle rows.
export async function runExtra(impl: RendererImpl, oracle?: Oracle): Promise<RowResult[]> {
  const out: RowResult[] = [];
  const run = async (id: string, f: () => Promise<void> | void): Promise<void> => {
    try { await f(); out.push({ id, ok: true }); } catch (e) { out.push({ id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  };
  await run("ext:K154", () => {
    // 4.5: the model is validated before the options: a non-model with a bad option is NOT_A_RENDER_MODEL, not SCHEMA
    let got = "none";
    try { impl.fn.buildDisplayList({} as never, {} as never, { bogus: 1 } as never); } catch (e) { got = code(e); }
    eq("ext:K154 non-model first", got, "INVALID_INPUT/NOT_A_RENDER_MODEL");
  });
  for (const row of AUDIT_ROWS) await run(row.id, () => row.run(impl.fn, { text: (rel) => (oracle as Oracle).text(rel) }));
  await run("ext:M4", () => {
    // 27 14: renderer options are read once and an accessor is refused (audit M-4)
    const cap = { get maxNodes(): number { return 7; } };
    let got = "none";
    try { impl.canvasManifest("headless", { capacity: cap }); } catch (e) { got = code(e); }
    eq("ext:M4 accessor", got, "INVALID_INPUT/SCHEMA");
  });
  if (oracle !== undefined) {
    await run("ext:M3", async () => {
      // 5.2 and audit M-3: renderer.pick uses the list of the renderer's own options: with labels off, a node whose label (y + 24000) would be beyond 2^40 is pickable
      const model = await oracle.model("scenes/far-u.scene.json", "layouts/far-u.layout.json");
      const base = initialState(model, SIZE);
      const state = { ...base, viewport: { ...base.viewport, center_x: 450000, center_y: 300000 + 1000 - 2 ** 40, zoom: 1000 } };
      const r = impl.createCanvasRenderer({ dl: { labels: false } });
      await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
      await r.loadScene(model, state);
      r.displayList();
      eq("ext:M3 pick", r.pick({ x: 10, y: 10 }) ?? null, null);
      const plain = impl.createCanvasRenderer();
      await plain.initialize({ host: "headless", size: SIZE, reducedMotion: false });
      await plain.loadScene(model, state);
      let got = "none";
      try { plain.pick({ x: 10, y: 10 }); } catch (e) { got = code(e); }
      eq("ext:M3 default options still refuse", got, "INVALID_INPUT/OUT_OF_RANGE");
    });
    await run("ext:B10", async () => {
      // a load that is refused keeps the previous scene and its model in the registry (audit B10)
      const r = impl.createCanvasRenderer({ capacity: { maxNodes: 2 } });
      await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
      await r.loadScene(await oracle.model("../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json"));
      let got = "none";
      try { await r.loadScene(await oracle.model("../oracles-igl/scenes/mixed20.scene.json", "../oracles-igl/layouts/F04.layout.json")); } catch (e) { got = code(e); }
      eq("ext:B10 refused", got, "RESOURCE_LIMIT/NODE_LIMIT");
      eq("ext:B10 previous scene kept", r.displayList().nodes.length, 2);
    });
  }
  return out;
}
