// The oracle row runner for fixtures/oracles-svg (design 15.3, 15.4). It is parameterized by the implementation under test (`Impl`) so that
// the same code runs against src/ (test/oracle.test.ts) and against scratch mutants (scripts/mutate.mjs). It is test code: it re-derives
// what it needs (fmt, xs) independently of src/ and never imports it.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import {
  IgrError, buildRenderModel, hitTest, initialState, lookupElement, resolveSelection, selectionReference, verifyManifest,
} from "isongraph-visualize-renderer-core";
import type { ElementAddress, RenderModel, Renderer, SemanticState } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";

// ---- the implementation under test --------------------------------------------------------------------------------------
export interface Impl {
  renderSvg(model: RenderModel, state: SemanticState, options?: unknown): string;
  renderSvgDetailed(model: RenderModel, state: SemanticState, options?: unknown): { svg: string; fidelity: { labels: string; edge_labels: boolean }; label_units: number; bytes: number };
  writeSvg(model: RenderModel, state: SemanticState, options: unknown, sink: (line: string) => void): { fidelity: { labels: string; edge_labels: boolean }; label_units: number; bytes: number };
  elementDomId(prefix: string, address: ElementAddress): string;
  decodeElementId(prefix: string, id: string): ElementAddress | undefined;
  pickElement(model: RenderModel, state: SemanticState, prefix: string, input: { targetId?: string; point?: { x: number; y: number } }): ElementAddress | undefined;
  readSvg(svg: string, limits?: { maxBytes?: number; maxLineUnits?: number }): Readout;
  svgWitness(svg: string): unknown;
  svgManifest(host: "headless" | "dom", options?: unknown): unknown;
  createSvgRenderer(options?: unknown): Renderer & { svg(): string };
  createSvgSubject(options?: unknown): { manifest: unknown; create(env: unknown): Promise<Renderer>; witness?(r: Renderer): Promise<unknown> };
}
export interface Readout {
  idPrefix: string; width: number; height: number; artifact_sha256: string; scene_sha256: string; layout_sha256: string; title: string; desc: string;
  styled: boolean; directed: boolean;
  nodes: { address: unknown; id: string; category_class: string; selected: boolean; focused: boolean; tabindex: string; name: string; label?: string; cx: string; cy: string }[];
  edges: { address: unknown; id: string; selected: boolean; focused: boolean; tabindex: string; name: string; description: string; d: string; marker: boolean; label?: string; label_x?: string; label_y?: string }[];
}

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

