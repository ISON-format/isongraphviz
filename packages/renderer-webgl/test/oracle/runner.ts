// The oracle row runner for fixtures/oracles-gl (design 13.2, 13.4): the function rows G, B, H, W, X, E, P and the renderer rows U. Parameterized by the
// implementation under test (`GlImpl`) so that the same logic runs against src/ (test/oracle.test.ts) and against scratch mutants (scripts/mutate.mjs).
// Tiers (13.2): `core` rows are a function on bytes, `both` rows are the function and the subject renderer, `subject` rows are lifecycle/controller rows.
import { createHash } from "node:crypto";
import { initialState } from "isongraph-visualize-renderer-core";
import type * as Dl from "isongraph-visualize-display-list";
import type * as Cv from "isongraph-visualize-display-list/canvas2d";
import type * as Gl from "../../src/index.js";
import type * as Internal from "../../src/renderer.js";
import { code, eq, eqBytes, fail, modelAndState, parseInput, sha256, type Json, type Oracle, type Row } from "./corpus.js";
import { scrapeSvg } from "./svg-scrape.js";
import { HEAVY, planBytesRow, runHeavy, runRendererRow } from "./renderer-rows.js";
import { canon, createFakeCanvas, createFakeGl, type FakeCanvas, type FakeGl, type FakeGlOptions } from "../fake-gl.js";

export { loadOracle, verifySums, sumsDigest, type Oracle, type Row } from "./corpus.js";
export interface RowResult { id: string; ok: boolean; detail?: string }

/** The implementation under test: the exports of renderer-webgl plus the two libraries it builds on. */
export type GlImpl = typeof Gl & { composeWebglRenderer: typeof Internal.composeWebglRenderer; dl: typeof Dl & typeof Cv };

const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);
const SIZE = { width: 900, height: 600 };
export const sha16 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex").slice(0, 16);

// ---- G, B: the plan rows ------------------------------------------------------------------------------------------------------------------------
async function planFor(impl: GlImpl, c: Oracle, row: Row, input: Json, stateOverride?: string, limits?: { maxBytes?: number }): Promise<Uint8Array> {
  const { model, state } = await modelAndState(c, row, input, stateOverride);
  const list = impl.dl.buildDisplayList(model, state);
  return impl.serializePlan(impl.planGl(list, limits));
}

async function planRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const limits = input["limits"] as { maxBytes?: number } | undefined;
  if (row.error) {
    let got = "none";
    try { await planFor(impl, c, row, input, undefined, limits); } catch (e) { got = code(e); }
    if (got !== row.error) fail(`${row.id} planGl: got ${got} want ${row.error}`);
    return;
  }
  const cases: { state?: string; expected: string }[] = [{ state: input["state"] as string, expected: row.expected }, ...((input["also"] as { state: string; expected: string }[]) ?? [])];
  for (const k of cases) eqBytes(`${row.id} serializePlan(planGl(list)) ${k.expected}`, await planFor(impl, c, row, input, k.state, limits), c.bytes(k.expected));
}

// ---- H: the shader set ---------------------------------------------------------------------------------------------------------------------------
const NAMES = ["arrow.fs", "arrow.vs", "disc.fs", "disc.vs", "edge.fs", "edge.vs"] as const;
const sourceOf = (impl: GlImpl, n: string): string => {
  const [p, s] = n.split(".") as ["arrow" | "disc" | "edge", "vs" | "fs"];
  return impl.SHADER_SOURCES[p][s];
};
const digestsOf = (impl: GlImpl): Record<string, string> => Object.fromEntries(NAMES.map((n) => [n, sha256(sourceOf(impl, n))]));

/** The identifier sets of one source, from its text by a small line parser (H-3). */
function identifiers(src: string): { uniforms: string[]; outs: string[]; ins: string[]; constants: string[] } {
  const out = { uniforms: [] as string[], outs: [] as string[], ins: [] as string[], constants: [] as string[] };
  for (const l of src.split("\n")) {
    let m: RegExpExecArray | null;
    if ((m = /^uniform \w+ (\w+);$/.exec(l))) out.uniforms.push(m[1]!);
    else if ((m = /^(?:flat )?out \w+ (\w+);$/.exec(l))) { if (m[1] !== "o_color") out.outs.push(m[1]!); }
    else if ((m = /^(?:flat )?in \w+ (\w+);$/.exec(l))) out.ins.push(m[1]!);
    else if ((m = /^const \w+(?:\[\d+\])? (\w+)/.exec(l))) out.constants.push(m[1]!);
  }
  return out;
}

