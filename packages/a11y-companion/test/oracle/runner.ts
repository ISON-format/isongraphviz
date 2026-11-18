// The row runner of fixtures/oracles-ia for the families of a11y-companion (design 15.3, 15.5): C (companion trees), P (DOM plans and the invariant I-C1),
// Q (executor logs), G (accessibility gate) and M (composed capability manifests). Rows of the other families belong to interaction-core and export-core.
// The runner is parameterized by the implementation (`Impl`), so the same logic runs against src/ (the conformance test) and against the scratch copies of
// the mutation harness (scripts/mutate.mjs). It imports nothing from vitest and nothing from src/.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRenderModel, initialState, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";

export interface Impl {
  buildCompanionTree(model: RenderModel, state: SemanticState, options?: unknown): unknown;
  serializeCompanionTree(t: never): Uint8Array;
  planCompanionUpdate(prev: never, next: never, options?: unknown): unknown[];
  serializePlan(ops: never): Uint8Array;
  executePlan(dom: never, host: never, ops: never, state?: never): unknown;
  createRecordingDom(): { dom: unknown; host: unknown; log(): Uint8Array };
  runAccessibilityGate(input: never): unknown;
  serializeGateReport(r: never): Uint8Array;
  composeManifest(base: never, flags: never): unknown;
}

export interface Row { id: string; group: string; tier: string; scene: string; layout: string; input: string; expected: string; error: string }
export interface Corpus { dir: string; rows: Row[]; byId: Map<string, Row>; read(rel: string): Uint8Array; text(rel: string): string }
export interface RowResult { id: string; ok: boolean; detail?: string }

/** The groups of this package. D04-D06 (tier diff) are runtime rows run by the property tests, not here. */
export const GROUPS = new Set(["C", "P", "Q", "G", "M"]);
export const DIFF_ROWS = ["D04", "D05", "D06"] as const;

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

export function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); }
  return v;
}

export function same(a: Uint8Array, b: Uint8Array, what: string): void {
  if (a.length === b.length && a.every((x, i) => x === b[i])) return;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ctx = (x: Uint8Array): string => new TextDecoder().decode(x.slice(Math.max(0, i - 40), i + 80));
  throw new Error(`${what}: bytes differ at offset ${i} (actual ${a.length} bytes, expected ${b.length}): actual ...${ctx(a)} expected ...${ctx(b)}`);
}

export async function expectOutcome<T>(row: Row, f: () => T | Promise<T>): Promise<T | undefined> {
  let value: T | undefined;
  let thrown: unknown;
  let did = false;
  try { value = await f(); } catch (e) { thrown = e; did = true; }
  if (row.error === "") {
    if (did && thrown instanceof Error && /bytes differ/.test(thrown.message)) throw thrown;
    if (did) throw new Error(`${row.id}: unexpected error ${errKey(thrown)}${thrown instanceof Error ? ` (${thrown.message.slice(0, 200)})` : ""}`);
    return value;
  }
  if (!did) throw new Error(`${row.id}: expected ${row.error}, got no error`);
  if (errKey(thrown) !== row.error) throw new Error(`${row.id}: expected ${row.error}, got ${errKey(thrown)}`);
  return undefined;
}

/** A plan file: one JSON array of strings per line, split on U+000A only (3.1). */
export function parsePlanText(text: string): string[][] {
  if (text === "") return [];
  if (!text.endsWith("\n")) throw new Error("a plan file ends with LF");
  return text.slice(0, -1).split("\n").map((l) => JSON.parse(l) as string[]);
}

function stateOf(c: Corpus, model: RenderModel, inp: Record<string, unknown>): SemanticState {
  const size = (inp["size"] as { width: number; height: number } | undefined) ?? { width: 900, height: 600 };
  const s = inp["state"];
  return s === undefined || s === "initial" ? initialState(model, size) : (JSON.parse(c.text(s as string)) as SemanticState);
}

async function runC(impl: Impl, c: Corpus, row: Row): Promise<void> {
  const inp = JSON.parse(row.input) as Record<string, unknown>;
  const model = await modelOf(c, row.scene, row.layout);
  const state = stateOf(c, model, inp);
  const options = { ...(inp["options"] as object | undefined), ...(inp["events"] === undefined ? {} : { events: inp["events"] }) };
  const tree = impl.buildCompanionTree(model, deepFreeze(state), deepFreeze(options));
  same(impl.serializeCompanionTree(tree as never), c.read(row.expected), `${row.id} tree`);
}

const treeFile = (c: Corpus, rel: string | null): unknown => (rel === null ? undefined : JSON.parse(c.text(rel)));

