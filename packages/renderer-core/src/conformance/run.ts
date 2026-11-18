// src/conformance/run.ts - the conformance kit runner (design section 13). Pure: takes an in-memory Corpus and a subject.
import { IgsError } from "isongraph-visualize-scene-core";
import { LayoutError } from "isongraph-visualize-layout-core";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { announcementFor, buildAccessibleModel, graphSummary, summaryText } from "../a11y.js";
import { IgrError } from "../errors.js";
import { hitTest } from "../hit.js";
import { verifyManifest } from "../manifest.js";
import { buildRenderModel, isRenderModel, modelBytes } from "../model.js";
import { reduce, serializeEvents } from "../reduce.js";
import { buildReport, checkFidelity, compareProjections, semanticProjection, serializeProjection } from "../report.js";
import { checkState, initialState, parseState, serializeState, stateFromCore } from "../state.js";
import type { CapabilityManifest, ElementAddress, Intent, RenderLimits, RenderModel, Renderer, RendererEnvironment, SemanticEvent, SemanticState } from "../types.js";
import { layoutToScreen } from "../viewport.js";
import { generateModel, generateRandomModel, lcg, MAX_GENERATED_NODES } from "./generate.js";
import { KIT_DIGEST, PINNED_CORPUS_DIGEST, normalizePath, verifyCorpus, type Corpus, type ExpectRow } from "./corpus.js";

export type CheckId = "CHK-CORE" | "CHK-ID" | "CHK-STATE" | "CHK-SEL" | "CHK-FOCUS" | "CHK-LABEL" | "CHK-VIS" | "CHK-VIEW" | "CHK-HIT"
  | "CHK-INTENT" | "CHK-CAP" | "CHK-LIFE" | "CHK-DELTA" | "CHK-DIFF" | "CHK-KIT" | "CHK-W";
const CHECK_ORDER: readonly CheckId[] = ["CHK-CORE", "CHK-ID", "CHK-STATE", "CHK-SEL", "CHK-FOCUS", "CHK-LABEL", "CHK-VIS", "CHK-VIEW", "CHK-HIT", "CHK-INTENT", "CHK-CAP", "CHK-LIFE", "CHK-DELTA", "CHK-DIFF", "CHK-KIT", "CHK-W"];

export interface WitnessReport { backend: string; elements: { nodes: { id: string; type: string }[]; edges: { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } }[] }; texts: { address: ElementAddress; text: string }[] }
export interface ConformanceSubject {
  manifest: CapabilityManifest;
  /** A fresh, UNINITIALIZED renderer per vector (the kit calls `initialize`); `env` is supplied for subjects that need a host to construct. */
  create(env: RendererEnvironment): Promise<Renderer>;
  witness?(r: Renderer): Promise<WitnessReport>;
}
export interface VectorResult { id: string; check: CheckId; verdict: "pass" | "fail" | "not-applicable"; detail?: string }
export interface ConformanceReport {
  igr: "IGR/1"; level: 0 | 1 | 2; corpus_sha256: string; corpus_digest_pinned: boolean;
  seeds: number[]; seeds_supplied: boolean; kit_digest: string; subject: { name: string; version: string };
  results: VectorResult[]; checked: CheckId[]; unchecked: string[];
  partial: boolean; rows_run: number; rows_required: number; claimable: boolean;
  verdict: "pass" | "fail" | "incomplete";
}
export interface ConformanceOptions { only?: string[]; seeds?: number[]; reducedMotion?: boolean }
/** Not public (not exported from the package): lets this package's own tests run a self-made corpus. A run with a list of its own is ALWAYS partial, level 0, unpinned and not claimable (audit N-1). */
export interface InternalRunOptions { requiredIds?: readonly string[] }

type Outcome = { ok: true } | { ok: false; detail: string } | { na: true; detail?: string };
const PASS: Outcome = { ok: true };
const fail = (detail: string): Outcome => ({ ok: false, detail });
const NA: Outcome = { na: true };

// ---------------------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------------------
/** "CODE/REASON" as written in the corpus; propagated errors carry IGS: and LAYOUT: prefixes. */
export function errName(e: unknown): string {
  if (e instanceof IgrError) return `${e.code}/${e.reason ?? ""}`;
  if (e instanceof IgsError) return `IGS:${e.code}/${e.reason ?? ""}`;
  if (e instanceof LayoutError) return `LAYOUT:${e.code}/${e.reason ?? ""}`;
  return `other:${e instanceof Error ? e.name : typeof e}${e instanceof Error ? ": " + e.message : ""}`;
}
const normErr = (s: string): string => (s.includes("/") ? s : `${s}/`);
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const FIDELITY_PLAIN = { labels: "none" as const, edge_labels: false, motion: "none" as const, degradations: [] };

type Json = unknown;
interface Script { size: { width: number; height: number }; limits?: Partial<RenderLimits>; reducedMotion?: boolean; initial?: string; steps: { intent: unknown; expected_state?: string; expected_events?: string; error?: string }[] }

