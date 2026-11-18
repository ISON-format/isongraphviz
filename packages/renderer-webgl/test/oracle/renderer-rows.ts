// The renderer side of fixtures/oracles-gl (design 13.4): the `both` rows G and B against `renderer.planBytes()`, B08, the lifecycle scripts U01-U08, the
// manifests U06, the witness U09, the label stream U13 and the kit rows U10-U12 (heavy). Parameterized by the implementation under test (see runner.ts).
import { createHash } from "node:crypto";
import { verifyManifest } from "isongraph-visualize-renderer-core";
import type { ElementAddress, RenderModel, Renderer, SemanticState } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { code, eq, eqBytes, fail, modelAndState, parseInput, sha256, tokens, type Json, type Oracle, type Row } from "./corpus.js";
import type { GlImpl } from "./runner.js";

const cj = (v: unknown): Uint8Array => canonicalBytesSigned(v as CJValue);
const SIZE = { width: 900, height: 600 };
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const addr = (x: unknown): ElementAddress | undefined => (x === null || x === undefined ? undefined : (x as ElementAddress));

export interface WebglRendererLike extends Renderer {
  displayList(): unknown;
  plan(): ReturnType<GlImpl["planGl"]>;
  planBytes(): Uint8Array;
  textCalls(): Uint8Array;
  pick(point: { x: number; y: number }): ElementAddress | undefined;
  elementBounds(): unknown;
  status(): { phase: string; contextLost: boolean; failure?: string; attributes: unknown };
}

async function load(impl: GlImpl, model: RenderModel, state: SemanticState | undefined, options: unknown): Promise<WebglRendererLike> {
  const r = impl.createWebglRenderer(options as never) as unknown as WebglRendererLike;
  await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
  await r.loadScene(model, state);
  return r;
}

// ---- G, B: the renderer's plan -----------------------------------------------------------------------------------------------------------------
export async function planBytesRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const model = await c.model(row.scene, row.layout);
  type Case = { state?: string; expected: string; options?: Json; list?: Json; outcome?: string };
  const cases: Case[] = [
    { state: input["state"] as string, expected: row.expected, ...(input["options"] ? { options: input["options"] as Json } : {}), ...(input["list"] ? { list: input["list"] as Json } : {}), ...(input["outcome"] ? { outcome: input["outcome"] as string } : {}) },
    ...((input["also"] as Case[]) ?? []),
  ];
  for (const k of cases) {
    const { state } = await modelAndState(c, row, input, k.state);
    // a case with `list` is at the LIST/PLAN level (design rev 5: a renderer with a label budget of 0 is refused): the builder is called with the list option
    let plan: ReturnType<GlImpl["planGl"]>, bytes: Uint8Array;
    if (k.list !== undefined) { plan = impl.planGl(impl.dl.buildDisplayList(model, state, k.list as never)); bytes = impl.serializePlan(plan); }
    else {
      const r = await load(impl, model, state, k.options);
      plan = r.plan(); bytes = r.planBytes();
      await r.dispose();
    }
    eqBytes(`${row.id} planBytes ${k.expected}`, bytes, c.bytes(k.expected));
    if (k.outcome !== undefined) {
      // B08: the label options leave the buffers unchanged and change only `nt` and the text lines
      const want = c.json(k.outcome) as Json;
      const g01 = impl.parseGlPlan(c.bytes("plan/G01.glplan"));
      const same = (["edge", "disc", "arrow"] as const).every((p) => plan.buffers[p].length === g01.buffers[p].length && plan.buffers[p].every((x, i) => x === g01.buffers[p][i]));
      const got: Json = { buffers_equal_to_G01: same, nt: plan.header.nt, plan_bytes: bytes.length };
      if (k.list !== undefined) got["list"] = k.list; else got["options"] = k.options?.["dl"];
      eq(`${row.id} ${k.outcome}`, got, want);
    }
  }
}

// ---- U01-U08: lifecycle scripts ---------------------------------------------------------------------------------------------------------------
interface Call { op: string; arg?: any; expect: string; await?: boolean; expect_state?: string; expect_plan?: string; expect_fidelity?: unknown; expect_media_type?: string; expect_bytes_sha256?: string } // eslint-disable-line @typescript-eslint/no-explicit-any
interface Script { calls: Call[]; env: { host: string; reducedMotion: boolean; size: { width: number; height: number } }; listener: string; model: { scene: string; layout: string } }