// ---- small independent helpers ------------------------------------------------------------------------------------------
class Mismatch extends Error {}
const fail = (m: string): never => { throw new Mismatch(m); };
const code = (e: unknown): string => (e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${e instanceof Error ? e.message : String(e)}`);

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}
const canon = (v: unknown): string => JSON.stringify(sortKeys(v === undefined ? null : v));
function eq(what: string, got: unknown, want: unknown): void {
  const a = canon(got), b = canon(want);
  if (a !== b) fail(`${what}: got ${a.slice(0, 300)} want ${b.slice(0, 300)}`);
}
function eqText(what: string, got: string, want: string): void {
  if (got === want) return;
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  fail(`${what}: first difference at char ${i} (got length ${got.length}, want ${want.length}): got ...${JSON.stringify(got.slice(Math.max(0, i - 30), i + 60))} want ...${JSON.stringify(want.slice(Math.max(0, i - 30), i + 60))}`);
}
const addr = (x: unknown): ElementAddress | undefined => (x === null || x === undefined ? undefined : (x as ElementAddress));

function tokens(options: unknown): unknown {
  if (typeof options !== "object" || options === null || Array.isArray(options)) return options;
  const out: Record<string, unknown> = { ...(options as Record<string, unknown>) };
  for (const k of ["maxSvgBytes", "maxDrawnLabelUnits"]) {
    if (out[k] === "NaN") out[k] = NaN;
    else if (out[k] === "Infinity") out[k] = Infinity;
    else if (out[k] === "-Infinity") out[k] = -Infinity;
  }
  return out;
}

const parseInput = (row: Row): Record<string, any> => (/^[{[]/.test(row.input) ? (JSON.parse(row.input) as Record<string, any>) : {}); // eslint-disable-line @typescript-eslint/no-explicit-any

async function modelAndState(c: Oracle, row: Row, input: Record<string, any>): Promise<{ model: RenderModel; state: SemanticState }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const model = await c.model(row.scene, row.layout);
  const s = input["state"];
  const state = s === "initial" || s === undefined ? initialState(model, input["size"] as { width: number; height: number }) : (c.json(s as string) as SemanticState);
  return { model, state };
}

// independent re-derivations used by T14 (3.2, 3.3, 7.1)
const divRoundN = (a: bigint, b: bigint): bigint => { const n = 2n * a + b, d = 2n * b; let q = n / d; if (n % d !== 0n && n < 0n) q -= 1n; return q; };
function fmtN(v: bigint): string {
  const m = divRoundN(v, 1000n);
  if (m === 0n) return "0";
  const a = m < 0n ? -m : m;
  const r = a % 1000n;
  const t = (a / 1000n).toString() + (r === 0n ? "" : "." + r.toString().padStart(3, "0").replace(/0+$/, ""));
  return m < 0n ? "-" + t : t;
}
function xsN(s: string): string {
  let o = "";
  for (const ch of s) { const c = ch.codePointAt(0)!; o += c === 9 || c === 10 || c === 13 || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000 ? ch : "�"; }
  return o;
}

// ---- document rows (G, N, X, Y, O, F) -------------------------------------------------------------------------------------
function rendererOptions(svg: unknown): unknown { return svg === undefined ? undefined : { svg }; }

async function docRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  let model = await c.model(row.scene, row.layout);
  const { state } = await modelAndState(c, row, input);
  if (input["plain_object_model"] === true) model = { ...model } as RenderModel; // O22: shaped like a model, not a model
  const options = tokens(input["options"]);
  if (row.id === "F05") return f05(impl, c, row, model, state, options, input);
  if (row.error) {
    let got = "none";
    try { impl.renderSvg(model, state, options); } catch (e) { got = code(e); }
    if (got !== row.error) fail(`renderSvg: got ${got} want ${row.error}`);
    if (row.id === "Y14" || row.id === "Y15") await subjectLoadError(impl, model, state, input, row.error);
    return;
  }
  const want = c.text(row.expected);
  const r = impl.renderSvgDetailed(model, state, options);
  eqText("renderSvg", r.svg, want);
  eqText("renderSvgDetailed.svg", impl.renderSvg(model, state, options), want);
  const ef = input["expect_fidelity"] as { labels: string; edge_labels: boolean; label_units: number } | undefined;
  if (ef) { eq("fidelity", { labels: r.fidelity.labels, edge_labels: r.fidelity.edge_labels, label_units: r.label_units }, ef); }
  eq("bytes", r.bytes, new TextEncoder().encode(want).length);
  const lines: string[] = [];
  const w = impl.writeSvg(model, state, options, (l) => { lines.push(l); });
  eqText("writeSvg lines", lines.join(""), want);
  eq("writeSvg bytes", w.bytes, r.bytes);
  if (lines.some((l) => !l.endsWith("\n") || l.indexOf("\n") !== l.length - 1)) fail("every delivered line must be exactly one LF-terminated line");
  if (row.tier === "both") {
    const rr = impl.createSvgRenderer(rendererOptions(options));
    await rr.initialize({ host: "headless", size: input["size"], reducedMotion: false });
    await rr.loadScene(model, state);
    eqText("subject svg()", rr.svg(), want);
    if (ef) { const f = rr.probe().fidelity; eq("probe().fidelity", { labels: f.labels, edge_labels: f.edge_labels }, { labels: ef.labels, edge_labels: ef.edge_labels }); }
    await rr.dispose();
  }
}

async function subjectLoadError(impl: Impl, model: RenderModel, state: SemanticState, input: Record<string, any>, want: string): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rr = impl.createSvgRenderer();
  await rr.initialize({ host: "headless", size: input["size"], reducedMotion: false });
  let got = "none";
  try { await rr.loadScene(model, state); } catch (e) { got = code(e); }
  if (got !== want) fail(`subject loadScene: got ${got} want ${want}`);
}

async function f05(impl: Impl, c: Oracle, row: Row, model: RenderModel, state: SemanticState, options: unknown, input: Record<string, any>): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const want = c.json(row.expected) as { error: string; sink_bytes: number; sink_lines: number; sink_at_most: number };
  let bytes = 0, lines = 0, got = "none";
  try { impl.writeSvg(model, state, options, (l) => { bytes += new TextEncoder().encode(l).length; lines++; }); } catch (e) { got = code(e); }
  if (got !== want.error) fail(`writeSvg error: got ${got} want ${want.error}`);
  const most = input["expect_sink_bytes_at_most"] as number;
  if (bytes > most) fail(`the sink received ${bytes} bytes, more than ${most}`);
  eq("sink bytes and lines (corpus data)", { bytes, lines }, { bytes: want.sink_bytes, lines: want.sink_lines });
}

// ---- T rows ---------------------------------------------------------------------------------------------------------------
const idsOf = (svg: string): string[] => Array.from(svg.matchAll(/<g id="([^"]+)"/g), (m) => m[1]!);

async function t01(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const stored = c.text(input["svg"] as string);
  // the ids of the document the implementation writes for the row's scene, and the ids of the stored X01 document, decode to the listed addresses
  const model = await c.model(row.scene, row.layout);
  const written = impl.renderSvg(model, initialState(model, { width: 900, height: 600 }), { idPrefix: input["idPrefix"] });
  const want = c.json(row.expected);
  for (const [name, doc] of [["written", written], ["stored", stored]] as const) {
    const got = idsOf(doc).map((id) => { const a = impl.decodeElementId(input["idPrefix"] as string, id); return a === undefined ? { id } : { id, address: a }; });
    eq(`T01 ids (${name} document)`, got, want);
  }
}

async function t03(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const cases = c.json(row.input) as { case: string; idPrefix: string; id: string }[];
  const got = cases.map((x) => ({ case: x.case, address: impl.decodeElementId(x.idPrefix, x.id) ?? null }));
  eq("T03 decode", got, c.json(row.expected));
}

async function chainRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const { model, state } = await modelAndState(c, row, input);
  const P = input["idPrefix"] as string;
  const want = c.json(row.expected) as { drawn_order: ElementAddress[]; elements: { element: ElementAddress; id: string; by_id: ElementAddress; objectRef: unknown; identity?: unknown; conflicts: [number, number, string, number][] }[]; pointer: { x: number; y: number; pick: ElementAddress | null }[] };
  const svg = impl.renderSvg(model, state, { idPrefix: P });
  // RT-A: the ids of the document decode to the drawn order
  eq("RT-A decoded ids", idsOf(svg).map((id) => impl.decodeElementId(P, id)), want.drawn_order);
  const source = input["source"] ? c.bytes(input["source"] as string) : undefined;
  const sub = impl.createSvgRenderer();
  await sub.initialize({ host: "headless", size: input["size"], reducedMotion: false });
  await sub.loadScene(model, state);
  for (const el of want.elements) {
    eq("id", impl.elementDomId(P, el.element), el.id);
    eq(`pickElement by id ${el.id.slice(0, 20)}`, impl.pickElement(model, state, P, { targetId: el.id }), el.by_id);
    for (const [x, y, kind, exp] of el.conflicts) {
      const w = exp === -1 ? undefined : want.drawn_order[exp];
      eq(`conflict ${kind} ${x},${y} for ${JSON.stringify(el.element).slice(0, 60)}`, impl.pickElement(model, state, P, { targetId: el.id, point: { x, y } }), w);
    }
    const ref = selectionReference(model, el.element);
    eq("objectRef", ref, el.objectRef);
    const events = sub.dispatch({ type: "select", mode: "replace", targets: [el.element] });
    const ev = events.find((e) => e.type === "selection-changed");
    eq("selection-changed ref", ev && ev.type === "selection-changed" ? ev.selection : undefined, [el.objectRef]);
    if (el.identity !== undefined && source !== undefined) eq("resolveSelection", await resolveSelection(model, el.element, source), el.identity);
    sub.dispatch({ type: "clear-selection" });
  }
  for (const p of want.pointer) eq(`pointer ${p.x},${p.y}`, impl.pickElement(model, state, P, { point: { x: p.x, y: p.y } }), addr(p.pick));
}

async function t17(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const want = c.json(row.expected) as { points: { scene: string; x: number; y: number; hit: ElementAddress | null; label: string }[] };
  const m1 = await c.model(row.scene, row.layout);
  const also = input["also"] as { scene: string; layout: string };
  const m2 = await c.model(also.scene, also.layout);
  for (const p of want.points) {
    const model = p.scene === "mixed20" ? m1 : m2;
    const state = initialState(model, input["size"] as { width: number; height: number });
    const r = impl.createSvgRenderer();
    await r.initialize({ host: "headless", size: input["size"], reducedMotion: false });
    await r.loadScene(model);
    eq(`T17 ${p.label} (subject.hitTest)`, r.hitTest({ x: p.x, y: p.y }) ?? null, p.hit);
    eq(`T17 ${p.label} (hitTest)`, hitTest(model, state, { x: p.x, y: p.y }) ?? null, p.hit);
    // RT-C(a): a hit is an element that is drawn
    if (p.hit !== null) { const svg = impl.renderSvg(model, state); if (!idsOf(svg).includes(impl.elementDomId("igr", p.hit))) fail("RT-C: a hit that is not drawn"); }
  }
}

async function t18(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const { model, state } = await modelAndState(c, row, input);
  const want = c.json(row.expected) as { label: string; input: { targetId?: string; point?: { x: number; y: number } }; pick: ElementAddress | null }[];
  for (const k of want) eq(`T18 ${k.label}`, impl.pickElement(model, state, "igr", k.input), addr(k.pick));
}

async function t31(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const want = c.json(row.expected) as { scene: string; label: string; input: { targetId?: string; point?: { x: number; y: number } }; pick: ElementAddress | null }[];
  const m1 = await modelAndState(c, row, input);
  const also = input["also"] as { scene: string; layout: string };
  const m2 = await c.model(also.scene, also.layout);
  for (const k of want) {
    const model = k.scene === "o1" ? m1.model : m2;
    const state = k.scene === "o1" ? m1.state : initialState(m2, input["size"] as { width: number; height: number });
    eq(`T31 ${k.label}`, impl.pickElement(model, state, "igr", k.input), addr(k.pick));
  }
}

function agrees(readout: Readout, model: RenderModel, state: SemanticState): boolean {
  const vp = state.viewport;
  const hidden = new Set<string>(state.hidden.nodes.map((n) => JSON.stringify(n)));
  const hiddenE = new Set<string>(state.hidden.edges.map((e) => JSON.stringify(e)));
  const visN = model.nodes.filter((n) => !hidden.has(JSON.stringify(n.ref)));
  const visNset = new Set(visN.map((n) => JSON.stringify(n.ref)));
  const visE = model.edges.filter((e) => !hiddenE.has(JSON.stringify(e.ref)) && visNset.has(JSON.stringify(model.nodes[e.src]!.ref)) && visNset.has(JSON.stringify(model.nodes[e.tgt]!.ref)));
  if (readout.nodes.length !== visN.length || readout.edges.length !== visE.length) return false;
  if (readout.directed !== model.directed) return false;
  const selN = new Set(state.selection.nodes.map((n) => JSON.stringify(n))), selE = new Set(state.selection.edges.map((e) => JSON.stringify(e)));
  const foc = state.focus ? JSON.stringify("node" in state.focus ? state.focus.node : state.focus.edge) : undefined;
  let firstTab = readout.nodes.length + readout.edges.length > 0 ? 0 : -1;
  if (foc !== undefined) firstTab = -2;
  const cats = model.categories;
  for (let i = 0; i < visN.length; i++) {
    const n = visN[i]!, r = readout.nodes[i]!;
    const X = (BigInt(n.x) - BigInt(vp.center_x)) * BigInt(vp.zoom) + BigInt(vp.width) * 500000n, Y = (BigInt(n.y) - BigInt(vp.center_y)) * BigInt(vp.zoom) + BigInt(vp.height) * 500000n;
    const c = cats.indexOf(n.category);
    if (JSON.stringify(r.address) !== JSON.stringify(n.ref) || r.name !== xsN(`${n.category} ${n.label}`) || r.selected !== selN.has(JSON.stringify(n.ref)) || r.focused !== (foc === JSON.stringify(n.ref))
      || r.cx !== fmtN(X) || r.cy !== fmtN(Y) || r.category_class !== (c < 8 ? `igr-k${c}` : "igr-kx")) return false;
    if (r.tabindex !== (foc !== undefined ? (r.focused ? "0" : "-1") : i === 0 ? "0" : "-1")) return false;
  }
  for (let j = 0; j < visE.length; j++) {
    const e = visE[j]!, r = readout.edges[j]!;
    if (JSON.stringify(r.address) !== JSON.stringify(e.ref) || r.name !== xsN(e.label) || r.selected !== selE.has(JSON.stringify(e.ref)) || r.focused !== (foc === JSON.stringify(e.ref))) return false;
    if (r.marker !== model.directed) return false;
    const d = xsN(`${model.nodes[e.src]!.label} ${e.ref.rel} ${model.nodes[e.tgt]!.label}`);
    if (r.description !== d) return false;
    if (r.tabindex !== (foc !== undefined ? (r.focused ? "0" : "-1") : visN.length === 0 && j === 0 ? "0" : "-1")) return false;
  }
  void firstTab;
  return true;
}

async function t14(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const rows = (parseInput(row)["rows"] as string[]) ?? [];
  const want = c.json(row.expected) as { row: string; nodes: number; edges: number; agrees_with_model: boolean; readout_sha256: string }[];
  const listed = rows.filter((id) => !c.byId.get(id)!.error);
  eq("T14 rows listed", want.map((w) => w.row), listed);
  for (const w of want) {
    const r = c.byId.get(w.row)!;
    const input = parseInput(r);
    const { model, state } = await modelAndState(c, r, input);
    const svg = c.text(r.expected);
    const ro = impl.readSvg(svg);
    eq(`${w.row} counts`, { nodes: ro.nodes.length, edges: ro.edges.length }, { nodes: w.nodes, edges: w.edges });
    eq(`${w.row} agrees_with_model`, agrees(ro, model, state), w.agrees_with_model);
    const proj = JSON.parse(JSON.stringify(ro)) as Record<string, unknown>;
    const got = sha256(canonicalBytesSigned(proj as unknown as CJValue));
    if (got !== w.readout_sha256) fail(`${w.row} readout projection digest ${got} want ${w.readout_sha256}`);
  }
}

async function badRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  let got = "none";
  try { impl.readSvg(c.text(row.input)); } catch (e) { got = code(e); }
  if (got !== row.error) fail(`readSvg: got ${got} want ${row.error}`);
}

async function t27(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const g01 = c.byId.get("G01")!;
  const svg = c.text(g01.expected);
  const want = c.json(row.expected) as { limits: { maxBytes?: number; maxLineUnits?: number }; result: string }[];
  for (const k of want) {
    let got = "ok";
    try { impl.readSvg(svg, k.limits); } catch (e) { got = code(e); }
    if (got !== k.result) fail(`readSvg ${JSON.stringify(k.limits)}: got ${got} want ${k.result}`);
  }
}

async function t28(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const want = c.json(row.expected) as { case: string; decoded: boolean; hex_digits?: number }[];
  const inline = parseInput(row);
  const long = want[0]!;
  const digits = long.hex_digits ?? (inline["maxIdHexDigits"] as number) + 2;
  const json = '{"id":"s:' + "a".repeat(digits / 2 - 22) + '","type":"p"}';
  const id = "igr-n-" + Array.from(new TextEncoder().encode(json), (b) => b.toString(16).padStart(2, "0")).join("");
  if (id.length !== 6 + digits) fail(`generated id has ${id.length - 6} digits, want ${digits}`);
  // the generated value is recorded in generated/GENERATED.tsv (length and SHA-256): the construction is reproduced exactly
  const rec = c.text("generated/GENERATED.tsv").split("\n").map((l) => l.split("\t")).find((x) => x[0] === "T28");
  if (!rec || Number(rec[3]) !== id.length || rec[4] !== sha256(id)) fail("the generated T28 id differs from the value recorded in generated/GENERATED.tsv");
  eq("T28 long id decodes to undefined", impl.decodeElementId("igr", id) !== undefined, long.decoded);
  const deep = "igr-n-" + Array.from(new TextEncoder().encode('{"a":{"b":{"c":{"d":"x"}}}}'), (b) => b.toString(16).padStart(2, "0")).join("");
  eq("T28 nested decodes to undefined", impl.decodeElementId("igr", deep) !== undefined, want[1]!.decoded);
}

// ---- U rows ---------------------------------------------------------------------------------------------------------------
interface Call { op: string; arg?: any; expect: string; await?: boolean; expect_state?: string; expect_svg?: string; expect_fidelity?: unknown; expect_media_type?: string; expect_bytes?: string; expect_bytes_sha256?: string } // eslint-disable-line @typescript-eslint/no-explicit-any
interface Script { calls: Call[]; env: { host: string; reducedMotion: boolean; size: { width: number; height: number } }; listener: string; expect_listener_svgs?: string[]; subject_options?: unknown; model: { scene: string; layout: string } }

async function runScript(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const script = c.json(row.input) as Script;
  const model = await c.model(script.model.scene, script.model.layout);
  let renderer: (Renderer & { svg(): string }) | undefined;
  let rendererOptions: unknown = script.subject_options;
  const svgs: string[] = [];
  const listenerErrors: string[] = [];
  const makeRenderer = (o: unknown): void => { renderer = impl.createSvgRenderer(o); };
  makeRenderer(rendererOptions);
  let pending: Promise<unknown> | undefined;
  let i = 0;
  for (const call of script.calls) {
    i++;
    const where = `${row.id} call ${i} (${call.op})`;
    let got = "ok";
    let result: unknown;
    const r = renderer!;
    try {
      switch (call.op) {
        case "create": { const o = call.arg && typeof call.arg === "object" ? { ...call.arg, svg: tokens(call.arg.svg) } : call.arg; makeRenderer(o); rendererOptions = o; break; }
        case "initialize": {
          const env = { ...script.env, ...(call.arg ?? {}) } as Record<string, unknown>;
          if (script.listener === "svg-inside") { const me = r; env["onEvent"] = () => { try { svgs.push(me.svg()); } catch (e) { svgs.push(code(e)); listenerErrors.push(code(e)); } }; }
          await r.initialize(env as never);
          break;
        }
        case "loadScene": {
          const m = call.arg?.model ? await c.model(call.arg.model.scene, call.arg.model.layout) : model;
          const p = r.loadScene(m);
          if (call.await === false) { pending = p; p.catch(() => undefined); } else { await p; }
          break;
        }
        case "render": await r.render(); if (pending) { await pending; pending = undefined; } break;
        case "svg": result = r.svg(); break;
        case "dispatch": result = r.dispatch(call.arg); break;
        case "getState": result = r.getState(); break;
        case "probe": result = r.probe(); break;
        case "export": result = await r.export(call.arg); break;
        case "setReducedMotion": r.setReducedMotion(call.arg); break;
        case "dispose": await r.dispose(); break;
        default: fail(`${where}: unknown op`);
      }
    } catch (e) { got = code(e); }
    if (got !== call.expect) fail(`${where}: got ${got} want ${call.expect}`);
    if (got !== "ok") continue;
    if (call.expect_svg !== undefined) eqText(`${where} svg`, result as string, c.text(call.expect_svg));
    if (call.expect_state !== undefined) eq(`${where} state`, call.op === "dispatch" ? r.getState() : result, c.json(call.expect_state));
    if (call.expect_fidelity !== undefined) eq(`${where} fidelity`, (result as { fidelity: unknown }).fidelity, call.expect_fidelity);
    if (call.op === "export") {
      const ex = result as { media_type: string; bytes: Uint8Array };
      if (call.expect_media_type !== undefined) eq(`${where} media type`, ex.media_type, call.expect_media_type);
      if (call.expect_bytes !== undefined) eq(`${where} bytes`, Array.from(ex.bytes), Array.from(c.bytes(call.expect_bytes)));
      if (call.expect_bytes_sha256 !== undefined) eq(`${where} bytes sha`, sha256(ex.bytes), call.expect_bytes_sha256);
    }
  }
  if (script.expect_listener_svgs !== undefined) {
    const want = script.expect_listener_svgs.map((p) => (/^[A-Z_]+\/[A-Z_]*$/.test(p) ? p : c.text(p)));
    eq(`${row.id} listener svgs count`, svgs.length, want.length);
    for (let k = 0; k < want.length; k++) eqText(`${row.id} listener svg ${k}`, svgs[k]!, want[k]!);
  }
  if (pending) await pending;
}

const cj = (v: unknown): Uint8Array => canonicalBytesSigned(v as CJValue);
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

async function u06(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const cases: { host: "headless" | "dom"; expected: string }[] = [{ host: input["host"], expected: input["expected"] }, ...((input["also"] as { host: "headless" | "dom"; expected: string }[]) ?? [])];
  for (const k of cases) {
    const m = impl.svgManifest(k.host);
    if (!sameBytes(cj(m), c.bytes(k.expected))) fail(`svgManifest(${k.host}) bytes differ from ${k.expected}`);
    verifyManifest(m);
  }
}

async function u09(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const cases = [{ svg: input["svg"], expected: input["expected"] }, ...((input["also"] as { svg: string; expected: string }[]) ?? [])] as { svg: string; expected: string }[];
  for (const k of cases) if (!sameBytes(cj(impl.svgWitness(c.text(k.svg))), c.bytes(k.expected))) fail(`svgWitness(${k.svg}) bytes differ from ${k.expected}`);
}

async function u13(impl: Impl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const model = await c.model(row.scene, row.layout);
  const want = c.json(row.expected) as { render: string; svg: string };
  const r = impl.createSvgRenderer(input["options"]);
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model);
  let renderGot = "ok", svgGot = "ok";
  try { await r.render(); } catch (e) { renderGot = code(e); }
  try { r.svg(); } catch (e) { svgGot = code(e); }
  eq("U13 render()", renderGot, want.render);
  eq("U13 svg()", svgGot, want.svg);
}
const SIZE = { width: 900, height: 600 };

// ---- heavy rows: the kit run over the IGR/1 corpus (U10, U11, U12) -----------------------------------------------------------
export const HEAVY = new Set(["U10", "U11", "U12", "T28"]);

export async function runHeavy(impl: Impl, c: Oracle, row: Row, igrCorpusDir: string): Promise<void> {
  const { runConformance } = await import("isongraph-visualize-renderer-core");
  const { loadCorpus } = await import("isongraph-visualize-renderer-core/conformance/node");
  if (row.id === "T28") return t28(impl, c, row);
  const corpus = await loadCorpus(igrCorpusDir);
  if (row.id === "U10") {
    const rep = await runConformance(impl.createSvgSubject() as never, corpus, { seeds: [1] });
    if (rep.verdict === "fail") fail(`kit verdict fail: ${JSON.stringify(rep.results.filter((r) => r.verdict === "fail").slice(0, 4))}`);
    eq("U10 level", rep.level, 2);
    eq("U10 claimable", rep.claimable, false);
    return;
  }
  if (row.id === "U11") {
    const want = c.json(row.expected) as { W01: string; honest_subject_W01: string; level: number };
    const honest = impl.createSvgSubject();
    const double = {
      ...honest,
      create: async (env: unknown) => {
        const r = (await honest.create(env)) as Renderer & { svg(): string };
        const orig = r.svg.bind(r);
        r.svg = () => {
          let s = orig();
          const at = s.indexOf('<g id="igr-n-7b226964223a22733a616e6e'); // the second node (s:ann)
          if (at >= 0) { const end = s.indexOf("</g>\n", at) + 5; s = s.slice(0, at) + s.slice(end); }
          return s.split("person 1").join("person X");
        };
        return r;
      },
    };
    const rh = await runConformance(honest as never, corpus, { seeds: [1] });
    const rd = await runConformance(double as never, corpus, { seeds: [1] });
    eq("U11 honest W01", rh.results.find((r) => r.id === "W01")?.verdict, want.honest_subject_W01);
    eq("U11 double W01", rd.results.find((r) => r.id === "W01")?.verdict, want.W01);
    eq("U11 double level", rd.level, want.level);
    return;
  }
  if (row.id === "U12") {
    const input = parseInput(row);
    const want = c.json(row.expected) as { "CHK-CAP": string; fidelity: unknown; fidelity_consistent: boolean; labels_edge: unknown; manifest_bytes_equal: boolean };
    const subject = impl.createSvgSubject(input["options"]);
    const rep = await runConformance(subject as never, corpus, { only: ["L01"], seeds: [1] });
    eq("U12 CHK-CAP", rep.results.some((r) => r.check === "CHK-CAP" && r.verdict === "fail") ? "fail" : "pass", want["CHK-CAP"]);
    const model = await c.model(row.scene, row.layout);
    const r = (await subject.create({ host: "headless" })) as Renderer;
    await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
    await r.loadScene(model);
    eq("U12 manifest bytes equal", sameBytes(cj(subject.manifest), cj(r.manifest)), want.manifest_bytes_equal);
    eq("U12 fidelity", r.probe().fidelity, want.fidelity);
    eq("U12 labels.edge", (r.manifest.capabilities as Record<string, unknown>)["labels.edge"], want.labels_edge);
    return;
  }
}

// ---- dispatch -----------------------------------------------------------------------------------------------------------------
export interface RowResult { id: string; ok: boolean; detail?: string }

export async function runRow(impl: Impl, c: Oracle, row: Row): Promise<void> {
  switch (row.group) {
    case "G": case "N": case "X": case "Y": case "O": case "F": case "L": return docRow(impl, c, row);
    case "T": {
      const n = row.id;
      if (n === "T01") return t01(impl, c, row);
      if (n === "T02" || n === "T15" || n === "T16") return chainRow(impl, c, row);
      if (n === "T03") return t03(impl, c, row);
      if (n === "T14") return t14(impl, c, row);
      if (n === "T17") return t17(impl, c, row);
      if (n === "T18") return t18(impl, c, row);
      if (n === "T27") return t27(impl, c, row);
      if (n === "T28") return t28(impl, c, row);
      if (n === "T31") return t31(impl, c, row);
      return badRow(impl, c, row);
    }
    case "U": {
      if (row.id === "U06") return u06(impl, c, row);
      if (row.id === "U09") return u09(impl, c, row);
      if (row.id === "U13") return u13(impl, c, row);
      if (HEAVY.has(row.id)) return fail("heavy row: run through runHeavy");
      return runScript(impl, c, row);
    }
    case "D": case "K": return; // runtime differential rows are test/differential.test.ts; K rows are the mutation matrix (scripts/mutate.mjs)
    default: return fail(`unknown group ${row.group}`);
  }
}

/** Runs every non-heavy row (or the ids given); never throws: failures are returned. */
export async function runAll(impl: Impl, c: Oracle, ids?: readonly string[]): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const row of c.rows) {
    if (ids ? !ids.includes(row.id) : HEAVY.has(row.id)) continue;
    try { await runRow(impl, c, row); out.push({ id: row.id, ok: true }); }
    catch (e) { out.push({ id: row.id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}

void lookupElement;
