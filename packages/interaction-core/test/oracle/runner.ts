// The row runner of fixtures/oracles-ia for the families of interaction-core (design 15.3, 15.5): E (event, config, command, machine and rectangle
// validation), I (gesture transcripts), V (keyboard navigation and the reveal rule), L (the corner-node marquee) and B (key tokens and bindings).
// Rows of the other families (C, P, Q, G, X, M, H: a11y-companion and export-core) are not run here. The runner is parameterized by the implementation
// (`Impl`), so the same logic runs against src/ (the conformance test) and against the scratch copies of the mutation harness (scripts/mutate.mjs).
// It imports nothing from vitest and nothing from src/.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRenderModel, initialState, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";

/** The functions of interaction-core "." that the rows exercise. */
export interface Impl {
  createMachine(): unknown;
  step(machine: unknown, event: unknown, model: RenderModel, state: SemanticState, config?: unknown): { machine: unknown; handled: boolean; outputs: unknown[]; wake_at?: number };
  validateEvent(event: unknown): unknown;
  serializeMachine(m: unknown): Uint8Array;
  parseMachine(bytes: Uint8Array): unknown;
  serializeStep(r: { handled: boolean; outputs: readonly unknown[]; wake_at?: number }): Uint8Array;
  verifyBindings(table: unknown): unknown;
  serializeBindings(table: never): Uint8Array;
  DEFAULT_BINDINGS: unknown;
  keyToken(key: string): string | undefined;
  resolveNavigation(model: RenderModel, state: SemanticState, command: unknown, options?: unknown): unknown;
  lassoTargets(model: RenderModel, state: SemanticState, rect: unknown): unknown;
}

export interface Row { id: string; group: string; tier: string; scene: string; layout: string; input: string; expected: string; error: string }
export interface Corpus { dir: string; rows: Row[]; byId: Map<string, Row>; read(rel: string): Uint8Array; text(rel: string): string }
export interface RowResult { id: string; ok: boolean; detail?: string }

/** The groups of this package. D01-D03 (tier diff) are runtime rows run by the property tests, not here. */
export const GROUPS = new Set(["E", "I", "V", "L", "B"]);
export const DIFF_ROWS = ["D01", "D02", "D03"] as const;

export function loadCorpus(dir: string): Corpus {
  const read = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(dir, rel)));
  const text = (rel: string): string => readFileSync(join(dir, rel), "utf8");
  const lines = text("EXPECT.tsv").split("\n");
  const head = lines[0]!.split("\t");
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    if (line === "") continue;
    const c = line.split("\t");
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = c[i] ?? ""; });
    rows.push(o as unknown as Row);
  }
  return { dir, rows, byId: new Map(rows.map((r) => [r.id, r])), read, text };
}

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const textOf = (b: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(b);
const models = new Map<string, Promise<RenderModel>>();
export function modelOf(c: Corpus, scene: string, layout: string): Promise<RenderModel> {
  const k = c.dir + "\u0000" + scene + "\u0000" + layout;
  let m = models.get(k);
  if (!m) { m = buildRenderModel(c.read(scene), c.read(layout)); models.set(k, m); }
  return m;
}

export function errKey(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e) return `${String((e as { code: unknown }).code)}/${String((e as { reason?: unknown }).reason ?? "")}`;
  return `other:${e instanceof Error ? e.message : String(e)}`;
}

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); }
  return v;
}

/** The corpus-reader tokens of 27 13.3a at the number fields of an event or rectangle (15.3, A-03): nowhere else. */
const NUMBER_FIELDS = new Set(["t", "id", "x", "y", "dy", "mods", "button", "unit", "x0", "y0", "x1", "y1"]);
function decodeTokens(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    out[k] = NUMBER_FIELDS.has(k) && v === "NaN" ? NaN : NUMBER_FIELDS.has(k) && v === "Infinity" ? Infinity : NUMBER_FIELDS.has(k) && v === "-Infinity" ? -Infinity : v;
  }
  return out;
}

function same(a: Uint8Array, b: Uint8Array, what: string): void {
  if (a.length === b.length && a.every((x, i) => x === b[i])) return;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ctx = (x: Uint8Array): string => new TextDecoder().decode(x.slice(Math.max(0, i - 40), i + 80));
  throw new Error(`${what}: bytes differ at offset ${i} (actual ${a.length} bytes, expected ${b.length}): actual ...${ctx(a)} expected ...${ctx(b)}`);
}

/** Runs `f`; with an expected error key the error must be thrown and equal, else it must not throw. Returns the value of a successful call. */
async function expectOutcome<T>(row: Row, f: () => T | Promise<T>): Promise<T | undefined> {
  let value: T | undefined;
  let thrown: unknown;
  let did = false;
  try { value = await f(); } catch (e) { thrown = e; did = true; }
  if (row.error === "") {
    if (did) throw new Error(`${row.id}: unexpected error ${errKey(thrown)}${thrown instanceof Error ? ` (${thrown.message.slice(0, 200)})` : ""}`);
    return value;
  }
  if (!did) throw new Error(`${row.id}: expected ${row.error}, got no error`);
  if (errKey(thrown) !== row.error) throw new Error(`${row.id}: expected ${row.error}, got ${errKey(thrown)}`);
  return undefined;
}