async function shaderRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const set = impl.shaderSetBytes();
  switch (row.id) {
    case "H01": return eqBytes("H01 shaderSetBytes()", set, c.bytes(row.expected));
    case "H02":
      eq("H02", { SHADER_SET_SHA256: sha256(set), bytes: set.length }, c.json(row.expected));
      return eq("H02 constant", impl.SHADER_SET_SHA256, sha256(set));
    case "H03": return eq("H03", NAMES.map((n) => ({ bytes: bytesOf(sourceOf(impl, n)).length, name: n, sha256: sha256(sourceOf(impl, n)) })), c.json(row.expected));
    case "H04": {
      const got: Json = {};
      for (const n of NAMES) {
        const s = sourceOf(impl, n);
        got[n] = {
          "H-1": s.startsWith("#version 300 es\n") && s.endsWith("\n") && !s.endsWith("\n\n") && /^[\x20-\x7e\n]*$/.test(s) && !s.includes("\r") && !s.includes("\t") && !/ \n/.test(s),
          "H-2": !/#(include|extension|define|pragma|line)\b/.test(s),
        };
      }
      return eq("H04", got, c.json(row.expected));
    }
    case "H05": {
      const before = digestsOf(impl);
      for (const scene of parseInput(row)["scenes"] as string[]) {
        const model = await c.model(scene, scene.replace("/scenes/", "/layouts/").replace(".scene.json", ".layout.json"));
        impl.planGl(impl.dl.buildDisplayList(model, initialState(model, SIZE)));
      }
      const after = digestsOf(impl);
      return eq("H05", { after_hostile_plans: after, before, identical: JSON.stringify(before) === JSON.stringify(after) }, c.json(row.expected));
    }
    case "H06": {
      const want = c.json(row.expected) as Json;
      for (const p of ["arrow", "disc", "edge"] as const) {
        const vs = identifiers(impl.SHADER_SOURCES[p].vs), fs = identifiers(impl.SHADER_SOURCES[p].fs);
        const consts = [...vs.constants, ...fs.constants].filter((x, i, a) => a.indexOf(x) === i).sort();
        eq(`H06 ${p} actual`, { attributes: [...vs.ins].sort(), constants: consts, uniforms: { fs: [...fs.uniforms].sort(), vs: [...vs.uniforms].sort() }, varyings: [...vs.outs].sort() }, want[p].actual);
        eq(`H06 ${p} fs inputs`, [...fs.ins].sort(), want[p].fs_inputs);
        eq(`H06 ${p} the fragment inputs are the vertex outputs`, [...fs.ins].sort(), [...vs.outs].sort());
      }
      return;
    }
  }
}

// ---- W: the plan reader ------------------------------------------------------------------------------------------------------------------------
async function readerRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  // 13.2: an input that starts with `{` is the inline `files` form (W01, W47): the strict reader accepts each file and re-serializes it to itself. Any
  // other input is a path under bad/ and the row's error cell names the rejection. The form decides, never the id.
  const files = parseInput(row)["files"];
  if (Array.isArray(files)) {
    if (row.error !== "") fail(`${row.id}: the files form is an acceptance row but its error cell is ${row.error}`);
    for (const f of files as string[]) {
      const bytes = c.bytes(f);
      eqBytes(`${row.id} serializePlan(parseGlPlan(${f}))`, impl.serializePlan(impl.parseGlPlan(bytes)), bytes);
    }
    return;
  }
  if (row.error === "") fail(`${row.id}: a path input needs an error cell (an acceptance row uses the inline files form)`);
  let got = "none";
  try { impl.parseGlPlan(c.bytes(row.input)); } catch (e) { got = code(e); }
  if (got !== row.error) fail(`${row.id} parseGlPlan(${row.input}): got ${got} want ${row.error}`);
}

