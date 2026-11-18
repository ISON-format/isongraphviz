// The oracle row runner for fixtures/oracles-dl, function rows (design 13.2, 13.3, 14 (2)). It is parameterized by the implementation under test
// (`Impl`) so that the same row logic runs against src/ (test/oracle.test.ts) and against scratch mutants (renderer-canvas/scripts/mutate.mjs).
// It is test code: it never imports src/ for behaviour (only for types) and re-derives what it needs.
//
// Tiers (13.2): `core` rows are a function on bytes; `both` rows are the function AND the subject renderer. This runner is the function side of
// both; the renderer side and the `subject` rows (U) are packages/renderer-canvas/test/oracle/runner.ts. K rows are the mutation matrix, D rows
// are runtime differential tests (test/differential.test.ts).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { IgrError, buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import type { ElementAddress, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import type * as Dl from "../../src/index.js";
import type * as Cv from "../../src/canvas2d/index.js";
import { scrapeSvg } from "./svg-scrape.js";

export type Impl = typeof Dl & typeof Cv;

// ---- the corpus ---------------------------------------------------------------------------------------------------------
export interface Row { id: string; group: string; tier: string; scene: string; layout: string; input: string; expected: string; error: string }
export interface Oracle {
  dir: string; rows: Row[]; byId: Map<string, Row>;
  bytes(rel: string): Uint8Array; text(rel: string): string; json(rel: string): unknown;
  model(scene: string, layout: string): Promise<RenderModel>;
}

export const sha256 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");