const G9_SCENE = "scenes/G9.scene.json", G9_LAYOUT = "layouts/G9.layout.json";

async function runE(impl: Impl, c: Corpus, row: Row): Promise<void> {
  const inp = JSON.parse(row.input) as Record<string, unknown>;
  const scene = row.scene || G9_SCENE, layout = row.layout || G9_LAYOUT;
  const model = await modelOf(c, scene, layout);
  const state = initialState(model, { width: 900, height: 600 });
  if ("event" in inp) {
    const raw = inp["event"];
    const ev = deepFreeze(Array.isArray(raw) || typeof raw !== "object" || raw === null ? raw : decodeTokens(raw as Record<string, unknown>));
    const lastT = typeof inp["last_t"] === "number" ? inp["last_t"] : -1;
    const m = { ...(impl.createMachine() as Record<string, unknown>), last_t: lastT };
    await expectOutcome(row, () => impl.step(m, ev, model, state));
    // validateEvent is the same grammar without the machine: every row except the time row gives the same verdict
    if (row.id !== "E21") await expectOutcome(row, () => impl.validateEvent(ev));
  } else if ("config" in inp) {
    await expectOutcome(row, () => impl.step(impl.createMachine(), { t: 0, type: "tick" }, model, state, deepFreeze(inp["config"])));
  } else if ("command" in inp) {
    await expectOutcome(row, () => impl.resolveNavigation(model, state, deepFreeze(inp["command"])));
  } else if ("machine" in inp) {
    const bytes = c.read(inp["machine"] as string);
    const m = await expectOutcome(row, () => impl.parseMachine(bytes));
    if (row.error === "" && m !== undefined) same(impl.serializeMachine(m), bytes, `${row.id} round trip`);
  } else if ("rect" in inp) {
    await expectOutcome(row, () => impl.lassoTargets(model, state, deepFreeze(decodeTokens(inp["rect"] as Record<string, unknown>))));
  } else throw new Error(`${row.id}: unknown E input`);
}

interface Script { size: { width: number; height: number }; state: string; config?: unknown; steps: { event: unknown; state?: string }[] }

/** The transcript bytes of a script: IGR-CJ/1 of {final_state, steps} (15.3). */
export async function runScript(impl: Impl, c: Corpus, row: Row): Promise<Uint8Array> {
  const script = JSON.parse(c.text(row.input)) as Script;
  const model = await modelOf(c, row.scene, row.layout);
  const base: SemanticState = script.state === "initial" ? initialState(model, script.size) : (JSON.parse(c.text(script.state)) as SemanticState);
  let machine = impl.createMachine();
  const steps: unknown[] = [];
  for (const s of script.steps) {
    const st = s.state ? (JSON.parse(c.text(s.state)) as SemanticState) : base;
    const r = impl.step(machine, deepFreeze(s.event), model, deepFreeze(st), script.config === undefined ? undefined : deepFreeze(script.config));
    steps.push(JSON.parse(textOf(impl.serializeStep(r))));
    machine = r.machine;
  }
  return canonicalBytesSigned({ final_state: JSON.parse(textOf(impl.serializeMachine(machine))), steps } as never);
}

async function runTranscript(impl: Impl, c: Corpus, row: Row): Promise<void> {
  same(await runScript(impl, c, row), c.read(row.expected), `${row.id} transcript`);
}

function runB(impl: Impl, c: Corpus, row: Row): void {
  if (row.id === "B01") {
    const keys = JSON.parse(c.text(row.input)) as string[];
    const out = keys.map((k) => { const t = impl.keyToken(k); return t === undefined ? [k] : [k, t]; });
    same(canonicalBytesSigned(out as never), c.read(row.expected), "B01 tokens");
    return;
  }
  if (row.id === "B12") { same(impl.serializeBindings(impl.DEFAULT_BINDINGS as never), c.read(row.expected), "B12 default table"); return; }
  const table = JSON.parse(c.text(row.input)) as unknown;
  const verified = impl.verifyBindings(deepFreeze(table));
  void verified;
}

/** Runs one row; throws on a failure. Rows outside the groups of this package are not accepted. */
export async function runRow(impl: Impl, c: Corpus, row: Row): Promise<void> {
  if (!GROUPS.has(row.group)) throw new Error(`${row.id}: not a row of interaction-core`);
  switch (row.group) {
    case "E": return runE(impl, c, row);
    case "I": case "V": case "L": return runTranscript(impl, c, row);
    case "B": {
      if (row.error !== "") { await expectOutcome(row, () => runB(impl, c, row)); return; }
      return runB(impl, c, row);
    }
  }
}

/** Every core row of the package's groups, result by result (the mutation harness reads these). */
export async function runAll(impl: Impl, c: Corpus): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const row of c.rows) {
    if (!GROUPS.has(row.group) || row.tier !== "core") continue;
    try { await runRow(impl, c, row); out.push({ id: row.id, ok: true }); } catch (e) { out.push({ id: row.id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}