// ---- X: readouts -------------------------------------------------------------------------------------------------------------------------------
async function readoutRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  if (row.id === "X07") {
    let got = "none";
    try { impl.dl.serializeReadout(impl.readoutFromGl(impl.readGlPlan(c.bytes(input["plan"]), { lenient: true }))); } catch (e) { got = code(e); }
    if (got !== row.error) fail(`X07 readoutFromGl(lenient read): got ${got} want ${row.error}`);
    return;
  }
  const want = c.bytes(row.expected);
  eqBytes(`${row.id} readoutFromGl(parseGlPlan(${input["plan"]}))`, impl.dl.serializeReadout(impl.readoutFromGl(impl.parseGlPlan(c.bytes(input["plan"])))), want);
  if (input["from"] === "three-way") {
    const { model, state } = await modelAndState(c, row, { size: SIZE, state: "initial" });
    const list = impl.dl.buildDisplayList(model, state);
    eqBytes("X05 readout from the SVG document", impl.dl.serializeReadout(impl.dl.readoutFromSvgReadout(scrapeSvg(c.text(input["svg"])) as never)), want);
    eqBytes("X05 readout from the stored Canvas stream", impl.dl.serializeReadout(impl.dl.readoutFromCanvasStream(c.bytes(input["calls"]), list)), want);
    eqBytes("X05 readout from the list", impl.dl.serializeReadout(impl.dl.readoutFromList(list)), want);
  }
  if (input["equals_list_readout"] === true) {
    const { model, state } = await modelAndState(c, row, { size: SIZE, state: "initial" });
    const list = impl.dl.buildDisplayList(model, state);
    eqBytes("X09 readout of the row's own list", impl.dl.serializeReadout(impl.dl.readoutFromList(list)), want);
    // the stored plan is the plan of that list (the row's scene is its own): the table and the label runs of the plan are the list's (B17-like)
    eqBytes("X09 the plan of the row's own list is the stored plan", impl.serializePlan(impl.planGl(list)), c.bytes(input["plan"]));
  }
}

// ---- E: the executor call log against a fake context -----------------------------------------------------------------------------------------
async function execRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const { model, state } = await modelAndState(c, row, input);
  const plan = impl.planGl(impl.dl.buildDisplayList(model, state));
  const scenario = input["scenario"] as string;
  const log: string[] = [];
  const failCompile = scenario.startsWith("fail-compile:") ? scenario.slice("fail-compile:".length) : undefined;
  const failLink = scenario.startsWith("fail-link:") ? scenario.slice("fail-link:".length) : undefined;
  const gl = createFakeGl({ log, ...(failCompile ? { failCompile } : {}), ...(failLink ? { failLink } : {}), ...(input["info_log"] !== undefined ? { infoLog: input["info_log"] as string } : {}) });
  const want = c.text(row.expected);
  const logText = (): string => log.map((l) => l + "\n").join("");
  if (failCompile || failLink) {
    let got = "none", detail = "";
    try { impl.createGlResources(gl); } catch (e) { got = code(e); detail = (e as { detail?: string }).detail ?? ""; }
    if (got !== row.error) fail(`${row.id} createGlResources: got ${got} want ${row.error}`);
    eq(`${row.id} detail`, detail, input["expect_detail"]);
    eq(`${row.id} the log`, logText(), want);
    return;
  }
  const resources = impl.createGlResources(gl);
  if (scenario === "create") return eq(`${row.id} the creation log`, logText(), want);
  log.length = 0;
  if (scenario === "frame") impl.executePlan(gl, plan, resources, input["frame"]);
  else if (scenario === "dispose") { impl.deleteGlResources(gl, resources); impl.releaseGlContext(gl); }
  else fail(`${row.id}: unknown scenario ${scenario}`);
  eq(`${row.id} the ${scenario} log`, logText(), want);
}