async function runScript(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const script = c.json(row.input) as Script;
  const model = await c.model(script.model.scene, script.model.layout);
  let renderer = impl.createWebglRenderer() as unknown as WebglRendererLike;
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
        // a JSON `null` argument is "no argument" (a script cannot spell `undefined`)
        case "create": renderer = impl.createWebglRenderer(call.arg === null ? undefined : (tokens(call.arg) as never)) as unknown as WebglRendererLike; break;
        case "initialize": await r.initialize({ ...script.env, ...(call.arg ?? {}) } as never); break;
        case "loadScene": {
          const m = call.arg?.model ? await c.model(call.arg.model.scene, call.arg.model.layout) : model;
          const p = r.loadScene(m);
          if (call.await === false) { pending = p; p.catch(() => undefined); } else { await p; }
          break;
        }
        case "render": await r.render(); if (pending) { await pending; pending = undefined; } break;
        case "plan": result = r.plan(); break;
        case "planBytes": result = r.planBytes(); break;
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
    if (call.expect_plan !== undefined) eqBytes(`${where} planBytes`, result as Uint8Array, c.bytes(call.expect_plan));
    if (call.expect_state !== undefined) eq(`${where} state`, call.op === "dispatch" ? r.getState() : result, c.json(call.expect_state));
    if (call.expect_fidelity !== undefined) eq(`${where} fidelity`, (result as { fidelity: unknown }).fidelity, call.expect_fidelity);
    if (call.op === "export") {
      const ex = result as { media_type: string; bytes: Uint8Array };
      if (call.expect_media_type !== undefined) eq(`${where} media type`, ex.media_type, call.expect_media_type);
      if (call.expect_bytes_sha256 !== undefined) eq(`${where} bytes sha`, sha256(ex.bytes), call.expect_bytes_sha256);
    }
  }
  if (pending) await pending;
}

// ---- U06, U09, U13 ---------------------------------------------------------------------------------------------------------------------------
async function u06(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const cases = [{ host: input["host"] as "headless" | "dom", expected: row.expected }, ...((input["also"] as { host: "headless" | "dom"; expected: string }[]) ?? [])];
  const outcome = c.json(input["equal"]) as Record<string, { equal_to_glManifest: boolean; verifyManifest: string }>;
  for (const k of cases) {
    const m = impl.glManifest(k.host);
    eqBytes(`glManifest(${k.host}) bytes`, cj(m), c.bytes(k.expected));
    verifyManifest(m);
    // the composed renderer's own manifest equals glManifest(host) byte for byte (6.5); the dom host is the composition the ./dom adapter uses
    const own = impl.composeWebglRenderer(k.host).renderer.manifest;
    eq(`${row.id} ${k.host} outcome`, { equal_to_glManifest: sameBytes(cj(own), cj(m)), verifyManifest: (() => { try { verifyManifest(m); return "ok"; } catch { return "fail"; } })() }, outcome[k.host]);
  }
}

async function u09(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const cases = [{ plan: input["plan"] as string, expected: row.expected }, ...((input["also"] as { plan: string; expected: string }[]) ?? [])];
  for (const k of cases) eqBytes(`glWitness(${k.plan})`, cj(impl.glWitness(impl.parseGlPlan(c.bytes(k.plan)))), c.bytes(k.expected));
}

async function u13(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  const input = parseInput(row);
  const { model, state } = await modelAndState(c, row, { size: SIZE, state: "initial" });
  const r = await load(impl, model, state, undefined);
  const want = c.bytes(row.expected);
  eqBytes("U13 renderer.textCalls()", r.textCalls(), want);
  // the Canvas layer-8 stream of the same list (the real V7 label path is the same replay over the plan's label runs)
  const list = impl.dl.buildDisplayList(model, state);
  eqBytes("U13 the Canvas layer-8 stream of the list", impl.dl.recordCanvasCalls(list, { layers: input["layers"] }), want);
  eqBytes("U13 the replay of the plan's text source", impl.dl.recordCanvasCalls(impl.parseGlPlan(c.bytes(input["plan"])).textSource, { layers: input["layers"] }), want);
  await r.dispose();
}

// ---- heavy rows: the kit run over the IGR/1 corpus (U10, U11, U12) ------------------------------------------------------------------------------
export const HEAVY = new Set(["U10", "U11", "U12"]);

/** Removes the first layer-7 disc instance of a plan's bytes without listing it in `cn`: a double that lies (row U11), read with every reader rule disabled. */
function planLackingADisc(impl: GlImpl, bytes: Uint8Array): ReturnType<GlImpl["planGl"]> {
  const plan = impl.readGlPlan(bytes, { lenient: true });
  const disc = plan.buffers.disc;
  const cut = new Uint8Array(disc.length - 16);
  cut.set(disc.subarray(0, 16 * 0));
  cut.set(disc.subarray(16));
  const draws = plan.header.draws.map((d) => (d.layer === 7 ? { ...d, count: d.count - 1 } : d)).filter((d) => d.count > 0);
  return { ...plan, header: { ...plan.header, draws, sizes: { ...plan.header.sizes, disc: cut.length } }, buffers: { ...plan.buffers, disc: cut } };
}

