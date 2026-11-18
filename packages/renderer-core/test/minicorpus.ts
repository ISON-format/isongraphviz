// A SELF-GENERATED mini corpus in the formats of design 13.3a, used to test the kit machinery and the mutation matrix.
// Expected bytes here are computed by renderer-core itself, so this corpus proves that the KIT detects deviations of a subject from the
// reference; it is NOT an oracle (the independent oracle is fixtures/oracles-igr, written by a separate agent).
import { createHash } from "node:crypto";
import { verifyScene } from "isongraph-visualize-scene-core";
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { announcementFor, buildAccessibleModel, graphSummary } from "../src/a11y.js";
import { errName } from "../src/conformance/run.js";
import type { Corpus, ExpectRow } from "../src/conformance/corpus.js";
import { hitTest } from "../src/hit.js";
import { verifyManifest } from "../src/manifest.js";
import { buildRenderModel, modelBytes } from "../src/model.js";
import { reduce, serializeEvents } from "../src/reduce.js";
import { buildReport, compareProjections } from "../src/report.js";
import { initialState, serializeState } from "../src/state.js";
import type { RenderLimits, RenderModel, SemanticEvent, SemanticState } from "../src/types.js";
import { enc, handScene, igl, o1Scene, o4Scene, type HandEdge, type HandNode } from "./helpers.js";

type Step = { intent: unknown };
const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };
const E0 = { ord: "0", rel: "KNOWS", src: I1, tgt: ANN };
export const O1_NODE = (n: unknown) => ({ node: n }), O1_EDGE = (e: unknown) => ({ edge: e });

class Builder {
  files = new Map<string, Uint8Array>();
  rows: ExpectRow[] = [];
  private models = new Map<string, RenderModel>();
  put(path: string, bytes: Uint8Array): void { this.files.set(path, bytes); }
  /** Script files write the non-finite doubles as the corpus-reader tokens "NaN", "Infinity", "-Infinity" (design 13.3a). */
  json(path: string, v: unknown): void { this.put(path, enc(JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x)))); }
  async model(scene: string, layout: string, limits?: Partial<RenderLimits>): Promise<RenderModel> {
    const key = scene + layout + JSON.stringify(limits ?? {});
    let m = this.models.get(key);
    if (!m) { m = await buildRenderModel(this.files.get(scene)!, this.files.get(layout)!, { limits: limits ?? {} }); this.models.set(key, m); }
    return m;
  }
  row(r: Partial<ExpectRow> & { id: string }): void { this.rows.push({ group: r.id[0]!, tier: "", scene: "", layout: "", input: "", expected: "", error: "", ...r }); }

  async scene(name: string, scene: Uint8Array, positions: Record<string, [number, number]> | undefined, layoutBytes?: Uint8Array): Promise<void> {
    this.put(`scenes/${name}.scene.json`, scene);
    if (layoutBytes) { this.put(`layouts/${name}.layout.json`, layoutBytes); return; }
    const sc = (await verifyScene(scene)).scene;
    const lay = await computeFixedLayout(scene, sc.nodes.map((n, k) => ({ ref: n.ref, x: positions?.[n.ref.id.replace(/^s:/, "")]?.[0] ?? 10 * k, y: positions?.[n.ref.id.replace(/^s:/, "")]?.[1] ?? 0 })));
    this.put(`layouts/${name}.layout.json`, lay.layoutBytes);
  }
  async hand(name: string, nodes: HandNode[], edges: HandEdge[], positions?: Record<string, [number, number]>, directed = true): Promise<void> {
    await this.scene(name, await handScene(nodes, edges, directed), positions);
  }

  /** An R-style script: steps run through the reference reducer to produce the expected files. */
  async script(id: string, tier: string, name: string, steps: Step[], opts: { size?: { width: number; height: number }; reducedMotion?: boolean; initial?: SemanticState; limits?: Partial<RenderLimits>; dir?: string; expectedKind?: "state" | "a11y" | "events" } = {}): Promise<void> {
    const size = opts.size ?? { width: 900, height: 600 };
    const m = await this.model(`scenes/${name}.scene.json`, `layouts/${name}.layout.json`, opts.limits);
    let state = opts.initial ?? initialState(m, size);
    const out: Record<string, unknown>[] = [];
    let last = [] as ReturnType<typeof reduce>["events"];
    steps.forEach((s, k) => {
      try {
        const r = reduce(m, state, s.intent, opts.limits);
        const sp = `states/${id}.s${k + 1}.state.json`, ep = `events/${id}.s${k + 1}.events.json`;
        this.put(sp, serializeState(m, r.state)); this.put(ep, serializeEvents(r.events));
        out.push({ intent: s.intent, expected_state: sp, expected_events: ep });
        state = r.state; last = r.events;
      } catch (e) { out.push({ intent: s.intent, error: errName(e) }); last = []; }
    });
    const script: Record<string, unknown> = { size, steps: out };
    if (opts.limits) script["limits"] = opts.limits;
    if (opts.reducedMotion) script["reducedMotion"] = true;
    if (opts.initial) { this.put(`states/${id}.initial.state.json`, serializeState(m, opts.initial)); script["initial"] = `states/${id}.initial.state.json`; }
    this.json(`scripts/${id}.script.json`, script);
    const kind = opts.expectedKind ?? (id[0] === "A" ? "a11y" : "state");
    let expected: string;
    if (kind === "a11y") {
      expected = `a11y/${id}.a11y.json`;
      const announcements = last.map((e) => announcementFor(e, m, state)).filter((a): a is string => a !== undefined);
      this.put(expected, canonicalBytesSigned({ accessible: buildAccessibleModel(m, state), announcements, summary: graphSummary(m) } as unknown as CJValue));
    } else if (kind === "events") { expected = `events/${id}.events.json`; this.put(expected, serializeEvents(last)); }
    else { expected = `states/${id}.state.json`; this.put(expected, serializeState(m, state)); }
    this.row({ id, tier, scene: `scenes/${name}.scene.json`, layout: `layouts/${name}.layout.json`, input: `scripts/${id}.script.json`, expected });
  }

  async hits(id: string, tier: string, name: string, state: "initial" | SemanticState, points: [number | string, number | string][], size = { width: 900, height: 600 }): Promise<void> {
    const m = await this.model(`scenes/${name}.scene.json`, `layouts/${name}.layout.json`);
    const st = state === "initial" ? initialState(m, size) : state;
    let statePath: string = "initial";
    if (state !== "initial") { statePath = `states/${id}.state.json`; this.put(statePath, serializeState(m, state)); }
    const pts = points.map(([x, y]) => {
      const num = (v: number | string) => (typeof v === "string" ? ({ NaN, Infinity, "-Infinity": -Infinity } as Record<string, number>)[v]! : v);
      try { const h = hitTest(m, st, { x: num(x), y: num(y) }); return h ? { x, y, hit: h } : { x, y }; } catch (e) { return { x, y, error: errName(e) }; }
    });
    this.json(`hits/${id}.hits.json`, { size, state: statePath, points: pts });
    this.row({ id, tier, scene: `scenes/${name}.scene.json`, layout: `layouts/${name}.layout.json`, input: `hits/${id}.hits.json` });
  }

  async build(): Promise<Corpus> {
    const sumLines = [...this.files.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, b]) => `${createHash("sha256").update(b).digest("hex")}  ${p}`);
    return { files: new Map(this.files), expect: this.rows, sums: enc(sumLines.join("\n") + "\n") };
  }
}