// ---- P: the capability probe against a fake factory -------------------------------------------------------------------------------------------
function probeFake(spec: Json, log: string[]): () => unknown {
  let i = 0;
  const glOf = (g: Json | null | undefined): FakeGl | null | undefined => (g === null || g === undefined ? (g as null | undefined) : createFakeGl({
    log, vertexPrecision: g["vertexPrecision"], fragmentPrecision: g["fragmentPrecision"], maxVertexAttribs: g["maxVertexAttribs"], maxViewportDims: g["maxViewportDims"], extensions: g["extensions"],
  }));
  return () => {
    log.push(canon(["factory"]));
    const cv = (spec["canvases"] as Json[])[i++];
    if (cv === undefined) return undefined;
    const gl = glOf(cv["webgl2"]);
    const relaxed = cv["webgl2_relaxed"] === undefined ? undefined : glOf(cv["webgl2_relaxed"]);
    // a probe row's `throws` names the probe call that throws on this canvas's context
    const thrower = cv["throws"] as "getParameter" | "getShaderPrecisionFormat" | "getContext" | undefined;
    const real = gl && thrower && thrower !== "getContext" ? createFakeGl({ log, throws: thrower, vertexPrecision: cv["webgl2"]["vertexPrecision"], fragmentPrecision: cv["webgl2"]["fragmentPrecision"], maxVertexAttribs: cv["webgl2"]["maxVertexAttribs"], maxViewportDims: cv["webgl2"]["maxViewportDims"], extensions: cv["webgl2"]["extensions"] }) : gl;
    return createFakeCanvas({ log, webgl2: real ?? null, ...(relaxed !== undefined ? { webgl2Relaxed: relaxed } : {}), ctx2d: cv["2d"] === true ? true : null, oneContextType: cv["one_context_type"] === true, ...(thrower === "getContext" ? { throws: "getContext" as const } : {}) });
  };
}

async function probeRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const log: string[] = [];
  const fake = input["fake"] as Json;
  const factory = fake["factory"] === "not-a-function" ? ("not a function" as unknown) : probeFake(fake, log);
  const result = impl.probeWebgl(factory as never, input["need"], input["options"]);
  eq(`${row.id} probe result`, result, c.json(row.expected));
  eq(`${row.id} probe call log`, log.map((l) => l + "\n").join(""), c.text(input["expect_log"]));
}

// ---- U20-U49 (but U37): the context controller against a fake canvas that fires context events ----------------------------------------------------------
interface CtlStatus { phase: string; contextLost: boolean; failure?: string; attributes: unknown }
const statusLine = (s: CtlStatus): string => canon(["onStatus", s.phase, s.contextLost ? 1 : 0, s.failure ?? null]);
const errToken = (d: string | undefined): string => (d ?? "").split(":")[0]!;

/** A fake canvas, a fake GL and the callbacks of the controller vocabulary (7.6): every effect is logged into one list. */
function controllerRig(impl: GlImpl, log: string[], extra: Json = {}): { gl: FakeGl; opts: FakeGlOptions; canvas: FakeCanvas; ctl: ReturnType<GlImpl["createGlController"]> } {
  const opts: FakeGlOptions = { log };
  const gl = createFakeGl(opts);
  const canvas = createFakeCanvas({ log, webgl2: gl, logGetContext: extra["adapter"] !== undefined });
  const ctl = impl.createGlController(canvas, {
    onStatus: (s: CtlStatus) => log.push(statusLine(s)),
    onError: (e: { code: string; reason?: string; detail?: string }) => log.push(canon(["onError", `${e.code}/${e.reason ?? ""}`, errToken(e.detail)])),
    labels: { clear: () => log.push(canon(["labels.clear"])), draw: () => log.push(canon(["labels.draw"])) },
    ...(extra["controller"] as object | undefined),
  } as never);
  return { gl, opts, canvas, ctl };
}

async function controllerRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const log: string[] = [];
  const { gl, opts, canvas, ctl } = controllerRig(impl, log);
  const statuses: unknown[] = [];
  for (const ev of input["events"] as { op: string; fail?: string; plan?: string }[]) {
    delete opts.failCompile; delete opts.failLink; gl.loseAfterArrowVs = false;
    if (ev.fail === "compile") opts.failCompile = "disc.fs";
    else if (ev.fail === "link") opts.failLink = "edge";
    else if (ev.fail === "lost") gl.loseAfterArrowVs = true;
    switch (ev.op) {
      case "init":
        try { ctl.initialize(); } catch (e) { log.push(canon(["reject", code(e), errToken((e as { detail?: string }).detail)])); }
        break;
      case "L": gl.lost = true; canvas.fire("webglcontextlost"); break;
      case "R": gl.lost = false; canvas.fire("webglcontextrestored"); break;
      case "C": ctl.commit(impl.parseGlPlan(c.bytes(ev.plan!))); break;
      case "F": ctl.render(); break;
      case "D": ctl.dispose(); break;
      default: fail(`${row.id}: unknown event ${ev.op}`);
    }
    statuses.push(ctl.status());
  }
  eq(`${row.id} the controller log`, log.map((l) => l + "\n").join(""), c.text(input["expect_log"]));
  eq(`${row.id} the status() sequence`, statuses, input["expect_status"]);
}