class Run {
  /** Failures of CHK-CAP found anywhere in the run (manifest identity, fidelity of every probe): recorded against L01 (design 13.1). */
  readonly capFailures: string[] = [];
  private models = new Map<string, Promise<RenderModel>>();
  constructor(readonly subject: ConformanceSubject, readonly corpus: Corpus, readonly options: ConformanceOptions, readonly seeds: number[]) {}
  file(rel: string): Uint8Array {
    const f = this.corpus.files.get(normalizePath(rel));
    if (!f) throw new IgrError("INVALID_CORPUS", "MISSING_FILE", rel);
    return f;
  }
  json(rel: string): Json { return JSON.parse(dec(this.file(rel))) as Json; }
  inline(cell: string): Json | undefined { return /^[{[]/.test(cell) ? (JSON.parse(cell) as Json) : undefined; }
  model(scene: string, layout: string, limits?: Partial<RenderLimits>): Promise<RenderModel> {
    const key = `${scene}\u0000${layout}\u0000${JSON.stringify(limits ?? {})}`;
    let m = this.models.get(key);
    if (!m) { m = buildRenderModel(this.file(scene), this.file(layout), { limits: limits ?? {} }); this.models.set(key, m); }
    return m;
  }
  get host(): unknown { return this.subject.manifest.renderer.host === "headless" ? "headless" : undefined; }
  /** A fresh renderer from the subject, which must carry exactly the manifest the subject declares. */
  async create(env: RendererEnvironment): Promise<Renderer> {
    const r = await this.subject.create(env);
    if (manifestKey(r.manifest) !== manifestKey(this.subject.manifest) && !this.capFailures.some((f) => f.startsWith("manifest"))) this.capFailures.push("manifest: the renderer's own manifest differs from subject.manifest");
    return r;
  }
  async start(size: { width: number; height: number }, limits?: Partial<RenderLimits>, reducedMotion = this.options.reducedMotion ?? false): Promise<{ r: Renderer; events: SemanticEvent[]; errors: unknown[] }> {
    const events: SemanticEvent[] = [], errors: unknown[] = [];
    const env: RendererEnvironment = { host: this.host, size, reducedMotion, ...(limits ? { limits } : {}), onEvent: (e) => { events.push(e); }, onError: (e) => { errors.push(e); } };
    const r = await this.create(env);
    await r.initialize(env);
    return { r, events, errors };
  }
}

/** A stable text of a manifest (canonical key order); a throwing or non-serializable manifest never equals a valid one. */
function manifestKey(m: unknown): string {
  try { return canonicalBytesSigned(JSON.parse(JSON.stringify(m)) as CJValue).toString(); } catch { return "unserializable"; }
}
const parseSize = (s: unknown): { width: number; height: number } => s as { width: number; height: number };
/** Corpus-reader convention (13.3a): the strings "NaN", "Infinity", "-Infinity" stand for those doubles wherever a number is expected. Any other string is left alone. */
function revive(v: unknown): unknown {
  if (v === "NaN") return NaN;
  if (v === "Infinity") return Infinity;
  if (v === "-Infinity") return -Infinity;
  if (Array.isArray(v)) return v.map(revive);
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  return v;
}
const num = (v: unknown): number => (v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : (v as number));

// ---------------------------------------------------------------------------------------------------------------------------
// M: model derivation (core)
// ---------------------------------------------------------------------------------------------------------------------------
async function runM(run: Run, row: ExpectRow): Promise<Outcome> {
  const input = run.inline(row.input) as { limits?: Partial<RenderLimits>; plain_object_model?: boolean } | undefined;
  if (input?.plain_object_model) {
    const m = await run.model(row.scene, row.layout);
    const plain = JSON.parse(JSON.stringify(m)) as RenderModel;
    try { initialState(plain, { width: 10, height: 10 }); return fail("a plain object shaped like a model was accepted"); }
    catch (e) { return matchError(row, e); }
  }
  try {
    const m = await buildRenderModel(run.file(row.scene), run.file(row.layout), { limits: input?.limits ?? {} });
    if (row.error) return fail(`expected ${row.error}, got a model`);
    return same(modelBytes(m), run.file(row.expected)) ? PASS : fail("modelBytes differ from the expected file");
  } catch (e) { return row.error ? matchError(row, e) : fail(`unexpected ${errName(e)}`); }
}
function matchError(row: ExpectRow, e: unknown): Outcome {
  const got = errName(e);
  if (!row.error) return fail(`unexpected ${got}`);
  return got === normErr(row.error) ? PASS : fail(`expected ${row.error}, got ${got}`);
}

// ---------------------------------------------------------------------------------------------------------------------------
// S: state parsing (core) and value-level loading (subject)
// ---------------------------------------------------------------------------------------------------------------------------
async function runS(run: Run, row: ExpectRow, tier: "core" | "subject"): Promise<Outcome> {
  const model = await run.model(row.scene, row.layout);
  const inline = run.inline(row.input) as { initial?: { width: number; height: number }; file?: string; limits?: Partial<RenderLimits> } | undefined;
  if (tier === "core") {
    try {
      if (inline?.initial) {
        const got = serializeState(model, initialState(model, inline.initial));
        return same(got, run.file(row.expected)) ? PASS : fail("initial state bytes differ");
      }
      const path = inline?.file ?? row.input;
      const bytes = run.file(path);
      const s = parseState(model, bytes, inline?.limits);
      if (row.error) return fail(`expected ${row.error}, parsed`);
      return same(serializeState(model, s), bytes) ? PASS : fail("an accepted state does not re-serialize to itself");
    } catch (e) { return row.error ? matchError(row, e) : fail(`unexpected ${errName(e)}`); }
  }
  // subject: value level through loadScene(model, initial)
  const size = inline?.initial ?? { width: 900, height: 600 };
  const { r } = await run.start(size, inline?.limits);
  try {
    if (inline?.initial) {
      await r.loadScene(model);
      const got = serializeState(model, r.probe().state);
      return same(got, run.file(row.expected)) ? PASS : fail("the subject's initial state differs");
    }
    const bytes = run.file(inline?.file ?? row.input);
    let value: unknown;
    try { value = JSON.parse(dec(bytes)); } catch { return NA; }
    try {
      await r.loadScene(model, value as SemanticState);
      if (row.error) return fail(`expected ${row.error}, the subject accepted the state`);
      return same(serializeState(model, r.probe().state), bytes) ? PASS : fail("the subject changed an accepted state");
    } catch (e) { return row.error ? matchError(row, e) : fail(`unexpected ${errName(e)}`); }
  } catch (e) { return fail(`${errName(e)}`); }
}

// ---------------------------------------------------------------------------------------------------------------------------
// R and A: scripts
// ---------------------------------------------------------------------------------------------------------------------------
function readScript(run: Run, row: ExpectRow): Script {
  const s = run.json(row.input) as Script;
  return { ...s, steps: s.steps.map((st) => ({ ...st, intent: revive(st.intent) })) };
}
async function startState(run: Run, model: RenderModel, script: Script): Promise<SemanticState> {
  return script.initial ? parseState(model, run.file(script.initial)) : initialState(model, script.size);
}

interface ScriptRun { finalState: SemanticState; lastEvents: SemanticEvent[]; detail?: string }

async function scriptCore(run: Run, model: RenderModel, script: Script): Promise<ScriptRun> {
  let state = await startState(run, model, script);
  let lastEvents: SemanticEvent[] = [];
  for (const [k, step] of script.steps.entries()) {
    const tag = `step ${k + 1}`;
    if (step.error) {
      try { reduce(model, state, step.intent, script.limits); return { finalState: state, lastEvents, detail: `${tag}: expected ${step.error}, the reducer accepted the intent` }; }
      catch (e) { if (errName(e) !== normErr(step.error)) return { finalState: state, lastEvents, detail: `${tag}: expected ${step.error}, got ${errName(e)}` }; }
      lastEvents = [];
      continue;
    }
    let r: ReturnType<typeof reduce>;
    try { r = reduce(model, state, step.intent, script.limits); } catch (e) { return { finalState: state, lastEvents, detail: `${tag}: unexpected ${errName(e)}` }; }
    if (step.expected_state && !same(serializeState(model, r.state), run.file(step.expected_state))) return { finalState: r.state, lastEvents: r.events, detail: `${tag}: state bytes differ` };
    if (step.expected_events && !same(serializeEvents(r.events), run.file(step.expected_events))) return { finalState: r.state, lastEvents: r.events, detail: `${tag}: event bytes differ` };
    state = r.state; lastEvents = r.events;
  }
  return { finalState: state, lastEvents };
}

/** Drives the subject through the script and compares state bytes, events, reported projection after every step. */
async function scriptSubject(run: Run, model: RenderModel, script: Script): Promise<ScriptRun & { renderer?: Renderer; recorded: SemanticEvent[] }> {
  const { r, events } = await run.start(script.size, script.limits, script.reducedMotion ?? run.options.reducedMotion ?? false);
  const initial = script.initial ? parseState(model, run.file(script.initial)) : undefined;
  await r.loadScene(model, initial);
  let expected = await startState(run, model, script);
  let lastEvents: SemanticEvent[] = [];
  const out = (detail: string): ScriptRun & { renderer: Renderer; recorded: SemanticEvent[] } => ({ finalState: expected, lastEvents, detail, renderer: r, recorded: events });
  const verifyReport = (tag: string): string | undefined => {
    const report = r.probe();
    let got: Uint8Array;
    try { got = serializeProjection(model, semanticProjection(report)); }
    catch (e) { return `${tag}: the subject's report is refused: ${errName(e)}`; }
    const want = serializeProjection(model, semanticProjection(buildReport(model, expected, FIDELITY_PLAIN)));
    if (!same(got, want)) return `${tag}: the reported projection differs from the reference projection`;
    const fid = checkFidelity(run.subject.manifest, report, script.reducedMotion ?? run.options.reducedMotion ?? false);
    if (fid && run.capFailures.length < 20) run.capFailures.push(`fidelity (${tag}): ${fid}`); // CHK-CAP, recorded against L01
    try { if (!same(serializeState(model, r.getState()), serializeState(model, expected))) return `${tag}: getState differs from the committed state`; }
    catch (e) { return `${tag}: getState is refused: ${errName(e)}`; }
    return undefined;
  };
  const first = verifyReport("after load");
  if (first) return out(first);
  for (const [k, step] of script.steps.entries()) {
    const tag = `step ${k + 1}`;
    const before = events.length;
    if (step.error) {
      try { r.dispatch(step.intent as Intent); return out(`${tag}: expected ${step.error}, the subject accepted the intent`); }
      catch (e) { if (errName(e) !== normErr(step.error)) return out(`${tag}: expected ${step.error}, got ${errName(e)}`); }
      lastEvents = [];
      const v = verifyReport(`${tag} (state must be unchanged)`); if (v) return out(v);
      continue;
    }
    let ref: ReturnType<typeof reduce>;
    try { ref = reduce(model, expected, step.intent, script.limits); } catch (e) { return out(`${tag}: the corpus step is invalid for the reference reducer: ${errName(e)}`); }
    let got: readonly SemanticEvent[];
    try { got = r.dispatch(step.intent as Intent); } catch (e) { return out(`${tag}: unexpected ${errName(e)}`); }
    if (!same(serializeEvents(got), serializeEvents(ref.events))) return out(`${tag}: event bytes differ`);
    if (step.expected_events && !same(serializeEvents(got), run.file(step.expected_events))) return out(`${tag}: event bytes differ from the expected file`);
    if (!same(serializeEvents(events.slice(before)), serializeEvents(ref.events))) return out(`${tag}: onEvent did not receive each event once, in order`);
    expected = ref.state; lastEvents = [...ref.events];
    if (step.expected_state && !same(serializeState(model, expected), run.file(step.expected_state))) return out(`${tag}: the reference state differs from the expected file (corpus or core defect)`);
    const v = verifyReport(tag); if (v) return out(v);
  }
  return { finalState: expected, lastEvents, renderer: r, recorded: events };
}

async function runR(run: Run, row: ExpectRow, tier: "core" | "subject"): Promise<Outcome> {
  const script = readScript(run, row);
  const model = await run.model(row.scene, row.layout, script.limits);
  const res = tier === "core" ? await scriptCore(run, model, script) : await scriptSubject(run, model, script);
  if (res.detail) return fail(res.detail);
  if (row.expected && !same(serializeState(model, res.finalState), run.file(row.expected))) return fail("the final state differs from the expected file");
  return PASS;
}

async function runA(run: Run, row: ExpectRow, tier: "core" | "subject"): Promise<Outcome> {
  const script = readScript(run, row);
  const model = await run.model(row.scene, row.layout, script.limits);
  const reducedMotion = script.reducedMotion ?? run.options.reducedMotion ?? false;
  let final: SemanticState, last: SemanticEvent[], subjectAccessible: Uint8Array | undefined, fidelity: string | undefined;
  if (tier === "core") {
    const res = await scriptCore(run, model, script);
    if (res.detail) return fail(res.detail);
    final = res.finalState; last = res.lastEvents;
  } else {
    const res = await scriptSubject(run, model, script);
    if (res.detail) return fail(res.detail);
    final = res.finalState; last = res.lastEvents;
    const report = res.renderer!.probe();
    subjectAccessible = canonicalBytesSigned(report.accessible as unknown as CJValue);
    fidelity = checkFidelity(run.subject.manifest, report, reducedMotion);
    if (reducedMotion && report.fidelity.motion !== "none") return fail("motion is not none under reduced motion");
    if (fidelity) return fail(fidelity);
  }
  if (row.expected.endsWith(".events.json")) return same(serializeEvents(last), run.file(row.expected)) ? PASS : fail("event bytes differ");
  const accessible = buildAccessibleModel(model, final);
  const announcements = last.map((e) => announcementFor(e, model, final)).filter((a): a is string => a !== undefined);
  const want = canonicalBytesSigned({ accessible, announcements, summary: graphSummary(model) } as unknown as CJValue);
  if (!same(want, run.file(row.expected))) return fail("the accessible data, announcements or summary differ from the expected file");
  if (subjectAccessible && !same(subjectAccessible, canonicalBytesSigned(accessible as unknown as CJValue))) return fail("the subject's reported accessible data differs");
  if (subjectAccessible && accessible.summary !== summaryText(graphSummary(model))) return fail("summary text");
  return PASS;
}

// ---------------------------------------------------------------------------------------------------------------------------
// H: hit testing
// ---------------------------------------------------------------------------------------------------------------------------
async function runH(run: Run, row: ExpectRow, tier: "core" | "subject"): Promise<Outcome> {
  const spec = run.json(row.input) as { size: { width: number; height: number }; state: string; points: { x: unknown; y: unknown; state?: string; hit?: unknown; error?: string }[] };
  const model = await run.model(row.scene, row.layout);
  const stateOf = (path: string): SemanticState => (path === "initial" ? initialState(model, spec.size) : parseState(model, run.file(path)));
  let renderer: Renderer | undefined;
  if (tier === "subject") { renderer = (await run.start(spec.size)).r; }
  let loaded: string | undefined;
  for (const [k, pt] of spec.points.entries()) {
    const path = pt.state ?? spec.state;
    const state = stateOf(path);
    if (renderer && loaded !== path) { await renderer.loadScene(model, state); loaded = path; }
    const p = { x: num(pt.x), y: num(pt.y) };
    try {
      const got = renderer ? renderer.hitTest(p) : hitTest(model, state, p);
      if (pt.error) return fail(`point ${k}: expected ${pt.error}, got ${got ? JSON.stringify(got) : "no hit"}`);
      const want = pt.hit as ElementAddress | undefined;
      const a = got === undefined ? "none" : JSON.stringify(canonicalValue(got)), b = want === undefined ? "none" : JSON.stringify(canonicalValue(want));
      if (a !== b) return fail(`point ${k} (${pt.x}, ${pt.y}): expected ${b}, got ${a}`);
    } catch (e) {
      if (!pt.error) return fail(`point ${k}: unexpected ${errName(e)}`);
      if (errName(e) !== normErr(pt.error)) return fail(`point ${k}: expected ${pt.error}, got ${errName(e)}`);
    }
  }
  return PASS;
}
const canonicalValue = (v: unknown): unknown => JSON.parse(dec(canonicalBytesSigned(v as CJValue)));

// ---------------------------------------------------------------------------------------------------------------------------
// P: manifests (core);  C: comparison (core)
// ---------------------------------------------------------------------------------------------------------------------------
async function runP(run: Run, row: ExpectRow): Promise<Outcome> {
  try { verifyManifest(run.json(row.input)); return row.error ? fail(`expected ${row.error}, accepted`) : PASS; }
  catch (e) { return row.error ? matchError(row, e) : fail(`unexpected ${errName(e)}`); }
}
async function runC(run: Run, row: ExpectRow): Promise<Outcome> {
  const spec = run.json(row.input) as { model: { scene: string; layout: string }; reports: { renderer: string; report: never; manifest?: unknown }[] };
  const model = await run.model(spec.model.scene, spec.model.layout);
  if (row.id === "C18") { // serializeProjection of the first report's projection
    try { serializeProjection(model, semanticProjection(spec.reports[0]!.report)); return row.error ? fail(`expected ${row.error}, serialized`) : PASS; }
    catch (e) { return row.error ? matchError(row, e) : fail(`unexpected ${errName(e)}`); }
  }
  try {
    const got = canonicalBytesSigned(compareProjections(model, spec.reports) as unknown as CJValue);
    if (row.error) return fail(`expected ${row.error}, got a comparison result`);
    return same(got, run.file(row.expected)) ? PASS : fail(`comparison differs: got ${dec(got)}`);
  } catch (e) { return row.error ? matchError(row, e) : fail(`unexpected ${errName(e)}`); }
}

// ---------------------------------------------------------------------------------------------------------------------------
// L: lifecycle scripts (subject), schema of design 13.3a
// ---------------------------------------------------------------------------------------------------------------------------
interface LCall {
  op: string; arg?: unknown; await?: boolean; expect?: string; expect_state?: string; expect_events?: string; expect_hit?: ElementAddress | null;
  expect_bytes?: string; expect_media_type?: string; expect_motion?: "none" | "full"; applies_if?: string;
}
interface LScript {
  model: { scene: string; layout: string }; env?: Partial<{ size: { width: number; height: number }; reducedMotion: boolean; limits: Partial<RenderLimits> }>;
  listener?: "record" | "throw" | "dispatch-inside"; calls: LCall[];
  expect_recorded_events?: string; expect_listener_errors?: string[]; expect_on_error_count?: number; expect_settle_order?: number[];
}
const FORMATS3 = ["scene", "svg", "png"] as const;

const isRenderModelLike = (m: unknown): m is RenderModel => isRenderModel(m);

async function runL(run: Run, row: ExpectRow): Promise<Outcome> {
  const script = run.json(row.input) as LScript;
  const model = await run.model(script.model.scene, script.model.layout);
  const events: SemanticEvent[] = [], errors: unknown[] = [];
  let r!: Renderer;
  const listener = script.listener ?? "record";
  const env: RendererEnvironment = {
    host: run.host, size: script.env?.size ?? { width: 900, height: 600 }, reducedMotion: script.env?.reducedMotion ?? false, ...(script.env?.limits ? { limits: script.env.limits } : {}),
    onEvent: (e) => { events.push(e); if (listener === "throw") throw new Error("listener failed"); if (listener === "dispatch-inside") r.dispatch({ type: "clear-selection" }); },
    onError: (e) => { errors.push(e); },
  };
  if (row.id === "L01") { try { verifyManifest(run.subject.manifest); } catch (e) { return fail(`the subject's manifest is refused: ${errName(e)}`); } }
  const undeclared = FORMATS3.find((f) => run.subject.manifest.capabilities[`export.${f}` as "export.svg"].status !== "supported");
  if (script.calls.some((c) => c.applies_if === "has-undeclared-export-format") && undeclared === undefined) return NA;
  r = await run.create(env);
  const ASYNC = new Set(["initialize", "loadScene", "render", "export", "dispose", "applySceneDelta"]);
  const settled: number[] = [];
  let current: RenderModel = model; // the model of the most recent successful loadScene: states are serialized against it
  const loadedBy = new Map<number, RenderModel>();
  const pendings: { index: number; p: Promise<unknown>; call: LCall }[] = [];
  const check = (index: number, c: LCall, outcome: { error?: unknown; value?: unknown }): string | undefined => {
    const tag = `call ${index + 1} (${c.op})`;
    const want = c.expect ?? "ok";
    const got = outcome.error === undefined ? "ok" : errName(outcome.error);
    if (got !== (want === "ok" ? "ok" : normErr(want))) return `${tag}: expected ${want}, got ${got}`;
    if (got !== "ok") return undefined;
    if (c.op === "loadScene" && loadedBy.has(index)) current = loadedBy.get(index)!;
    const v = outcome.value;
    try {
      if (c.expect_events && !same(serializeEvents(v as SemanticEvent[]), run.file(c.expect_events))) return `${tag}: dispatched events differ`;
      if (c.expect_state) {
        const st = c.op === "probe" ? (v as { state: SemanticState }).state : r.getState();
        if (!same(serializeState(current, st), run.file(c.expect_state))) return `${tag}: state bytes differ`;
      }
      if (c.expect_hit !== undefined) {
        const a = v === undefined ? "null" : JSON.stringify(canonicalValue(v)), b = c.expect_hit === null ? "null" : JSON.stringify(canonicalValue(c.expect_hit));
        if (a !== b) return `${tag}: hit ${a}, expected ${b}`;
      }
      if (c.expect_bytes && !same((v as { bytes: Uint8Array }).bytes, run.file(c.expect_bytes))) return `${tag}: exported bytes differ`;
      if (c.expect_media_type && (v as { media_type: string }).media_type !== c.expect_media_type) return `${tag}: media type ${(v as { media_type: string }).media_type}`;
      if (c.expect_motion && (v as { fidelity: { motion: string } }).fidelity.motion !== c.expect_motion) return `${tag}: motion ${(v as { fidelity: { motion: string } }).fidelity.motion}`;
    } catch (e) { return `${tag}: ${errName(e)}`; }
    return undefined;
  };
  for (const [index, c] of script.calls.entries()) {
    if (c.applies_if === "has-undeclared-export-format" && undeclared === undefined) continue;
    let invoke: () => unknown;
    const arg = revive(c.arg) as Record<string, unknown> | undefined;
    switch (c.op) {
      case "initialize": invoke = () => r.initialize(arg && typeof arg === "object" ? { ...env, ...(arg as Partial<RendererEnvironment>) } : env); break;
      case "loadScene": {
        let m: unknown = model;
        if (arg && "plain_object_model" in arg) m = JSON.parse(JSON.stringify(model));
        else if (arg && typeof arg["model"] === "object" && arg["model"] !== null) { const mm = arg["model"] as { scene: string; layout: string }; m = await run.model(mm.scene, mm.layout); }
        else if (arg && (typeof arg["over_capacity"] === "string" || typeof arg["at_capacity"] === "string")) {
          const cap = run.subject.manifest.capacity;
          const over = typeof arg["over_capacity"] === "string", which = (over ? arg["over_capacity"] : arg["at_capacity"]) as string;
          const delta = over ? 1 : 0; // L22: one over the capacity; L26: exactly at it
          const nodes = which === "nodes" ? cap.maxNodes + delta : 2, edges = which === "edges" ? cap.maxEdges + delta : 0;
          if (nodes > MAX_GENERATED_NODES || edges > MAX_GENERATED_NODES) return { na: true, detail: `capacity ${which} is above ${MAX_GENERATED_NODES}: no model of that size is generated` };
          m = await generateModel(nodes, edges);
        }
        let initial: unknown = arg?.["initial"];
        if (typeof initial === "string") initial = JSON.parse(dec(run.file(initial)));
        if (isRenderModelLike(m)) loadedBy.set(index, m);
        invoke = () => r.loadScene(m as RenderModel, initial as SemanticState | undefined);
        break;
      }
      case "dispatch": invoke = () => r.dispatch(arg as unknown as Intent); break;
      case "hitTest": invoke = () => r.hitTest(arg as unknown as { x: number; y: number }); break;
      case "getState": invoke = () => r.getState(); break;
      case "probe": invoke = () => r.probe(); break;
      case "render": invoke = () => r.render(); break;
      case "export": invoke = () => r.export((c.arg === "@first-undeclared-export-format" ? undeclared : c.arg) as never); break;
      case "setReducedMotion": invoke = () => r.setReducedMotion(c.arg as boolean); break;
      case "applySceneDelta": invoke = () => r.applySceneDelta(c.arg); break;
      case "dispose": invoke = () => r.dispose(); break;
      default: return fail(`call ${index + 1}: unknown op ${c.op}`);
    }
    if (!ASYNC.has(c.op)) {
      let outcome: { error?: unknown; value?: unknown };
      try { outcome = { value: invoke() }; } catch (e) { outcome = { error: e }; }
      const bad = check(index, c, outcome);
      if (bad) return fail(bad);
      continue;
    }
    let p: Promise<unknown>;
    try { p = Promise.resolve(invoke()); } catch (e) { p = Promise.reject(e); }
    const inOrder = c.op !== "applySceneDelta"; // expect_settle_order lists initialize, loadScene, render, export, dispose only
    const tracked = p.then((value) => { if (inOrder) settled.push(index); return { value }; }, (error: unknown) => { if (inOrder) settled.push(index); return { error: error ?? new Error("rejected") }; });
    if (c.await === false) { pendings.push({ index, p: tracked, call: c }); continue; }
    const bad = check(index, c, (await tracked) as { error?: unknown; value?: unknown });
    if (bad) return fail(bad);
  }
  for (const pnd of pendings) { const bad = check(pnd.index, pnd.call, (await pnd.p) as { error?: unknown; value?: unknown }); if (bad) return fail(bad); }
  if (script.expect_recorded_events && listener === "record" && !same(serializeEvents(events), run.file(script.expect_recorded_events))) return fail("the events the listener saw differ from the expected file (once each, in order)");
  if (script.expect_listener_errors && JSON.stringify(errors.map(errName)) !== JSON.stringify(script.expect_listener_errors.map(normErr))) return fail(`listener errors ${JSON.stringify(errors.map(errName))}, expected ${JSON.stringify(script.expect_listener_errors)}`);
  if (script.expect_on_error_count !== undefined && errors.length !== script.expect_on_error_count) return fail(`onError was called ${errors.length} times, expected ${script.expect_on_error_count}`);
  if (script.expect_settle_order && JSON.stringify(settled) !== JSON.stringify(script.expect_settle_order)) return fail(`calls settled in order ${JSON.stringify(settled)}, expected ${JSON.stringify(script.expect_settle_order)}`);
  return PASS;
}

// ---------------------------------------------------------------------------------------------------------------------------
// D: differential tier on UNSEEN random inputs (no frozen bytes)
// ---------------------------------------------------------------------------------------------------------------------------
function randomIntent(rng: ReturnType<typeof lcg>, m: RenderModel, hostile: boolean): unknown {
  const el = (): ElementAddress => (m.edges.length > 0 && rng.int(3) === 0 ? { edge: m.edges[rng.int(m.edges.length)]!.ref } : { node: m.nodes[rng.int(Math.max(1, m.nodes.length))]?.ref ?? { id: "i:1", type: "x" } });
  const els = () => Array.from({ length: rng.int(4) }, el);
  const k = rng.int(hostile ? 16 : 13);
  switch (k) {
    case 0: return { type: "select", mode: rng.pick(["replace", "add", "remove", "toggle"]), targets: els() };
    case 1: return { type: "clear-selection" };
    case 2: return rng.int(2) ? { type: "focus", target: el() } : { type: "focus" };
    case 3: return { type: "focus-step", delta: rng.int(2) ? 1 : -1 };
    case 4: return { type: rng.pick(["focus-first", "focus-last"]) };
    case 5: return { type: "set-hidden", targets: els(), hidden: rng.int(3) > 0 };
    case 6: return { type: "pan", dx: rng.int(2001) - 1000, dy: rng.int(2001) - 1000 };
    case 7: return { type: "zoom", factor_milli: 1 + rng.int(4000), ...(rng.int(2) ? { anchor: { x: rng.int(1200) - 100, y: rng.int(900) - 100 } } : {}) };
    case 8: return rng.int(2) ? { type: "fit" } : { type: "fit", padding: rng.int(60) };
    case 9: return { type: "set-viewport", center_x: rng.int(2_000_001) - 1_000_000, center_y: rng.int(2_000_001) - 1_000_000, zoom: 10 + rng.int(100_000) };
    case 10: return { type: "resize", width: 1 + rng.int(1500), height: 1 + rng.int(1200) };
    case 11: return { type: "select", mode: "add", targets: els() };
    case 12: return { type: "pan", dx: rng.int(2001) - 1000, dy: 0 };
    case 13: return { type: rng.pick(["focus-endpoint", "lasso"]) };
    case 14: return { type: "pan", dx: rng.pick([1.5, NaN, "x", 2 ** 31 + 1]), dy: 0 };
    default: return { type: "zoom", factor_milli: rng.pick([0, 1_000_001, -5]) };
  }
}

async function baseModel(run: Run): Promise<RenderModel | undefined> {
  const seen = new Set<string>();
  let best: RenderModel | undefined;
  for (const row of run.corpus.expect) {
    if (!row.scene || !row.layout || seen.has(row.scene + row.layout)) continue;
    seen.add(row.scene + row.layout);
    try {
      const m = await run.model(row.scene, row.layout);
      if (m.nodes.length >= 5 && m.edges.length >= 5) return m;
      if (!best || m.edges.length > best.edges.length) best = m;
    } catch { /* an error row: not a base model */ }
  }
  return best;
}

async function runD(run: Run, id: string): Promise<Outcome> {
  const m0 = await baseModel(run);
  const size = { width: 900, height: 600 };
  for (const seed of run.seeds) for (const m of [...(m0 ? [m0] : []), await generateRandomModel(seed)]) { // the first corpus model, and a model the kit generates per seed (13.3b)
    const rng = lcg(seed);
    const where = (msg: string) => fail(`seed ${seed}: ${msg}`);
    if (id === "D05") {
      const { r } = await run.start(size);
      await r.loadScene(m);
      let ref = initialState(m, size);
      for (let i = 0; i < 12; i++) { try { ref = reduce(m, ref, randomIntent(rng, m, false)).state; } catch { /* skip */ } }
      const base = serializeState(m, ref);
      for (let i = 0; i < 80; i++) {
        let b = Uint8Array.from(base);
        for (let k = 0, n = 1 + rng.int(3); k < n; k++) {
          const pos = rng.int(Math.max(1, b.length)), op = rng.int(4), ch = rng.pick([0x22, 0x7b, 0x7d, 0x2c, 0x3a, 0x30, 0x2d, 0x31, 0x39, 0x65, 0x6e, 0x61]);
          b = op === 0 ? Uint8Array.from(b, (x, j) => (j === pos ? ch : x)) : op === 1 ? Uint8Array.from([...b.slice(0, pos), ...b.slice(pos + 1)]) : op === 2 ? Uint8Array.from([...b.slice(0, pos), ch, ...b.slice(pos)]) : b.slice(0, pos);
        }
        let value: unknown;
        try { value = JSON.parse(dec(b)); } catch { continue; }
        let want: string;
        let wantState: Uint8Array | undefined;
        try { const core = checkState(m, value, "strict"); want = "ok"; wantState = canonicalBytesSigned(stateFromCore(m, core) as unknown as CJValue); } catch (e) { want = errName(e); }
        let got = "ok";
        try { await r.loadScene(m, value as SemanticState); } catch (e) { got = errName(e); }
        if (got !== want) return where(`mutant ${i}: the subject answered ${got}, the reference ${want}`);
        if (want === "ok" && !same(serializeState(m, r.getState()), wantState!)) return where(`mutant ${i}: accepted state differs`);
      }
      continue;
    }
    const scripts = 4;
    for (let sIdx = 0; sIdx < scripts; sIdx++) {
      const { r } = await run.start(size);
      await r.loadScene(m);
      let ref = initialState(m, size);
      const len = 50; // 4 x 50 = 200 random intents per model
      for (let i = 0; i < len; i++) {
        const hostile = id === "D01";
        let intent = randomIntent(rng, m, hostile);
        if (id === "D03") intent = { type: rng.pick(["pan", "zoom", "fit", "set-viewport", "resize"]), ...viewportFields(rng) } as unknown;
        if (id === "D03") intent = normalizeViewportIntent(intent as Record<string, unknown>);
        let want: { state: SemanticState; events: SemanticEvent[] } | string;
        try { want = reduce(m, ref, intent); } catch (e) { want = errName(e); }
        let got: readonly SemanticEvent[] | string;
        try { got = r.dispatch(intent as Intent); } catch (e) { got = errName(e); }
        if (typeof want === "string" || typeof got === "string") { if (want !== got) return where(`${id} script ${sIdx} step ${i} ${JSON.stringify(intent)}: subject ${typeof got === "string" ? got : "accepted"}, reference ${typeof want === "string" ? want : "accepted"}`); continue; }
        if (!same(serializeEvents(got), serializeEvents(want.events))) return where(`${id} script ${sIdx} step ${i}: events differ`);
        ref = want.state;
        if (!same(serializeState(m, r.getState()), serializeState(m, ref))) return where(`${id} script ${sIdx} step ${i}: state differs`);
        if (id === "D04") { // probe consistency after each step
          let got: Uint8Array;
          try { got = serializeProjection(m, semanticProjection(r.probe())); } catch (e) { return where(`D04 script ${sIdx} step ${i}: probe refused: ${errName(e)}`); }
          if (!same(got, serializeProjection(m, semanticProjection(buildReport(m, ref, FIDELITY_PLAIN))))) return where(`D04 script ${sIdx} step ${i}: probe differs from the reference report`);
        }
      }
      if (id === "D02") {
        for (let i = 0; i < 150; i++) {
          let p: { x: number; y: number };
          if (rng.int(2) === 0 && m.nodes.length > 0) {
            const n = m.nodes[rng.int(m.nodes.length)]!;
            const s = layoutToScreen(ref.viewport, { x: n.x, y: n.y });
            const d = (rng.float() - 0.5) * 30;
            p = { x: s.x + d, y: s.y + (rng.float() - 0.5) * 30 };
          } else p = { x: rng.float() * (ref.viewport.width + 10) - 5, y: rng.float() * (ref.viewport.height + 10) - 5 };
          if (rng.int(10) === 0) p = { x: Math.round(p.x * 8) / 8 + 2 ** -11, y: Math.round(p.y * 8) / 8 };
          if (rng.int(6) === 0 && m.nodes.length > 0) { const n = m.nodes[rng.int(m.nodes.length)]!; const s = layoutToScreen(ref.viewport, { x: n.x, y: n.y }); p = { x: Math.round(s.x * 1024) / 1024 + 12 + (rng.int(5) - 2) * 2 ** -10, y: Math.round(s.y * 1024) / 1024 }; } // multiples of 2^-10 around the node boundary
          let want: string, got: string;
          try { const a = hitTest(m, ref, p); want = a ? JSON.stringify(canonicalValue(a)) : "none"; } catch (e) { want = errName(e); }
          try { const a = r.hitTest(p); got = a ? JSON.stringify(canonicalValue(a)) : "none"; } catch (e) { got = errName(e); }
          if (want !== got) return where(`D02 point (${p.x}, ${p.y}): subject ${got}, reference ${want}`);
        }
      }
    }
  }
  return PASS;
}
const viewportFields = (rng: ReturnType<typeof lcg>): Record<string, number> => ({ a: rng.int(2001) - 1000, b: rng.int(2001) - 1000, c: 1 + rng.int(5000), d: 10 + rng.int(100_000), e: 1 + rng.int(2000) });
function normalizeViewportIntent(i: Record<string, unknown>): unknown {
  const a = i["a"] as number, b = i["b"] as number, c = i["c"] as number, d = i["d"] as number, e = i["e"] as number;
  switch (i["type"]) {
    case "pan": return { type: "pan", dx: a, dy: b };
    case "zoom": return { type: "zoom", factor_milli: c, anchor: { x: a, y: b } };
    case "fit": return { type: "fit", padding: Math.abs(a) % 50 };
    case "set-viewport": return { type: "set-viewport", center_x: a * 1000, center_y: b * 1000, zoom: d };
    default: return { type: "resize", width: e, height: Math.abs(b) + 1 };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// attribution of vector ids to checks (design 13.1): a vector counts for a check ONLY if that check's row lists it
// ---------------------------------------------------------------------------------------------------------------------------
const between = (n: number, ...ranges: [number, number][]): boolean => ranges.some(([a, b]) => n >= a && n <= b);
/** The SUBJECT-tier checks a vector counts toward. Core-tier results are attributed to CHK-CORE (and `P` also to CHK-CAP). */
export function checksFor(id: string): CheckId[] {
  const g = id[0]!, n = parseInt(id.slice(1), 10);
  const out: CheckId[] = [];
  switch (g) {
    case "S": // every S row of tier both counts under CHK-STATE, rejected rows included (rev 5); the byte-level rows and S50 are core only
      if (![12, 13, 14, 28, 37, 38, 41, 50].includes(n)) out.push("CHK-STATE");
      if (n === 47) out.push("CHK-VIEW");
      break;
    case "R":
      out.push("CHK-STATE", "CHK-ID");
      if (between(n, [1, 9], [35, 35], [39, 41], [51, 51])) out.push("CHK-SEL");
      if (between(n, [13, 19], [49, 49])) out.push("CHK-FOCUS");
      if (between(n, [10, 12])) out.push("CHK-VIS");
      if (between(n, [20, 26], [29, 29], [31, 33], [36, 36], [38, 38])) out.push("CHK-VIEW");
      if (between(n, [7, 8], [27, 28], [30, 30], [32, 34], [37, 37], [39, 40], [42, 48], [50, 52])) out.push("CHK-INTENT");
      break;
    case "H": out.push("CHK-HIT"); if (between(n, [13, 15])) out.push("CHK-VIS"); break;
    case "A": out.push("CHK-LABEL"); if (n === 16) out.push("CHK-CAP"); break;
    case "P": out.push("CHK-CAP"); break;
    case "L": out.push("CHK-LIFE"); if (id === "L01") out.push("CHK-CAP"); if (between(n, [11, 13])) out.push("CHK-DELTA"); break;
    case "D": out.push("CHK-DIFF"); break;
  }
  return out;
}
/** Level 0 vectors: manifest and lifecycle. Everything else that is not a witness is level 1. */
const isLevel0 = (id: string): boolean => id[0] === "P" || id[0] === "L";

/** The ids the kit requires (design 13.3, 354 ids): a corpus may add ids but may not lack one. */
export const REQUIRED_IDS: readonly string[] = (() => {
  const range = (g: string, n: number, pad = 2): string[] => Array.from({ length: n }, (_, i) => g + String(i + 1).padStart(pad, "0"));
  return [...range("M", 30), "M23b", "M24b", ...range("S", 55), ...range("R", 52), "R31b", ...range("H", 27), ...range("A", 21), ...range("P", 27),
    ...range("L", 27), "L21b", "L24b", "L24c", "L24d", ...range("D", 5), ...range("K", 82), ...range("C", 21)];
})();

/** Tier per group when the EXPECT row leaves it empty (design 13.3a): M, P, C core; L, D subject; S, R, H, A both. */
function defaultTier(g: string): string { return g === "M" || g === "P" || g === "C" ? "core" : g === "L" || g === "D" ? "subject" : "both"; }

// ---------------------------------------------------------------------------------------------------------------------------
// runConformance
// ---------------------------------------------------------------------------------------------------------------------------
/** The required id list and the pinned digest come ONLY from the compiled-in constants REQUIRED_IDS and PINNED_CORPUS_DIGEST: no option can set them. */
export function runConformance(subject: ConformanceSubject, corpus: Corpus, options: ConformanceOptions = {}): Promise<ConformanceReport> {
  const { only, seeds, reducedMotion } = options; // anything else a caller passes is ignored
  return runConformanceInternal(subject, corpus, { ...(only ? { only } : {}), ...(seeds ? { seeds } : {}), ...(reducedMotion !== undefined ? { reducedMotion } : {}) }, {});
}

export async function runConformanceInternal(subject: ConformanceSubject, corpus: Corpus, options: ConformanceOptions, internal: InternalRunOptions): Promise<ConformanceReport> {
  const verified = await verifyCorpus(corpus, PINNED_CORPUS_DIGEST); // INVALID_CORPUS before anything runs (K37, K38)
  const required = internal.requiredIds ?? REQUIRED_IDS;
  const selfMade = internal.requiredIds !== undefined;
  const present = new Set(corpus.expect.map((r) => r.id));
  const missing = required.filter((id) => !present.has(id));
  if (missing.length > 0) throw new IgrError("INVALID_CORPUS", "SCHEMA", "EXPECT.tsv", `required ids missing: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ` and ${missing.length - 8} more` : ""}`);
  const seedsSupplied = options.seeds !== undefined;
  const seeds = options.seeds ? [...options.seeds] : Array.from(globalThis.crypto.getRandomValues(new Uint32Array(3)));
  const run = new Run(subject, corpus, options, seeds);
  const results: VectorResult[] = [{ id: "corpus", check: "CHK-KIT", verdict: "pass" }];
  const only = options.only ? new Set(options.only) : undefined;
  const push = (id: string, checks: CheckId[], o: Outcome): void => {
    for (const check of checks) results.push("na" in o ? { id, check, verdict: "not-applicable", ...(o.detail ? { detail: o.detail } : {}) } : o.ok ? { id, check, verdict: "pass" } : { id, check, verdict: "fail", detail: o.detail });
  };
  const guard = async (f: () => Promise<Outcome>): Promise<Outcome> => { try { return await f(); } catch (e) { return fail(`the vector could not run: ${errName(e)}`); } };
  const base = await baseModel(run).catch(() => undefined);
  try { verifyManifest(subject.manifest); } catch (e) { run.capFailures.push(`the subject's manifest is refused: ${errName(e)}`); }

  for (const row of corpus.expect) {
    const g = row.id[0] ?? "";
    if (g === "K" || g === "D" || (only && !only.has(row.id))) continue; // K: kit code; D: the runtime tier runs below (rows exist with empty cells)
    const tier = row.tier || defaultTier(g);
    const subjectTier = tier === "subject" || tier === "both";
    const coreTier = tier === "core" || tier === "both";
    const coreCheck: CheckId[] = g === "P" ? ["CHK-CORE", "CHK-CAP"] : ["CHK-CORE"];
    if (coreTier) {
      const o = await guard(() => g === "M" ? runM(run, row) : g === "S" ? runS(run, row, "core") : g === "R" ? runR(run, row, "core") : g === "H" ? runH(run, row, "core") : g === "A" ? runA(run, row, "core") : g === "P" ? runP(run, row) : g === "C" ? runC(run, row) : Promise.resolve(fail(`unknown group ${g}`)));
      push(row.id, coreCheck, o);
    }
    if (subjectTier && g !== "M" && g !== "P" && g !== "C") {
      const checks = checksFor(row.id);
      if (checks.length === 0) continue; // a subject-tier vector no check lists counts for nothing (13.1: attribution is exact)
      let o: Outcome;
      if (row.id === "L14" && ["svg", "png"].every((f) => subject.manifest.capabilities[`export.${f}` as "export.svg"].status === "supported")) o = NA;
      else if (row.id === "L16" && subject.manifest.capabilities["export.scene"].status !== "supported") o = NA;
      else o = await guard(() => g === "S" ? runS(run, row, "subject") : g === "R" ? runR(run, row, "subject") : g === "H" ? runH(run, row, "subject") : g === "A" ? runA(run, row, "subject") : g === "L" ? runL(run, row) : Promise.resolve(fail(`unknown group ${g}`)));
      push(row.id, checks, o);
    }
  }
  for (const id of ["D01", "D02", "D03", "D04", "D05"]) if (!only || only.has(id)) push(id, checksFor(id), await guard(() => runD(run, id)));
  // CHK-CAP of the subject tier (13.1): manifest identity and the fidelity of every probe, recorded against L01 in every run
  if (!only || only.has("L01")) {
    const r01 = results.find((r) => r.id === "L01" && r.check === "CHK-CAP");
    if (r01 && run.capFailures.length > 0) { r01.verdict = "fail"; r01.detail = [r01.detail, ...run.capFailures.slice(0, 3)].filter(Boolean).join("; "); }
  }

  // level 2: the optional backend witness
  const level0Ok = results.filter((r) => isLevel0(r.id)).every((r) => r.verdict !== "fail");
  const level1Ok = level0Ok && results.filter((r) => !isLevel0(r.id)).every((r) => r.verdict !== "fail");
  // run scope (audit C-2, design 13.2): rows_required, rows_run, partial, claimable
  const ranIds = new Set(results.filter((r) => r.id !== "corpus").map((r) => r.id));
  for (const id of REQUIRED_IDS) if (id[0] === "K" && !only && present.has(id)) ranIds.add(id); // K rows are kit code, satisfied by the row being present
  const rowsRun = REQUIRED_IDS.filter((id) => ranIds.has(id)).length;
  const partial = selfMade || options.only !== undefined || rowsRun < REQUIRED_IDS.length || !REQUIRED_IDS.every((id) => ranIds.has(id)); // always against the fixed 341 ids
  let witnessOk = false;
  if (subject.witness && level1Ok && !options.only && base && (!only || only.has("W01"))) {
    const o = await guard(async () => {
      const { r } = await run.start({ width: 900, height: 600 });
      await r.loadScene(base);
      const w = await subject.witness!(r);
      const rep = r.probe();
      if (JSON.stringify(canonicalValue(w.elements)) !== JSON.stringify(canonicalValue(rep.drawn))) return fail("the backend does not contain exactly the reported elements");
      const want = new Map(rep.accessible.items.map((i) => [JSON.stringify(canonicalValue(i.address)), i.name]));
      for (const t of w.texts) { const n = want.get(JSON.stringify(canonicalValue(t.address))); if (n === undefined || n.replace(/\s+/g, " ").trim() !== t.text.replace(/\s+/g, " ").trim()) return fail("a witnessed text differs from the accessible name"); }
      return PASS;
    });
    push("W01", ["CHK-W"], o);
    witnessOk = "ok" in o && o.ok;
  }
  const failedNow = results.some((r) => r.verdict === "fail");
  const level: 0 | 1 | 2 = level1Ok && !partial ? (witnessOk ? 2 : 1) : 0;
  const checked = CHECK_ORDER.filter((c) => results.some((r) => r.check === c && r.verdict !== "not-applicable"));
  const unchecked: string[] = [];
  if (partial) unchecked.push(`partial run (${rowsRun} of ${required.length} required rows ran${options.only ? "; only was given" : ""}): no level above 0 can be claimed`);
  unchecked.push("host", "indicators.non-color", "direction-cue drawn", "labels drawn", "gesture-to-intent mapping",
    "optional capability declarations (export.*, a11y.*, labels.edge, motion.animated)", "special-casing of the public corpus scenes beyond tier D");
  if (results.some((r) => (r.id === "L22" || r.id === "L26") && r.verdict === "not-applicable")) unchecked.push("capacity refusal");
  if (level < 2) unchecked.push("backend drawing");
  for (const c of CHECK_ORDER) if (c !== "CHK-W" && !checked.includes(c)) unchecked.push(c); // also for a partial run: every check that did not run is named (N-5)
  const pinned = verified.pinned; // true only when the compiled-in PINNED_CORPUS_DIGEST is set and equal
  return {
    igr: "IGR/1", level, corpus_sha256: verified.corpus_sha256, corpus_digest_pinned: pinned, seeds, seeds_supplied: seedsSupplied, kit_digest: KIT_DIGEST,
    subject: { name: subject.manifest.renderer.name, version: subject.manifest.renderer.version }, results, checked, unchecked,
    partial, rows_run: rowsRun, rows_required: REQUIRED_IDS.length, claimable: pinned && !partial && KIT_DIGEST !== "UNRELEASED",
    verdict: failedNow ? "fail" : partial ? "incomplete" : "pass",
  };
}

export { KIT_DIGEST, PINNED_CORPUS_DIGEST };