const cats = (n: number): HandNode[] => Array.from({ length: n }, (_, i) => { const c = String.fromCharCode(97 + i); return { id: "s:" + c, type: c, category: c, label: c }; });

export async function buildMiniCorpus(): Promise<{ corpus: Corpus; builder: Builder }> {
  const b = new Builder();
  // scenes
  await b.scene("o1", o1Scene(), undefined, igl("layouts/F01.layout.json"));
  await b.scene("o4", o4Scene(), undefined, igl("layouts/F02.layout.json"));
  await b.scene("mixed20", igl("scenes/mixed20.scene.json"), undefined, igl("layouts/F04.layout.json"));
  await b.scene("empty", igl("scenes/empty.scene.json"), undefined, igl("layouts/F07.layout.json"));
  await b.hand("two", [{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b" }], { a: [0, 0], b: [20, 0] });
  await b.hand("wide", [{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b" }], { a: [-1000, 0], b: [1000, 0] });
  await b.hand("far", [{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b" }], { a: [-100, 0], b: [100, 0] });
  await b.hand("solo", [{ id: "s:a", label: "a" }], [], { a: [0, 0] });
  await b.hand("cats10", cats(10), []);
  await b.hand("cats9", cats(9), []);
  await b.hand("plural", [{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b", rel: "X" }]);
  await b.hand("text", [{ id: "s:\u00e9", label: "" }, { id: "s:e\u0301", label: "" }, { id: "s:  padded  ", label: "" }, { id: "s:<b>x</b>", label: "" }, { id: "s:", label: "" }], [{ src: "s:\u00e9", tgt: "s:", rel: "R" }]);
  const wideCentred = { width: 900, height: 600 };
  void wideCentred;

  // M: models (core)
  const o1m = await b.model("scenes/o1.scene.json", "layouts/o1.layout.json");
  b.put("models/M01.model.json", modelBytes(o1m));
  b.row({ id: "M01", tier: "core", scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", expected: "models/M01.model.json" });
  const em = await b.model("scenes/empty.scene.json", "layouts/empty.layout.json");
  b.put("models/M03.model.json", modelBytes(em));
  b.row({ id: "M03", tier: "core", scene: "scenes/empty.scene.json", layout: "layouts/empty.layout.json", expected: "models/M03.model.json" });
  b.put("layouts/bind-b.layout.json", igl("layouts/F12.layout.json")); b.put("scenes/bind-a.scene.json", igl("scenes/bind-a.scene.json"));
  b.row({ id: "M11", tier: "core", scene: "scenes/bind-a.scene.json", layout: "layouts/bind-b.layout.json", error: "LAYOUT:SCENE_MISMATCH/" });
  b.row({ id: "M15", tier: "core", scene: "scenes/mixed20.scene.json", layout: "layouts/mixed20.layout.json", input: '{"limits":{"maxNodes":19}}', error: "RESOURCE_LIMIT/NODE_LIMIT" });
  b.row({ id: "M14", tier: "core", scene: "scenes/mixed20.scene.json", layout: "layouts/mixed20.layout.json", input: '{"limits":{"maxNodes":20}}', expected: "models/M06.model.json" });
  b.put("models/M06.model.json", modelBytes(await b.model("scenes/mixed20.scene.json", "layouts/mixed20.layout.json")));
  b.row({ id: "M25", tier: "core", scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", input: '{"plain_object_model":true}', error: "INVALID_INPUT/NOT_A_RENDER_MODEL" });

  // S: states
  const s0 = initialState(o1m, { width: 900, height: 600 });
  b.put("states/S01.state.json", serializeState(o1m, s0));
  b.row({ id: "S01", tier: "both", scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", input: '{"initial":{"width":900,"height":600}}', expected: "states/S01.state.json" });
  const s03: SemanticState = { ...s0, selection: { nodes: [I1], edges: [E0] }, focus: { node: ANN } };
  b.put("states/S03.state.json", serializeState(o1m, s03));
  b.row({ id: "S03", tier: "both", scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", input: "states/S03.state.json" });
  const reject = (id: string, tier: string, value: unknown, error: string, raw?: string) => {
    b.put(`states/${id}.state.json`, enc(raw ?? JSON.stringify(value)));
    b.row({ id, tier, scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", input: `states/${id}.state.json`, error });
  };
  const withSel = (nodes: unknown[]) => ({ ...s03, selection: { nodes, edges: [] } });
  const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
  reject("S12", "core", null, "INVALID_STATE/NON_CANONICAL", JSON.stringify({ igr: "IGR/1", ...JSON.parse(new TextDecoder().decode(serializeState(o1m, s03))) }));
  reject("S15", "both", sorted(withSel([ANN, I1])), "INVALID_STATE/NON_CANONICAL");
  reject("S16", "both", sorted(withSel([I1, I1])), "INVALID_STATE/DUPLICATE_ELEMENT");
  reject("S17", "both", sorted(withSel([ANN, I1, ANN])), "INVALID_STATE/DUPLICATE_ELEMENT");
  reject("S18", "both", sorted(withSel([{ id: "i:9", type: "person" }])), "INVALID_STATE/UNRESOLVED_ELEMENT");
  reject("S20", "both", sorted({ ...s03, scene_sha256: "0".repeat(64) }), "INVALID_STATE/SCENE_MISMATCH");
  b.put("scenes/bind-a2.scene.json", igl("scenes/bind-a.scene.json")); b.put("layouts/bind-a2.layout.json", igl("layouts/F11.layout.json"));
  const ba = await b.model("scenes/bind-a2.scene.json", "layouts/bind-a2.layout.json");
  const foreign = serializeState(ba, { ...initialState(ba, { width: 900, height: 600 }), selection: { nodes: [ba.nodes[0]!.ref], edges: [] } });
  b.put("states/S22.state.json", foreign);
  b.row({ id: "S22", tier: "both", scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", input: "states/S22.state.json", error: "INVALID_STATE/SCENE_MISMATCH" });
  reject("S23", "both", sorted({ ...s03, hidden: { nodes: [I1], edges: [] } }), "INVALID_STATE/SELECTED_HIDDEN");
  reject("S25", "both", sorted({ ...s03, viewport: { ...s03.viewport, zoom: 0 } }), "INVALID_STATE/INVALID_VIEWPORT");
  reject("S33", "both", sorted({ ...s03, bogus: 1 }), "INVALID_STATE/UNKNOWN_FIELD");
  reject("S36", "both", sorted({ ...s03, igr: "IGR/2" }), "INVALID_STATE/UNSUPPORTED_VERSION");
  reject("S39", "both", sorted({ ...s03, focus: null }), "INVALID_STATE/SCHEMA");
  b.put("states/S41.state.json", serializeState(o1m, s03));
  b.row({ id: "S41", tier: "core", scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", input: `{"file":"states/S41.state.json","limits":{"maxStateBytes":${serializeState(o1m, s03).length - 1}}}`, error: "RESOURCE_LIMIT/BYTES_LIMIT" });

  // R: reducer scripts
  const sel = (mode: string, ...targets: unknown[]) => ({ intent: { type: "select", mode, targets } });
  const n = O1_NODE, e = O1_EDGE;
  await b.script("R01", "both", "o1", [sel("replace", n(ANN), n(I1))]);
  await b.script("R02", "both", "o1", [sel("add", n(I1)), sel("add", e(E0)), sel("add", n(ANN))]);
  await b.script("R03", "both", "o1", [sel("replace", n(I1)), sel("toggle", n(I1)), sel("toggle", n(ANN), e(E0))]);
  await b.script("R04", "both", "o1", [{ intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }, sel("remove", n(ANN)), sel("remove", n({ id: "i:9", type: "person" }))]);
  await b.script("R07", "both", "o1", [sel("replace", n(I1), n({ id: "i:9", type: "person" }))]);
  await b.script("R08", "both", "o1", [{ intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }, sel("add", n(ANN)), sel("add", e(E0))]);
  await b.script("R10", "both", "o1", [sel("replace", n(ANN), e(E0), n(I1)), { intent: { type: "focus", target: e(E0) } }, { intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }]);
  await b.script("R11", "both", "o1", [sel("replace", n(ANN), n(I1)), { intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }, { intent: { type: "set-hidden", targets: [n(ANN)], hidden: false } }]);
  await b.script("R12", "both", "o1", [{ intent: { type: "set-hidden", targets: [e(E0)], hidden: true } }, { intent: { type: "set-hidden", targets: [e(E0)], hidden: true } }]);
  await b.script("R13", "both", "o1", [{ intent: { type: "focus", target: n(I1) } }, { intent: { type: "set-hidden", targets: [n(I1)], hidden: true } }]);
  await b.script("R14", "both", "o1", [1, 1, 1, 1, 1].map(() => ({ intent: { type: "focus-step", delta: 1 } })));
  await b.script("R15", "both", "o1", [{ intent: { type: "focus-last" } }, { intent: { type: "focus-step", delta: 1 } }, { intent: { type: "focus-first" } }, { intent: { type: "focus-step", delta: -1 } }]);
  await b.script("R16", "both", "o1", [{ intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }, { intent: { type: "focus-step", delta: 1 } }, { intent: { type: "focus-step", delta: 1 } }, { intent: { type: "focus", target: n(ANN) } }]);
  await b.script("R18", "both", "o1", [{ intent: { type: "focus-step", delta: -1 } }]);
  await b.script("R19", "both", "o1", [{ intent: { type: "focus", target: n(ANN) } }, { intent: { type: "focus" } }]);
  const a2 = s0;
  await b.script("R20", "both", "o1", [{ intent: { type: "pan", dx: 10, dy: 0 } }, { intent: { type: "pan", dx: -7, dy: 3 } }]);
  await b.script("R20b", "both", "o1", [{ intent: { type: "set-viewport", center_x: 100000, center_y: 100000, zoom: 128 } }, { intent: { type: "pan", dx: 1, dy: 1 } }, { intent: { type: "pan", dx: -1, dy: -1 } }]);
  await b.script("R21", "both", "o1", [{ intent: { type: "zoom", factor_milli: 2000 } }, { intent: { type: "zoom", factor_milli: 1_000_000 } }, { intent: { type: "zoom", factor_milli: 1 } }]);
  await b.script("R22", "both", "o1", [{ intent: { type: "zoom", factor_milli: 2000, anchor: { x: 0, y: 300 } } }, { intent: { type: "zoom", factor_milli: 777, anchor: { x: -300, y: 1000 } } }]);
  await b.script("R24", "both", "o1", [{ intent: { type: "pan", dx: 50, dy: -20 } }, { intent: { type: "fit", padding: 32 } }, { intent: { type: "zoom", factor_milli: 3000 } }, { intent: { type: "fit" } }, { intent: { type: "fit", padding: 200 } }]);
  await b.script("R26", "both", "o1", [{ intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }, { intent: { type: "fit" } }]);
  await b.script("R29", "both", "o1", [{ intent: { type: "resize", width: 1000, height: 50 } }, { intent: { type: "resize", width: 0, height: 5 } }]);
  await b.script("R34", "both", "o1", [{ intent: { type: "pan", dx: NaN, dy: 0 } }, { intent: { type: "pan", dx: 1.5, dy: 0 } }, { intent: { type: "pan", dx: "1", dy: 0 } }, { intent: { type: "bogus" } }, { intent: { type: "fit", extra: 1 } }]);
  await b.script("R36", "both", "o1", [{ intent: { type: "set-viewport", center_x: 0, center_y: 0, zoom: 10 } }, { intent: { type: "zoom", factor_milli: 1040 } }]);
  await b.script("R37", "both", "o1", [{ intent: { type: "focus-endpoint" } }, { intent: { type: "focus-incident" } }]);
  await b.script("R40", "both", "o1", [sel("add", n(I1), n(ANN))], { limits: { maxIntentTargets: 1 } });
  await b.script("R41", "both", "mixed20", [{ intent: { type: "select", mode: "replace", targets: [...(await b.model("scenes/mixed20.scene.json", "layouts/mixed20.layout.json")).nodes.map((x) => n(x.ref)), ...(await b.model("scenes/mixed20.scene.json", "layouts/mixed20.layout.json")).edges.map((x) => e(x.ref))] } }]);
  void a2;

  // H: hit tests on hand-made geometry (one pixel per layout unit; node a at (440,300)/(450,300) depending on the centre)
  const view = (name: string, cx: number, cy: number, zoom = 1000): Promise<SemanticState> => b.model(`scenes/${name}.scene.json`, `layouts/${name}.layout.json`).then((m) => ({ ...initialState(m, { width: 900, height: 600 }), viewport: { center_x: cx * 1000, center_y: cy * 1000, width: 900, height: 600, zoom } }));
  await b.hits("H01", "both", "o1", "initial", [[32.0, 193.5], [500, 308], [500, 300], [867.928, 406.4]]);
  await b.hits("H02", "both", "solo", await view("solo", 0, 0), [[450, 300], [462, 300], [462 + 2 ** -11, 300], [462 + 2 ** -10, 300], [438 - 2 ** -11, 300], [438 - 2 ** -10, 300], [450, 312], [450, 288 - 2 ** -10]]);
  await b.hits("H06", "both", "two", await view("two", 10, 0), [[452, 300], [448, 300], [450, 300], [443, 303]]);
  await b.hits("H09", "both", "wide", await view("wide", 0, 0), [[450, 303], [450, 307], [450, 306], [450, 306 + 2 ** -11], [450, 306 + 2 ** -10], [450, 294], [450, 294 - 2 ** -10]]);
  await b.hits("H13", "both", "far", await (async () => { const m = await b.model("scenes/far.scene.json", "layouts/far.layout.json"); return { ...(await view("far", 0, 0)), hidden: { nodes: [m.nodes[1]!.ref], edges: [] } }; })(), [[350, 303], [450, 300], [550, 300]]);
  await b.hits("H17", "both", "solo", await view("solo", 450, 0), [[0, 300], [-0.5, 300], [0, 300 - 12], [0, 300 - 12 - 2 ** -10]]);
  await b.hits("H17b", "both", "solo", await view("solo", -450, 0), [[900, 300], [900.5, 300]]);
  await b.hits("H26", "both", "solo", await view("solo", 450, 0), [[-(2 ** -11), 300], [-(2 ** -10), 300]]);
  await b.hits("H26b", "both", "solo", await view("solo", -450, 0), [[900 + 2 ** -11, 300], [900 + 2 ** -10, 300]]);
  await b.hits("H18", "both", "o1", "initial", [["NaN", 0], [0, "Infinity"], [2 ** 40, 0], [10, 10]]);

  // A: accessible data
  await b.script("A01", "both", "o1", [sel("replace", e(E0), n(I1)), { intent: { type: "focus", target: n(I1) } }]);
  await b.script("A04", "both", "empty", []);
  await b.script("A05", "both", "plural", []);
  await b.script("A05b", "both", "solo", []);
  await b.script("A06", "both", "cats10", []);
  await b.script("A06b", "both", "cats9", []);
  await b.script("A07", "both", "text", []);
  await b.script("A10", "both", "mixed20", [{ intent: { type: "focus", target: n((await b.model("scenes/mixed20.scene.json", "layouts/mixed20.layout.json")).nodes[2]!.ref) } }]);
  await b.script("A11", "both", "o1", [{ intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }]);
  await b.script("A12", "both", "o1", [sel("replace", e(E0)), { intent: { type: "focus", target: e(E0) } }, { intent: { type: "set-hidden", targets: [n(I1)], hidden: true } }]);
  await b.script("A15", "both", "o1", [sel("replace", n(I1), n(ANN)), { intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }]);
  await b.script("A16", "both", "o1", [{ intent: { type: "pan", dx: 3, dy: 3 } }], { reducedMotion: true });
  await b.script("A19", "both", "o1", [{ intent: { type: "focus-first" } }, { intent: { type: "focus-step", delta: -1 } }]);
  await b.script("A18", "both", "o1", [sel("replace", n(I1)), { intent: { type: "focus-step", delta: 1 } }], { expectedKind: "events" });

  // P: manifests
  const man = (host: "dom" | "headless", f: (c: Record<string, unknown>) => void = () => undefined) => {
    const caps: Record<string, unknown> = Object.fromEntries(["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "a11y.model", "state.report", "lifecycle", "export.scene"].map((k) => [k, { status: "supported" }]));
    for (const k of ["labels", "direction-cue", "indicators.non-color"]) caps[k] = host === "headless" ? { status: "unsupported", reason: "HOST_LACKS" } : { status: "supported" };
    for (const k of ["export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge", "motion.animated"]) caps[k] = { status: "unsupported", reason: "NOT_IMPLEMENTED" };
    caps["scene.apply-delta"] = { status: "unsupported", reason: "RESERVED" };
    f(caps);
    return { igr: "IGR/1", renderer: { name: "m", version: "1", host }, capabilities: caps, capacity: { maxNodes: 10, maxEdges: 10, maxDrawnLabelUnits: 10 } };
  };
  const pm = (id: string, m: unknown) => { b.json(`manifests/${id}.manifest.json`, m); let err = ""; try { verifyManifest(m); } catch (x) { err = errName(x); } b.row({ id, tier: "core", input: `manifests/${id}.manifest.json`, error: err }); };
  pm("P01", man("headless")); pm("P02", man("dom", (c) => { c["labels"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }));
  pm("P05", man("dom", (c) => { delete c["viewport"]; })); pm("P09", man("dom", (c) => { c["scene.apply-delta"] = { status: "supported" }; }));
  pm("P15", man("dom", (c) => { c["labels"] = { status: "unsupported", reason: "HOST_LACKS" }; })); pm("P20", man("dom", (c) => { c["export.png"] = { status: "unsupported", reason: "RESERVED" }; }));

  // L: lifecycle scripts (design 13.3a schema; expectations written from design section 9, events and states from the reference reducer)
  const model = { scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json" };
  const lenv = { host: "headless", size: { width: 900, height: 600 }, reducedMotion: false };
  const L = (id: string, calls: unknown[], listener = "record", extra: Record<string, unknown> = {}, env: unknown = lenv) => { b.json(`lifecycle/${id}.script.json`, { model, env, listener, calls, ...extra }); b.row({ id, tier: "subject", input: `lifecycle/${id}.script.json` }); };
  /** A lifecycle script that dispatches through the reference reducer and records what the listener must see. */
  const life = (id: string, listener: "record" | "throw" | "dispatch-inside") => {
    let state = initialState(o1m, { width: 900, height: 600 });
    const all: SemanticEvent[] = [];
    const calls: unknown[] = [{ op: "initialize" }, { op: "loadScene" }];
    let k = 0;
    return {
      dispatch(intent: unknown) {
        k++;
        const r = reduce(o1m, state, intent); state = r.state; all.push(...r.events);
        b.put(`states/${id}.d${k}.state.json`, serializeState(o1m, r.state)); b.put(`events/${id}.d${k}.events.json`, serializeEvents(r.events));
        calls.push({ op: "dispatch", arg: intent, expect_state: `states/${id}.d${k}.state.json`, expect_events: `events/${id}.d${k}.events.json` });
      },
      done() {
        const extra: Record<string, unknown> = {};
        if (listener === "record") { b.put(`events/${id}.recorded.events.json`, serializeEvents(all)); extra["expect_recorded_events"] = `events/${id}.recorded.events.json`; }
        if (listener === "throw") extra["expect_on_error_count"] = all.length;
        if (listener === "dispatch-inside") extra["expect_listener_errors"] = all.map(() => "INVALID_LIFECYCLE/REENTRANT");
        L(id, calls, listener, extra);
      },
    };
  };
  const ok = { op: "initialize" };
  const sel1 = { type: "select", mode: "replace", targets: [O1_NODE(I1)] };
  b.put("states/L16.initial.state.json", serializeState(o1m, s0));
  L("L01", [ok, { op: "loadScene" }, { op: "dispatch", arg: sel1 }, { op: "hitTest", arg: { x: 32, y: 193.5 }, expect_hit: O1_NODE(I1) }, { op: "render" }, { op: "probe", expect_motion: "none" }, { op: "export", arg: "scene", expect_bytes: "scenes/o1.scene.json", expect_media_type: "application/octet-stream" }, { op: "dispose" }]);
  L("L02", [{ op: "dispatch", arg: { type: "fit" }, expect: "INVALID_LIFECYCLE/NOT_INITIALIZED" }, { op: "loadScene", expect: "INVALID_LIFECYCLE/NOT_INITIALIZED" }, { op: "render", expect: "INVALID_LIFECYCLE/NOT_INITIALIZED" }]);
  L("L03", [ok, { op: "render", expect: "INVALID_LIFECYCLE/NOT_LOADED" }, { op: "probe", expect: "INVALID_LIFECYCLE/NOT_LOADED" }]);
  L("L04", [ok, { op: "initialize", expect: "INVALID_LIFECYCLE/ALREADY_INITIALIZED" }]);
  L("L05", [{ op: "dispose" }, { op: "dispose" }, { op: "initialize", expect: "INVALID_LIFECYCLE/DISPOSED" }]);
  L("L06", [ok, { op: "loadScene" }, { op: "dispose" }, { op: "dispatch", arg: { type: "fit" }, expect: "INVALID_LIFECYCLE/DISPOSED" }, { op: "getState", expect: "INVALID_LIFECYCLE/DISPOSED" }, { op: "render", expect: "INVALID_LIFECYCLE/DISPOSED" }, { op: "initialize", expect: "INVALID_LIFECYCLE/DISPOSED" }, { op: "setReducedMotion", arg: true, expect: "INVALID_LIFECYCLE/DISPOSED" }]);
  L("L07", [ok, { op: "loadScene" }, { op: "dispatch", arg: sel1 }, { op: "loadScene", expect: "ok" }, { op: "getState", expect_state: "states/L16.initial.state.json" }]);
  L("L08", [ok, { op: "loadScene" }, { op: "dispatch", arg: { type: "select", mode: "replace", targets: [O1_NODE(ANN)] } }, { op: "loadScene", arg: { initial: "states/S33.state.json" }, expect: "INVALID_STATE/UNKNOWN_FIELD" }, { op: "dispatch", arg: { type: "select", mode: "add", targets: [O1_NODE(I1)] } }]);
  L("L09", [ok, { op: "loadScene", arg: { plain_object_model: true }, expect: "INVALID_INPUT/NOT_A_RENDER_MODEL" }]);
  L("L10", [ok, { op: "loadScene", arg: { initial: "states/S22.state.json" }, expect: "INVALID_STATE/SCENE_MISMATCH" }]);
  L("L11", [ok, { op: "loadScene" }, { op: "applySceneDelta", arg: {}, expect: "UNSUPPORTED_CAPABILITY/RESERVED" }]);
  L("L12", [{ op: "applySceneDelta", arg: {}, expect: "UNSUPPORTED_CAPABILITY/RESERVED" }]);
  L("L13", [ok, { op: "dispose" }, { op: "applySceneDelta", arg: {}, expect: "INVALID_LIFECYCLE/DISPOSED" }]);
  L("L14", [ok, { op: "loadScene" }, { op: "export", arg: "@first-undeclared-export-format", expect: "UNSUPPORTED_CAPABILITY/NOT_SUPPORTED", applies_if: "has-undeclared-export-format" }]);
  L("L15", [ok, { op: "loadScene" }, { op: "export", arg: "gif", expect: "INVALID_INPUT/UNKNOWN_FORMAT" }, { op: "export", arg: 5, expect: "INVALID_INPUT/SCHEMA" }]);
  L("L16", [ok, { op: "loadScene" }, { op: "dispatch", arg: sel1 }, { op: "export", arg: "scene", expect_bytes: "scenes/o1.scene.json" }]);
  L("L17", [ok, { op: "loadScene" }, { op: "dispatch", arg: { type: "resize", width: 0, height: 5 }, expect: "INVALID_INTENT/OUT_OF_RANGE" }]);
  L("L18", [{ op: "initialize", await: false }, { op: "loadScene", await: false }, { op: "render", await: false }, { op: "export", arg: "scene", await: false }, { op: "dispose", await: false }], "record", { expect_settle_order: [0, 1, 2, 3, 4] });
  L("L19", [{ op: "initialize", await: false }, { op: "dispatch", arg: { type: "fit" }, expect: "INVALID_LIFECYCLE/BUSY" }, { op: "probe", expect: "INVALID_LIFECYCLE/BUSY" }, { op: "applySceneDelta", arg: {}, expect: "UNSUPPORTED_CAPABILITY/RESERVED" }]);
  const l20 = life("L20", "dispatch-inside"); l20.dispatch(sel1); l20.done();
  const l21 = life("L21", "record"); l21.dispatch({ type: "select", mode: "replace", targets: [O1_NODE(I1), O1_NODE(ANN)] }); l21.dispatch({ type: "set-hidden", targets: [O1_NODE(ANN)], hidden: true }); l21.dispatch({ type: "focus-step", delta: 1 }); l21.done();
  const l21b = life("L21b", "throw"); l21b.dispatch(sel1); l21b.dispatch({ type: "focus", target: O1_NODE(I1) }); l21b.done();
  L("L22", [ok, { op: "loadScene", arg: { over_capacity: "nodes" }, expect: "RESOURCE_LIMIT/NODE_LIMIT" }]);
  L("L23", [ok, { op: "loadScene" }, { op: "setReducedMotion", arg: true }, { op: "probe", expect_motion: "none" }, { op: "setReducedMotion", arg: false }, { op: "probe", expect_motion: "none" }]);
  L("L24", [{ op: "initialize", arg: { size: { width: 0, height: 10 } }, expect: "INVALID_INPUT/OUT_OF_RANGE" }, ok, { op: "loadScene" }]);
  L("L24b", [{ op: "initialize", arg: { size: { width: 10, height: 16385 } }, expect: "INVALID_INPUT/OUT_OF_RANGE" }]);
  L("L24c", [{ op: "initialize", arg: { size: { width: 16384, height: 1 } } }, { op: "loadScene" }]);

  // C: comparison
  const m1 = o1m;
  const base = initialState(m1, { width: 900, height: 600 });
  const rep = (s: SemanticState) => buildReport(m1, s, { labels: "full", edge_labels: false, motion: "none", degradations: [] });
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const cmp = (id: string, reports: { renderer: string; report: unknown; manifest?: unknown }[], error = "") => {
    b.json(`compare/${id}.reports.json`, { model, reports });
    let expected = "";
    if (!error) { expected = `compare/${id}.compare.json`; b.put(expected, canonicalBytesSigned(compareProjections(m1, reports as never) as unknown as CJValue)); }
    else { try { compareProjections(m1, reports as never); throw new Error("expected an error"); } catch (e) { if (errName(e) !== error) throw new Error(`${id}: ${errName(e)}`); } }
    b.row({ id, tier: "core", scene: model.scene, layout: model.layout, input: `compare/${id}.reports.json`, expected, error });
  };
  const stSel = reduce(m1, base, { type: "select", mode: "replace", targets: [O1_NODE(I1), O1_NODE(ANN)] }).state;
  cmp("C01", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: rep(base) }]);
  cmp("C02", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: { ...clone(rep(base)), fidelity: { labels: "elided", edge_labels: true, motion: "full", degradations: ["LABELS_ELIDED"] } } }]);
  cmp("C03", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: rep(reduce(m1, base, { type: "focus", target: O1_NODE(I1) }).state) }]);
  cmp("C04", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: rep(reduce(m1, base, { type: "set-hidden", targets: [O1_NODE(ANN)], hidden: true }).state) }]);
  const text = clone(rep(base)); text.accessible.items[1]!.name = "person Ann";
  cmp("C05", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: text }]);
  const otherHash = clone(rep(base)); otherHash.scene_sha256 = "0".repeat(64); otherHash.state.scene_sha256 = "0".repeat(64);
  cmp("C06", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: otherHash }]);
  cmp("C07", [{ renderer: "a", report: rep(base), manifest: { x: 1 } }, { renderer: "b", report: rep(base), manifest: { y: 2 } }]);
  const odd = clone(rep(base)); odd.accessible.status = "x";
  cmp("C08", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: rep(base) }, { renderer: "c", report: odd }]);
  const lacks = clone(rep(stSel)); lacks.drawn.nodes.pop();
  cmp("C09", [{ renderer: "a", report: rep(stSel) }, { renderer: "b", report: lacks }], "INVALID_REPORT/INCONSISTENT");
  const ghost = clone(rep(stSel)); ghost.marked.selected.nodes[0] = { id: "i:9", type: "person" };
  cmp("C10", [{ renderer: "a", report: rep(stSel) }, { renderer: "b", report: ghost }], "INVALID_REPORT/UNRESOLVED_ELEMENT");
  const noAcc = clone(rep(stSel)) as unknown as Record<string, unknown>; delete noAcc["accessible"];
  cmp("C11", [{ renderer: "a", report: rep(stSel) }, { renderer: "b", report: noAcc }], "INVALID_REPORT/SCHEMA");
  const v2 = clone(rep(stSel)) as unknown as Record<string, unknown>; v2["igr"] = "IGR/2";
  cmp("C12", [{ renderer: "a", report: rep(stSel) }, { renderer: "b", report: v2 }], "INVALID_REPORT/UNSUPPORTED_VERSION");
  const unsorted = clone(rep(stSel)); unsorted.state.selection.nodes.reverse(); unsorted.marked.selected.nodes.reverse();
  cmp("C13", [{ renderer: "a", report: rep(stSel) }, { renderer: "b", report: unsorted }], "INVALID_REPORT/NON_CANONICAL");

  // ---- rev 4 rows (design 13.3b), generated by the reference; the oracle corpus has the independent versions ----
  b.row({ id: "D01", tier: "subject" }); b.row({ id: "D02", tier: "subject" }); b.row({ id: "D03", tier: "subject" }); b.row({ id: "D04", tier: "subject" }); b.row({ id: "D05", tier: "subject" });
  // S47 fit centre rounding; S48 selection before focus; S49 lone surrogate; S50 inclusive state size limit
  await b.scene("o1fix", o1Scene(), { "i:1": [1, 1], ann: [2.001, 3.001] });
  const fixM = await b.model("scenes/o1fix.scene.json", "layouts/o1fix.layout.json");
  b.put("states/S47.state.json", serializeState(fixM, initialState(fixM, { width: 900, height: 600 })));
  b.row({ id: "S47", tier: "both", scene: "scenes/o1fix.scene.json", layout: "layouts/o1fix.layout.json", input: '{"initial":{"width":900,"height":600}}', expected: "states/S47.state.json" });
  reject("S48", "both", sorted({ ...s0, hidden: { nodes: [I1], edges: [] }, selection: { nodes: [I1], edges: [] }, focus: { node: I1 } }), "INVALID_STATE/SELECTED_HIDDEN");
  reject("S49", "both", null, "INVALID_STATE/INVALID_STRING", JSON.stringify(sorted({ ...s03, selection: { nodes: [{ id: "s:X", type: "person" }], edges: [] } })).replace("s:X", "s:\\ud800"));
  const s03len = serializeState(o1m, s03).length;
  b.row({ id: "S50", tier: "both", scene: "scenes/o1.scene.json", layout: "layouts/o1.layout.json", input: `{"file":"states/S03.state.json","limits":{"maxStateBytes":${s03len}}}` });
  // R42-R52 intents
  const bogus = (t: unknown[]) => ({ intent: { type: "select", mode: "replace", targets: t } });
  await b.script("R42", "both", "o1", [bogus([{ node: { id: "i:1" } }])]);
  await b.script("R43", "both", "o1", [bogus([{ node: { id: "i:1", type: 5 } }])]);
  await b.script("R44", "both", "o1", [bogus([{ node: { id: "i:1", type: "person", extra: 1 } }])]);
  await b.script("R45", "both", "o1", [bogus([{}]), bogus([{ node: {}, edge: {} }]), bogus([{ node: 5 }]), bogus([5])]);
  await b.script("R46", "both", "o1", [{ intent: {} }]);
  await b.script("R47", "both", "o1", [{ intent: { type: 5 } }, { intent: { type: "bogus" } }]);
  await b.script("R48", "both", "o1", [{ intent: { type: "select", mode: "bogus", targets: 5 } }, { intent: { type: "select", mode: "replace", targets: 5 } }]);
  await b.script("R49", "both", "o1", [{ intent: { type: "set-hidden", targets: [n(ANN)], hidden: true } }, { intent: { type: "focus", target: n(ANN) } }]);
  await b.script("R50", "both", "o1", [{ intent: { type: "set-hidden", targets: [], hidden: "true" } }]);
  const copies = (x: unknown, k: number) => Array.from({ length: k }, () => x);
  const r51t = [...copies(n(I1), 10), ...copies(n(ANN), 14), ...copies(e(E0), 10)];
  await b.script("R51", "both", "o1", [{ intent: { type: "select", mode: "replace", targets: r51t } }], { limits: { maxSceneBytes: 504 } });
  await b.script("R52", "both", "o1", [{ intent: { type: "select", mode: "replace", targets: [...r51t, n(I1)] } }], { limits: { maxSceneBytes: 504 } });
  // H27 quantizer tie at the node boundary
  await b.hand("h27", [{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b" }], { a: [-13.875, 0], b: [1000, 1000] });
  const h27m = await b.model("scenes/h27.scene.json", "layouts/h27.layout.json");
  const h27s: SemanticState = { ...initialState(h27m, { width: 14, height: 14 }), viewport: { center_x: 0, center_y: 0, width: 14, height: 14, zoom: 500 } };
  await b.hits("H27", "both", "h27", h27s, [[12.0, 7.0], [12.0625, 7.0]], { width: 14, height: 14 });
  // A20 spaces in labels
  await b.hand("a20", [{ id: "s:a ", label: "a " }, { id: "s:b", label: "b" }], [{ src: "s:a ", tgt: "s:b", rel: "R" }]);
  await b.script("A20", "both", "a20", []);
  // P22-P26
  pm("P22", man("headless", (c) => { c["indicators.non-color"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }));
  pm("P23", man("headless", (c) => { c["labels.edge"] = { status: "unsupported", reason: "HOST_LACKS" }; }));
  pm("P24", (() => { const m = man("dom"); (m.capacity as Record<string, unknown>).maxNodes = "5"; return m; })());
  pm("P25", man("dom", (c) => { c["x-a"] = { status: "unsupported", reason: "RESERVED" }; }));
  pm("P26", man("headless", (c) => { c["x-a"] = { status: "unsupported", reason: "HOST_LACKS" }; }));
  // L24d, L25, L26
  L("L24d", [{ op: "initialize", arg: { size: { width: 0, height: 600 } }, expect: "INVALID_INPUT/OUT_OF_RANGE" }, { op: "initialize" }, { op: "loadScene" }, { op: "getState", expect_state: "states/L16.initial.state.json" }]);
  L("L25", [{ op: "initialize" }, { op: "dispose", await: false }, { op: "applySceneDelta", arg: {}, expect: "INVALID_LIFECYCLE/DISPOSED" }], "record", { expect_settle_order: [0, 1] });
  L("L26", [ok, { op: "loadScene", arg: { at_capacity: "nodes" } }, { op: "loadScene", arg: { at_capacity: "edges" } }]);
  // C14-C21
  const hashed = clone(rep(base)); hashed.scene_sha256 = "0".repeat(64); hashed.state.scene_sha256 = "0".repeat(64);
  const lacks2 = clone(rep(base)); lacks2.drawn.nodes.pop();
  cmp("C14", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: hashed }, { renderer: "c", report: lacks2 }], "INVALID_REPORT/INCONSISTENT");
  const ghost2 = clone(rep(base)); ghost2.drawn.nodes[0] = { id: "i:9", type: "person" };
  cmp("C15", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: hashed }, { renderer: "c", report: ghost2 }], "INVALID_REPORT/UNRESOLVED_ELEMENT");
  const stale = clone(rep(base)); stale.state.scene_sha256 = "f".repeat(64);
  cmp("C16", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: stale }]);
  const rev = clone(rep(base)); rev.drawn.nodes.reverse();
  cmp("C17", [{ renderer: "a", report: rep(base) }, { renderer: "b", report: rev }]);
  b.json("compare/C18.reports.json", { model, reports: [{ renderer: "a", report: hashed }] });
  b.row({ id: "C18", tier: "core", scene: model.scene, layout: model.layout, input: "compare/C18.reports.json", error: "INVALID_REPORT/INCONSISTENT" });
  const hiddenSel = clone(rep(stSel)); hiddenSel.state.hidden.nodes = [I1];
  cmp("C19", [{ renderer: "a", report: hiddenSel }], "INVALID_REPORT/NON_CANONICAL");
  const mk = (s: string) => { const r = clone(rep(base)); r.accessible.status = s; return r; };
  cmp("C20", [{ renderer: "a", report: mk("Z") }, { renderer: "b", report: mk("X") }, { renderer: "c", report: mk("X") }, { renderer: "d", report: mk("Y") }, { renderer: "e", report: mk("Y") }]);
  const zoom0 = clone(rep(base)); zoom0.state.viewport.zoom = 0;
  cmp("C21", [{ renderer: "a", report: zoom0 }], "INVALID_REPORT/SCHEMA");

  // ---- rev 5 rows (13.3b): S51-S55, M30, A21, P27, L27 ----
  const zzz = { id: "s:zzz", type: "person" };
  reject("S51", "both", sorted({ ...s03, selection: { nodes: [ANN, I1, zzz], edges: [] } }), "INVALID_STATE/UNRESOLVED_ELEMENT");
  reject("S52", "both", sorted({ ...s03, selection: { nodes: [ANN, I1], edges: [] }, hidden: { nodes: [ANN], edges: [] } }), "INVALID_STATE/NON_CANONICAL");
  reject("S53", "both", sorted({ ...s03, scene_sha256: "0".repeat(64), viewport: { ...s03.viewport, zoom: 1000.5 } }), "INVALID_STATE/INVALID_NUMBER");
  reject("S54", "both", sorted({ ...s03, layout_sha256: "0".repeat(64), selection: { nodes: [zzz], edges: [] } }), "INVALID_STATE/LAYOUT_MISMATCH");
  reject("S55", "both", sorted({ ...s0, selection: { nodes: [], edges: [{ ...E0, ord: "01" }] } }), "INVALID_STATE/INVALID_VALUE");
  await b.hand("m30", [{ id: "i:1", type: "～", category: "～", label: "1" }, { id: "i:1", type: "\u{1F600}", category: "\u{1F600}", label: "1" }], [{ src: "i:1", tgt: "i:1", rel: "R", srcType: "～", tgtType: "\u{1F600}" }], undefined);
  const m30 = await b.model("scenes/m30.scene.json", "layouts/m30.layout.json");
  b.put("models/M30.model.json", modelBytes(m30));
  b.row({ id: "M30", tier: "core", scene: "scenes/m30.scene.json", layout: "layouts/m30.layout.json", expected: "models/M30.model.json" });
  await b.script("A21", "both", "m30", []);
  pm("P27", man("dom", (c) => { c["labels"] = { status: "degraded", degradations: ["LABELS_ELIDED", "LABELS_ELIDED"] }; }));
  const lim = (limits: unknown, expect = "ok") => ({ op: "initialize", arg: { limits }, expect });
  L("L27", [lim({ maxNodes: 5.5 }, "INVALID_INPUT/INVALID_VALUE"), lim({ maxNodes: "5" }, "INVALID_INPUT/SCHEMA"), lim({ maxNodes: -1 }, "INVALID_INPUT/OUT_OF_RANGE"), lim({ maxNodez: 5 }, "INVALID_INPUT/SCHEMA"),
    lim({ maxNodes: "NaN" }, "INVALID_INPUT/NOT_FINITE"), lim({ maxNodes: 9007199254740992 }, "INVALID_INPUT/OUT_OF_RANGE"), lim({ maxNodes: 0 })]);

  const corpus = await b.build();
  return { corpus, builder: b };
}