export async function runHeavy(impl: GlImpl, c: Oracle, row: Row, igrCorpusDir: string): Promise<void> {
  const { runConformance } = await import("isongraph-visualize-renderer-core");
  const { loadCorpus } = await import("isongraph-visualize-renderer-core/conformance/node");
  const corpus = await loadCorpus(igrCorpusDir);
  if (row.id === "U10") {
    const rep = await runConformance(impl.createWebglSubject() as never, corpus, { seeds: [1] });
    if (rep.verdict === "fail") fail(`kit verdict fail: ${JSON.stringify(rep.results.filter((r) => r.verdict === "fail").slice(0, 4))}`);
    eq("U10 level", rep.level, 2);
    eq("U10 claimable", rep.claimable, false);
    return;
  }
  if (row.id === "U11") {
    const want = c.json(row.expected) as { honest_plan_W01: string; plan_lacking_a_disc_W01: string; probe_drawn_nodes: number; witness_nodes_of_the_double: number };
    const honest = impl.createWebglSubject();
    const double = {
      ...honest,
      create: async (env: unknown) => {
        const r = (await honest.create(env as never)) as unknown as WebglRendererLike;
        const honestPlan = r.plan.bind(r);
        r.plan = () => planLackingADisc(impl, impl.serializePlan(honestPlan()));
        return r as unknown as Renderer;
      },
    };
    const verdict = async (subject: unknown): Promise<string | undefined> => (await runConformance(subject as never, corpus, { seeds: [1] })).results.find((r) => r.id === "W01")?.verdict;
    eq("U11 honest W01", (await verdict(honest)) === "pass" ? "pass" : "fail", want.honest_plan_W01);
    eq("U11 the double's W01", (await verdict(double)) === "pass" ? "pass" : "fail", want.plan_lacking_a_disc_W01);
    const model = await c.model(row.scene, row.layout);
    const b = (await double.create({} as never)) as unknown as WebglRendererLike;
    await b.initialize({ host: "headless", size: SIZE, reducedMotion: false });
    await b.loadScene(model);
    eq("U11 probe() still draws both nodes", b.probe().drawn.nodes.length, want.probe_drawn_nodes);
    const w = (await double.witness!(b as unknown as Renderer)) as { elements: { nodes: unknown[] } };
    eq("U11 the witness of the double sees fewer nodes", w.elements.nodes.length, want.witness_nodes_of_the_double);
    return;
  }
  if (row.id === "U12") {
    const input = parseInput(row);
    const want = c.json(row.expected) as { "CHK-CAP": string; capacity: unknown; "labels.edge": unknown; name: string; verifyManifest: string };
    const subject = impl.createWebglSubject(input["options"]);
    const rep = await runConformance(subject as never, corpus, { only: input["only"], seeds: [1] });
    eq("U12 CHK-CAP", rep.results.some((r) => r.check === "CHK-CAP" && r.verdict === "fail") ? "fail" : "pass", want["CHK-CAP"]);
    const model = await c.model(row.scene, row.layout);
    const r = (await subject.create({ host: "headless" } as never)) as unknown as WebglRendererLike;
    await r.initialize({ host: "headless", size: SIZE, reducedMotion: false });
    await r.loadScene(model);
    eqBytes("U12 manifest bytes equal", cj(subject.manifest), cj(r.manifest));
    verifyManifest(r.manifest);
    eq("U12 capacity", r.manifest.capacity, want.capacity);
    eq("U12 labels.edge", (r.manifest.capabilities as Record<string, unknown>)["labels.edge"], want["labels.edge"]);
    eq("U12 name", r.manifest.renderer.name, want.name);
    return;
  }
}

// ---- dispatch ------------------------------------------------------------------------------------------------------------------------------
export async function runRendererRow(impl: GlImpl, c: Oracle, row: Row): Promise<void> {
  if (row.group === "G" || row.group === "B") {
    if (row.tier === "both" || row.id === "B08") return planBytesRow(impl, c, row);
    return;
  }
  if (row.group !== "U") return;
  if (HEAVY.has(row.id)) return;
  switch (row.id) {
    case "U06": return u06(impl, c, row);
    case "U09": return u09(impl, c, row);
    case "U13": return u13(impl, c, row);
    case "U01": case "U02": case "U03": case "U04": case "U05": case "U07": case "U08": return runScript(impl, c, row);
    default: return;
  }
}

void createHash; void addr;