/** U37: the adapter's initialize path: probe on scratch canvases, then the live canvas's own getContext with the same option, then the controller (7.7). */
async function adapterRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const log: string[] = [];
  const want = c.text(input["expect_log"]);
  const statuses: Json = {};
  for (const k of input["cases"] as { name: string; fake: Json; options?: Json }[]) {
    log.push(canon(["case", k.name]));
    const glOf = (g: Json | null | undefined): FakeGl | null | undefined => (g === null || g === undefined ? (g as null | undefined) : createFakeGl({
      log, vertexPrecision: g["vertexPrecision"], fragmentPrecision: g["fragmentPrecision"], maxVertexAttribs: g["maxVertexAttribs"], maxViewportDims: g["maxViewportDims"], extensions: g["extensions"],
    }));
    const adapter = k.fake["adapter"] as Json;
    const canvas = createFakeCanvas({ log, webgl2: glOf(adapter["webgl2"]) ?? null, ...(adapter["webgl2_relaxed"] !== undefined ? { webgl2Relaxed: glOf(adapter["webgl2_relaxed"]) } : {}), logGetContext: true });
    const ctl = impl.createGlController(canvas, {
      ...(k.options ? { contextAttributes: k.options } : {}),
      onStatus: (s: CtlStatus) => log.push(statusLine(s)),
      onError: (e: { code: string; reason?: string; detail?: string }) => log.push(canon(["onError", `${e.code}/${e.reason ?? ""}`, errToken(e.detail)])),
      labels: { clear: () => log.push(canon(["labels.clear"])), draw: () => log.push(canon(["labels.draw"])) },
      probe: { factory: probeFake(k.fake, log), need: { widthPx: 900, heightPx: 600 } },
    } as never);
    try { ctl.initialize(); } catch (e) { log.push(canon(["reject", code(e), errToken((e as { detail?: string }).detail)])); }
    log.push(canon(["status", ctl.status()]));
    statuses[k.name] = ctl.status();
  }
  eq("U37 the composite log", log.map((l) => l + "\n").join(""), want);
  eq("U37 the status() of every case", statuses, input["expect_status"]);
}

// ---- dispatch ------------------------------------------------------------------------------------------------------------------------------
export const FUNCTION_GROUPS = new Set(["G", "B", "H", "W", "X", "E", "P", "U"]);
/** The controller rows (U20-U36, U38-U49; no model, no renderer) are the U rows whose input is the inline `events` form (13.2): the form decides, never the id
 * range (an id range silently turned U40-U49 into rows that ran nothing). */
export const isControllerRow = (row: Row): boolean => Array.isArray(parseInput(row)["events"]);

export async function runRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  if (row.group === "U" && HEAVY.has(row.id)) return fail("heavy row: run through runHeavy");
  switch (row.group) {
    case "G": case "B": if (row.tier === "subject") return planBytesRow(impl, c, row); await planRow(impl, c, row); return runRendererRow(impl, c, row);
    case "H": return shaderRow(impl, c, row);
    case "W": return readerRow(impl, c, row);
    case "X": return readoutRow(impl, c, row);
    case "E": return execRow(impl, c, row);
    case "P": return probeRow(impl, c, row);
    case "U": if (row.id === "U37") return adapterRow(impl, c, row); if (isControllerRow(row)) return controllerRow(impl, c, row); return runRendererRow(impl, c, row);
    default: return fail(`row ${row.id}: no runner for group ${row.group}`);
  }
}

export { HEAVY, runHeavy };

/** Runs every row (or the ids given) of the function groups; never throws: failures are returned. */
export async function runAll(impl: GlImpl, c: Oracle, ids?: readonly string[]): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const row of c.rows) {
    if (!FUNCTION_GROUPS.has(row.group)) continue;
    if (ids ? !ids.includes(row.id) : HEAVY.has(row.id)) continue;
    try { await runRow(impl, c, row); out.push({ id: row.id, ok: true }); }
    catch (e) { out.push({ id: row.id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}