export function verifySums(dir: string): string[] {
  const failures: string[] = [];
  const sums = readFileSync(join(dir, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "");
  for (const line of sums) {
    const m = /^([0-9a-f]{64}) \*(.+)$/.exec(line);
    if (!m) { failures.push(`malformed line: ${line}`); continue; }
    let got: string;
    try { got = sha256(readFileSync(join(dir, m[2]!))); } catch { failures.push(`missing: ${m[2]}`); continue; }
    if (got !== m[1]) failures.push(`digest mismatch: ${m[2]}`);
  }
  return failures;
}
export const sumsDigest = (dir: string): string => sha256(readFileSync(join(dir, "SHA256SUMS")));

export function loadOracle(dir: string): Oracle {
  const root = resolve(dir);
  const tsv = readFileSync(join(root, "EXPECT.tsv"), "utf8").split("\n").filter((l) => l !== "");
  const rows: Row[] = tsv.slice(1).map((l) => {
    const c = l.split("\t");
    return { id: c[0] ?? "", group: c[1] ?? "", tier: c[2] ?? "", scene: c[3] ?? "", layout: c[4] ?? "", input: c[5] ?? "", expected: c[6] ?? "", error: c[7] ?? "" };
  });
  const models = new Map<string, Promise<RenderModel>>();
  const o: Oracle = {
    dir: root, rows, byId: new Map(rows.map((r) => [r.id, r])),
    bytes: (rel) => new Uint8Array(readFileSync(join(root, normalize(rel)))),
    text: (rel) => readFileSync(join(root, normalize(rel)), "utf8"),
    json: (rel) => JSON.parse(readFileSync(join(root, normalize(rel)), "utf8")) as unknown,
    model: (scene, layout) => {
      const k = scene + "\u0000" + layout;
      let m = models.get(k);
      if (!m) { m = buildRenderModel(o.bytes(scene), o.bytes(layout)); models.set(k, m); }
      return m;
    },
  };
  return o;
}

// ---- small helpers ------------------------------------------------------------------------------------------------------
class Mismatch extends Error {}
export const fail = (m: string): never => { throw new Mismatch(m); };
export const code = (e: unknown): string => (e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${e instanceof Error ? e.message : String(e)}`);

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}
const canon = (v: unknown): string => JSON.stringify(sortKeys(v === undefined ? null : v));
export function eq(what: string, got: unknown, want: unknown): void {
  const a = canon(got), b = canon(want);
  if (a !== b) fail(`${what}: got ${a.slice(0, 300)} want ${b.slice(0, 300)}`);
}
export function eqBytes(what: string, got: Uint8Array, want: Uint8Array): void {
  if (got.length === want.length && got.every((x, i) => x === want[i])) return;
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  const t = new TextDecoder("utf-8");
  fail(`${what}: first difference at byte ${i} (got ${got.length} bytes, want ${want.length}): got ...${JSON.stringify(t.decode(got.slice(Math.max(0, i - 40), i + 60)))} want ...${JSON.stringify(t.decode(want.slice(Math.max(0, i - 40), i + 60)))}`);
}
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const addr = (x: unknown): ElementAddress | undefined => (x === null || x === undefined ? undefined : (x as ElementAddress));

/** The corpus-reader tokens of 27 13.3a stand for these doubles. */
function token(v: unknown): unknown {
  return v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : v;
}
function tokens(options: unknown): unknown {
  if (typeof options !== "object" || options === null || Array.isArray(options)) return options;
  const out: Record<string, unknown> = { ...(options as Record<string, unknown>) };
  for (const k of Object.keys(out)) out[k] = token(out[k]);
  return out;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const parseInput = (row: Row): Json => (/^[{[]/.test(row.input) ? (JSON.parse(row.input) as Json) : {});

export async function modelAndState(c: Oracle, row: Row, input: Json, stateOverride?: string): Promise<{ model: RenderModel; state: SemanticState }> {
  const model = await c.model(row.scene, row.layout);
  const s = (stateOverride ?? input["state"]) as string | undefined;
  const state = s === "initial" || s === undefined ? initialState(model, (input["size"] as { width: number; height: number } | undefined) ?? { width: 900, height: 600 }) : (c.json(s) as SemanticState);
  return { model, state };
}

// ---- list rows (G, N, X, Y, O, F) -----------------------------------------------------------------------------------------
async function listRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  let model = await c.model(row.scene, row.layout);
  if (input["plain_object_model"] === true) model = { ...model } as RenderModel; // O14: shaped like a model, not a model
  const options = tokens(input["options"]);
  const cases: { state?: string; expected: string }[] = [{ state: input["state"] as string, expected: row.expected }, ...((input["also"] as { state: string; expected: string }[]) ?? [])];
  for (const k of cases) {
    const { state } = await modelAndState(c, row, input, k.state);
    let got = "none", bytes: Uint8Array | undefined;
    try { bytes = impl.serializeDisplayList(impl.buildDisplayList(model, state, options as never), input["limits"] as never); } catch (e) { got = code(e); }
    if (row.error) {
      if (got !== row.error) fail(`${row.id}: got ${got} want ${row.error}`);
      if (bytes !== undefined) fail(`${row.id}: bytes were returned for a refused document`);
      continue;
    }
    if (got !== "none" || bytes === undefined) fail(`${row.id}: unexpected ${got}`);
    eqBytes(`${row.id} ${k.expected}`, bytes!, c.bytes(k.expected));
  }
}

// ---- S rows: the strict reader ----------------------------------------------------------------------------------------------
async function readerRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const inline = /^[{[]/.test(row.input);
  const input = inline ? parseInput(row) : { file: row.input };
  const cases: { file: string; limits?: { maxBytes?: number; maxLineUnits?: number } }[] = [{ file: input["file"] as string, limits: input["limits"] as never }, ...((input["also"] as { file: string }[]) ?? [])];
  for (const k of cases) {
    const bytes = c.bytes(k.file);
    let got = "none", list: ReturnType<Impl["parseDisplayList"]> | undefined;
    try { list = impl.parseDisplayList(bytes, k.limits); } catch (e) { got = code(e); }
    if (row.error) { if (got !== row.error) fail(`${row.id} ${k.file}: got ${got} want ${row.error}`); continue; }
    if (got !== "none") fail(`${row.id} ${k.file}: rejected with ${got}`);
    eqBytes(`${row.id} ${k.file} re-serialization`, impl.serializeDisplayList(list!, k.limits ? { maxBytes: k.limits.maxBytes ?? bytes.length } : undefined), bytes);
  }
}

// ---- P rows: pick buffer and pickDrawn ---------------------------------------------------------------------------------------
async function pickRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  if (row.expected !== "") {
    if (row.id === "P16") {
      const files = [input["file"] as string, ...((input["also"] as { file: string }[]) ?? []).map((a) => a.file)];
      let last: Uint8Array = new Uint8Array();
      for (const f of files) {
        const b = c.bytes(f);
        const out = impl.serializePickBuffer(impl.parsePickBuffer(b));
        eqBytes(`P16 ${f}`, out, b);
        last = out;
      }
      eqBytes("P16 expected", last, c.bytes(row.expected));
      return;
    }
    const { model, state } = await modelAndState(c, row, input);
    const list = impl.buildDisplayList(model, state);
    eqBytes(`${row.id} pick buffer`, impl.serializePickBuffer(impl.buildPickBuffer(list)), c.bytes(row.expected));
    return;
  }
  const { model, state } = await modelAndState(c, row, input);
  const picker = impl.createPicker(model, state);
  let i = 0;
  for (const p of input["points"] as { x: unknown; y: unknown; hit?: ElementAddress; error?: string }[]) {
    i++;
    const pt = { x: token(p.x) as number, y: token(p.y) as number };
    let got: ElementAddress | undefined, err = "none";
    try { got = picker.pick(pt); } catch (e) { err = code(e); }
    if (p.error) { if (err !== p.error) fail(`${row.id} point ${i}: got ${err} want ${p.error}`); continue; }
    if (err !== "none") fail(`${row.id} point ${i}: threw ${err}`);
    eq(`${row.id} point ${i} (${String(p.x)}, ${String(p.y)})`, addr(got), addr(p.hit));
  }
}

async function boundsRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const { model, state } = await modelAndState(c, row, parseInput(row));
  const list = impl.buildDisplayList(model, state);
  eqBytes(`${row.id} bounds`, impl.serializeBounds(impl.elementBounds(list)), c.bytes(row.expected));
}

// ---- C rows: the recorded stream ---------------------------------------------------------------------------------------------
function replayOptions(replay: Json | undefined): Json | undefined {
  return replay === undefined ? undefined : replay;
}
async function callsRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const { model, state } = await modelAndState(c, row, input);
  const options = tokens(input["options"]);
  const replay = replayOptions(input["replay"] as Json | undefined);
  const list = impl.buildDisplayList(model, state, options as never);
  if (row.error) {
    let got = "none";
    try { impl.recordCanvasCalls(list, replay as never); } catch (e) { got = code(e); }
    if (got !== row.error) fail(`recordCanvasCalls: got ${got} want ${row.error}`);
    got = "none";
    try { impl.replayCanvas(list, impl.createRecordingContext().ctx, replay as never); } catch (e) { got = code(e); }
    if (got !== row.error) fail(`replayCanvas: got ${got} want ${row.error}`);
    return;
  }
  const want = c.bytes(row.expected);
  if (row.id === "C13") {
    const rec = impl.createRecordingContext();
    impl.replayCanvas(list, rec.ctx, { onElement: rec.onElement });
    const first = rec.bytes();
    rec.reset();
    impl.replayCanvas(list, rec.ctx, { onElement: rec.onElement });
    eqBytes("C13 second replay after reset", rec.bytes(), want);
    eqBytes("C13 first replay", first, want);
    eqBytes("C13 recordCanvasCalls", impl.recordCanvasCalls(list), want);
    return;
  }
  if (row.id === "C18") {
    const rec = impl.createRecordingContext();
    impl.replayCanvas(list, rec.ctx); // no onElement hook: the same 2D calls
    eqBytes("C18 without onElement", rec.bytes(), want);
    const markerless = new TextDecoder().decode(impl.recordCanvasCalls(list)).split("\n").filter((l) => l !== "" && !l.startsWith('["#"')).join("\n") + "\n";
    eqBytes("C18 stream with the markers removed", enc(markerless), want);
    return;
  }
  eqBytes(`${row.id} recordCanvasCalls`, impl.recordCanvasCalls(list, replay as never), want);
  const rec = impl.createRecordingContext();
  impl.replayCanvas(list, rec.ctx, { ...(replay ?? {}), onElement: rec.onElement } as never);
  eqBytes(`${row.id} replayCanvas into a recording context`, rec.bytes(), want);
}

async function sizeRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  let got = "none", r: { e: number; bw: number; bh: number } | undefined;
  try { r = impl.backingSize(input["width"] as number, input["height"] as number, input["dprMilli"] as number); } catch (e) { got = code(e); }
  if (row.error) { if (got !== row.error) fail(`backingSize: got ${got} want ${row.error}`); return; }
  if (got !== "none") fail(`backingSize threw ${got}`);
  eqBytes("backingSize", enc(JSON.stringify({ bh: r!.bh, bw: r!.bw, e: r!.e }) + "\n"), c.bytes(row.expected));
}

// ---- R rows: readouts --------------------------------------------------------------------------------------------------------
async function readoutRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const from = input["from"] as string;
  const want = row.expected === "" ? undefined : c.bytes(row.expected);
  const run = (f: () => Uint8Array | unknown): { out?: unknown; err: string } => { try { return { out: f(), err: "none" }; } catch (e) { return { err: code(e) }; } };
  let r: { out?: unknown; err: string };
  switch (from) {
    case "list": {
      const { model, state } = await modelAndState(c, row, input);
      r = run(() => impl.serializeReadout(impl.readoutFromList(impl.buildDisplayList(model, state))));
      break;
    }
    case "svg": r = run(() => impl.serializeReadout(impl.readoutFromSvgReadout(scrapeSvg(c.text(input["svg"] as string)) as never))); break;
    case "object": r = run(() => impl.serializeReadout(impl.readoutFromSvgReadout(input["object"] as never))); break;
    case "calls": {
      const { model, state } = await modelAndState(c, row, { size: { width: 900, height: 600 }, state: "initial" });
      const list = impl.buildDisplayList(model, state);
      r = run(() => impl.serializeReadout(impl.readoutFromCanvasStream(c.bytes(input["calls"] as string), list)));
      break;
    }
    case "compare": {
      const entries = (input["entries"] as { renderer: string; readout: string }[]).map((e) => ({ renderer: e.renderer, readout: JSON.parse(c.text(e.readout)) as unknown }));
      r = run(() => enc(JSON.stringify(sortKeys(impl.compareReadouts(entries as never))) + "\n"));
      break;
    }
    default: return fail(`unknown R input ${from}`);
  }
  if (row.error) { if (r.err !== row.error) fail(`${row.id}: got ${r.err} want ${row.error}`); return; }
  if (r.err !== "none") fail(`${row.id}: threw ${r.err}`);
  eqBytes(`${row.id} readout`, r.out as Uint8Array, want!);
}

// ---- dispatch -------------------------------------------------------------------------------------------------------------
export interface RowResult { id: string; ok: boolean; detail?: string }

/** Rows of the function side. U and D rows are not run here (the renderer package and the differential test own them); K rows are the matrix. */
export const FUNCTION_GROUPS = new Set(["G", "N", "X", "Y", "O", "F", "S", "P", "B", "C", "Z", "R"]);

export async function runRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  switch (row.group) {
    case "G": case "N": case "X": case "Y": case "O": case "F": return listRow(impl, c, row);
    case "S": return readerRow(impl, c, row);
    case "P": return pickRow(impl, c, row);
    case "B": return boundsRow(impl, c, row);
    case "C": return callsRow(impl, c, row);
    case "Z": return sizeRow(impl, c, row);
    case "R": return readoutRow(impl, c, row);
    case "U": case "D": case "K": return;
    default: return fail(`unknown group ${row.group}`);
  }
}

/** Runs every function row (or the ids given); never throws: failures are returned. */
export async function runAll(impl: Impl, c: Oracle, ids?: readonly string[]): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const row of c.rows) {
    if (!FUNCTION_GROUPS.has(row.group)) continue;
    if (ids && !ids.includes(row.id)) continue;
    try { await runRow(impl, c, row); out.push({ id: row.id, ok: true }); }
    catch (e) { out.push({ id: row.id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}