/** A DOM simulator for the invariant I-C1 (design 9.5, 15.9): elements with attributes, text and ordered children. Test-local, structural. */
export class SimEl {
  attrs = new Map<string, string>();
  text = "";
  children: SimEl[] = [];
  parent: SimEl | undefined;
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  set textContent(t: string) { this.text = t; for (const ch of this.children) ch.parent = undefined; this.children = []; }
  insertBefore(child: SimEl, before: SimEl | null): void {
    if (child.parent) child.parent.children = child.parent.children.filter((x) => x !== child);
    child.parent = this;
    if (before === null) this.children.push(child);
    else { const i = this.children.indexOf(before); if (i < 0) throw new Error("before is not a child"); this.children.splice(i, 0, child); }
  }
  removeChild(child: SimEl): void { this.children = this.children.filter((x) => x !== child); child.parent = undefined; }
  snapshot(): unknown { return { a: [...this.attrs].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)), t: this.text, c: this.children.map((x) => x.snapshot()) }; }
}
export function simDom(): { dom: { createElement(tag: "div"): SimEl }; host: SimEl } {
  return { dom: { createElement: () => new SimEl() }, host: new SimEl() };
}

/** The invariant I-C1 for one pair: the DOM after plan(prev, next) on the full build of prev equals the full build of next. */
export function invariantHolds(impl: Impl, prev: unknown, next: unknown): boolean {
  const a = simDom();
  const st = impl.executePlan(a.dom as never, a.host as never, impl.planCompanionUpdate(undefined as never, prev as never) as never);
  impl.executePlan(a.dom as never, a.host as never, impl.planCompanionUpdate(prev as never, next as never) as never, st as never);
  const b = simDom();
  impl.executePlan(b.dom as never, b.host as never, impl.planCompanionUpdate(undefined as never, next as never) as never);
  return JSON.stringify(a.host.snapshot()) === JSON.stringify(b.host.snapshot());
}

function runP11(impl: Impl, c: Corpus, row: Row, pairs: { pair: string; prev: string; next: string }[]): void {
  const out = pairs.map((p) => ({ equal: invariantHolds(impl, treeFile(c, p.prev), treeFile(c, p.next)), pair: p.pair }));
  same(canonicalBytesSigned(out as never), c.read(row.expected), `${row.id} invariant`);
}

function runP(impl: Impl, c: Corpus, row: Row): void {
  const inp = JSON.parse(row.input) as Record<string, unknown>;
  if ("pairs" in inp) { runP11(impl, c, row, inp["pairs"] as { pair: string; prev: string; next: string }[]); return; }
  const opts = inp["maxPlanBytes"] === undefined ? undefined : { maxPlanBytes: inp["maxPlanBytes"] };
  const ops = impl.planCompanionUpdate(deepFreeze(treeFile(c, inp["prev"] as string | null)) as never, deepFreeze(treeFile(c, inp["next"] as string)) as never, opts);
  same(impl.serializePlan(ops as never), c.read(row.expected), `${row.id} plan`);
}

function runQ(impl: Impl, c: Corpus, row: Row): void {
  const inp = JSON.parse(row.input) as { plans: string[] };
  const rec = impl.createRecordingDom();
  let state: unknown;
  let before = 0;
  for (const p of inp.plans) {
    before = rec.log().length;
    state = impl.executePlan(rec.dom as never, rec.host as never, parsePlanText(c.text(p)) as never, state as never);
  }
  same(rec.log().slice(before), c.read(row.expected), `${row.id} log`);
}

async function runG(impl: Impl, c: Corpus, row: Row): Promise<void> {
  const inp = JSON.parse(row.input) as Record<string, unknown>;
  const model = await modelOf(c, row.scene, row.layout);
  const state = stateOf(c, model, inp);
  const g: Record<string, unknown> = { model, state };
  if (inp["composition"] !== undefined) g["composition"] = inp["composition"];
  if (inp["tree"] !== undefined) g["tree"] = JSON.parse(c.text(inp["tree"] as string));
  if (inp["bindings"] !== undefined) g["bindings"] = JSON.parse(c.text(inp["bindings"] as string));
  for (const k of ["window", "reducedMotion", "readout", "canvasLabel", "svg", "mode", "tabStops"]) if (inp[k] !== undefined) g[k] = inp[k];
  if (inp["fidelity"] !== undefined) g["fidelity"] = { motion: inp["fidelity"] };
  const report = impl.runAccessibilityGate(deepFreeze(g) as never);
  same(impl.serializeGateReport(report as never), c.read(row.expected), `${row.id} gate`);
}

function runM(impl: Impl, c: Corpus, row: Row): void {
  const inp = JSON.parse(row.input) as { base: string; flags: unknown };
  const r = impl.composeManifest(deepFreeze(JSON.parse(c.text(inp.base))) as never, deepFreeze(inp.flags) as never);
  same(canonicalBytesSigned(r as never), c.read(row.expected), `${row.id} manifest`);
}

/** Runs one row; throws on a failure. Rows outside the groups of this package are not accepted. */
export async function runRow(impl: Impl, c: Corpus, row: Row): Promise<void> {
  if (!GROUPS.has(row.group)) throw new Error(`${row.id}: not a row of a11y-companion`);
  switch (row.group) {
    case "C": await expectOutcome(row, () => runC(impl, c, row)); return;
    case "P": await expectOutcome(row, () => runP(impl, c, row)); return;
    case "Q": await expectOutcome(row, () => runQ(impl, c, row)); return;
    case "G": await expectOutcome(row, () => runG(impl, c, row)); return;
    case "M": await expectOutcome(row, () => runM(impl, c, row)); return;
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
