// Tests written FIRST for the findings of the independent audit of step 2 (docs/isongraph-visualize-blueprint/reviews/31-code-audit-step2.md): each failed
// before its fix. I-1 (pick from the renderer's own list), M-1 (options read once, accessors refused), M-3 (quantizePx), M-4 (dispose in `created`),
// M-5 (a failing label layer), M-6 (reader limits), M-8 (async render), M-9 (at most one focus element), M-16 (probe arguments), N-2 (info log cut).
// The pointer listener (M-2) is in dom.test.ts, the oracle-invisible mutants (M-11) are the ext rows of test/oracle/ext.ts, I-2 is last.
import { describe, expect, it } from "vitest";
import { IgrError, initialState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, type DisplayList } from "isongraph-visualize-display-list";
import {
  createGlController, createGlResources, createWebglRenderer, executePlan, glManifest, parseGlPlan, planGl, probeWebgl, readGlPlan, readoutFromGl, serializePlan,
} from "../src/index.js";
import { createDomWebglRenderer } from "../src/dom/index.js";
import { canon, createFakeCanvas, createFakeGl } from "./fake-gl.js";
import { O1, errOf, loadModel, readOracle, readOracleText, SIZE } from "./helpers.js";

const ENV = { host: "headless", size: SIZE, reducedMotion: false } as never;
const text = (b: Uint8Array): string => new TextDecoder().decode(b);

/** The viewport that puts the lowest node of O1 (layout y 187923) at 2^40 - 14,000 m-px: the default list's label (y + 24,000) is beyond the limit, a list without labels is not. */
const EDGE_VIEWPORT = { type: "set-viewport", center_x: 450000, center_y: 187923 + 300000 - (2 ** 40 - 14000), zoom: 1000 } as const;

describe("I-1: pick and the adapter pick from the renderer's own list", () => {
  it("with labels off a state whose default list would be refused is still pickable", async () => {
    const r = createWebglRenderer({ dl: { labels: false } });
    await r.initialize(ENV);
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    r.dispatch(EDGE_VIEWPORT);
    expect(() => r.displayList()).not.toThrow();
    expect(() => r.plan()).not.toThrow();
    expect(errOf(() => r.pick({ x: 10, y: 10 }))).toBe("none");
    // the same state with the default options is refused by the list and by pick (3.5)
    const d = createWebglRenderer();
    await d.initialize(ENV);
    await d.loadScene(await loadModel(O1.scene, O1.layout));
    d.dispatch(EDGE_VIEWPORT);
    expect(errOf(() => d.displayList())).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => d.pick({ x: 10, y: 10 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("a press in the DOM adapter at that state reaches no onError", async () => {
    const { mountFake } = await import("./dom-fake.js");
    const m = await mountFake({ dl: { labels: false } });
    m.r.dispatch(EDGE_VIEWPORT);
    const before = m.errors.length;
    m.press(10, 10);
    expect(m.errors.length).toBe(before);
  });
});

describe("M-1: caller-owned options are copied once, accessors and __proto__ keys are refused (27 14)", () => {
  const getter = (): object => { let n = 0; return { get maxNodes() { n++; return n === 1 ? 7 : 9; } }; };
  it("a getter in capacity, dl, contextAttributes or at the top level is SCHEMA", () => {
    expect(errOf(() => createWebglRenderer({ capacity: getter() } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => glManifest("headless", { dl: { get labels() { return true; } } } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => glManifest("headless", { contextAttributes: { get failIfMajorPerformanceCaveat() { return true; } } } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => glManifest("headless", { get name() { return "x"; } } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createGlController(createFakeCanvas({ log: [], webgl2: null }), { contextAttributes: { get failIfMajorPerformanceCaveat() { return true; } } } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a __proto__ key (as JSON.parse makes it) is SCHEMA", () => {
    expect(errOf(() => createWebglRenderer(JSON.parse('{"__proto__": {"name": "x"}}')))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createWebglRenderer(JSON.parse('{"capacity": {"__proto__": {}}}')))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a getter in the frame of executePlan is refused and the frame is read once", async () => {
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const res = createGlResources(gl);
    const plan = planGl(buildDisplayList(await loadModel(O1.scene, O1.layout), initialState(await loadModel(O1.scene, O1.layout), SIZE)));
    let reads = 0;
    const frame = { get widthPx() { reads++; return 900; }, heightPx: 600, ink: [1, 2, 3] };
    expect(errOf(() => executePlan(gl, plan, res, frame as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(reads).toBeLessThanOrEqual(1);
  });
});

describe("M-3: the device pixel ratio is quantized with quantizePx and a non-finite product is ignored", () => {
  it("a ratio of 1e308 (finite, but ratio * 1000 is Infinity) is the identity ratio, not the 8000 cap", async () => {
    const { mountFake } = await import("./dom-fake.js");
    const m = await mountFake(undefined, (d) => { d.defaultView.devicePixelRatio = 1e308; });
    expect([m.glCanvas.width, m.glCanvas.height]).toEqual([900, 600]);
  });
});

describe("M-4 / design rev 5 release rule: loseContext() at dispose only on a context that was obtained AND is not lost, in every phase", () => {
  it("a context lost during creation is never released again at dispose (created); one obtained and usable is", () => {
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const canvas = createFakeCanvas({ log, webgl2: gl, logGetContext: false });
    const ctl = createGlController(canvas, {});
    gl.loseAfterArrowVs = true;
    expect(() => ctl.initialize()).toThrow();
    log.length = 0;
    ctl.dispose();
    expect(log.filter((l) => l.includes("loseContext") || l.includes("getExtension"))).toEqual([]);
    const log2: string[] = [];
    const g2 = createFakeGl({ log: log2, failCompile: "disc.fs" });
    const c2 = createGlController(createFakeCanvas({ log: log2, webgl2: g2, logGetContext: false }), {});
    expect(() => c2.initialize()).toThrow();
    log2.length = 0;
    c2.dispose();
    expect(log2).toContain('["loseContext"]');
  });
});

describe("M-5: a failing label layer leaves no live resources and a consistent phase", () => {
  async function g01() { const m = await loadModel(O1.scene, O1.layout); return planGl(buildDisplayList(m, initialState(m, SIZE))); }
  it("a throw in labels.draw on the first frame: initialize rejects with an IgrError, onError is called, the programs are deleted, a second initialize creates one set", async () => {
    const plan = await g01();
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const canvas = createFakeCanvas({ log, webgl2: gl, logGetContext: false });
    let boom = true;
    const errors: IgrError[] = [];
    const ctl = createGlController(canvas, { onError: (e) => errors.push(e), labels: { clear: () => undefined, draw: () => { if (boom) throw new Error("label layer"); } } });
    ctl.commit(plan);
    let err: unknown;
    try { ctl.initialize(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(IgrError);
    expect((err as IgrError).detail).toBe("REPLAY_ERROR");
    expect(ctl.status().phase).toBe("created");
    expect(ctl.status().failure).toBe("REPLAY_ERROR");
    expect(errors.length).toBe(1);
    expect(log.filter((l) => l.startsWith('["deleteProgram"')).length).toBe(3);
    boom = false;
    log.length = 0;
    gl.lost = false; // a new generation of objects
    ctl.initialize();
    expect(ctl.status().phase).toBe("ready");
    expect(log.filter((l) => l.startsWith('["createProgram"')).length).toBe(3);
  });
  it("a throw on a restore: onError once, resources deleted, phase failed, and a later restore recovers", async () => {
    const plan = await g01();
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const canvas = createFakeCanvas({ log, webgl2: gl, logGetContext: false });
    let boom = false;
    const errors: IgrError[] = [];
    const ctl = createGlController(canvas, { onError: (e) => errors.push(e), labels: { clear: () => undefined, draw: () => { if (boom) throw new Error("label layer"); } } });
    ctl.initialize();
    ctl.commit(plan);
    gl.lost = true; canvas.fire("webglcontextlost");
    boom = true; gl.lost = false; log.length = 0;
    canvas.fire("webglcontextrestored");
    expect(ctl.status().phase).toBe("failed");
    expect(ctl.status().failure).toBe("REPLAY_ERROR");
    expect(errors.length).toBe(1);
    expect(log.filter((l) => l.startsWith('["deleteProgram"')).length).toBe(3);
    boom = false; log.length = 0; gl.lost = false;
    canvas.fire("webglcontextrestored");
    expect(ctl.status().phase).toBe("ready");
    expect(log.filter((l) => l.startsWith('["createProgram"')).length).toBe(3);
  });
});

describe("M-6: the reader validates its limits (a NaN bound must not disable a limit)", () => {
  const g01 = readOracle("plan/G01.glplan");
  it("NaN, a string, a fraction, a negative number, an unknown key and a non-object are INVALID_INPUT", () => {
    for (const l of [{ maxBytes: NaN }, { maxLineUnits: NaN }, { maxBytes: "5" }, { maxBytes: 1.5 }, { maxBytes: -1 }, { maxBytes: Infinity }]) expect(errOf(() => parseGlPlan(g01, l as never)), JSON.stringify(l)).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => parseGlPlan(g01, { bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    for (const l of ["x", 5, [], null]) expect(errOf(() => parseGlPlan(g01, l as never)), String(l)).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => readGlPlan(g01, { limits: { maxBytes: NaN } }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => parseGlPlan(g01, { maxBytes: g01.length }))).toBe("none");
    expect(errOf(() => parseGlPlan(g01, undefined))).toBe("none");
  });
});

describe("M-8: render() of the adapter rejects instead of throwing", () => {
  it("a throwing label layer at render time is a rejected promise", async () => {
    const { mountFake } = await import("./dom-fake.js");
    const m = await mountFake();
    m.labelCanvas.rec.ctx.fillText = () => { throw new Error("fillText"); };
    let sync: unknown, p: Promise<void> | undefined;
    try { p = m.r.render(); } catch (e) { sync = e; }
    expect(sync).toBeUndefined();
    await expect(p).rejects.toBeInstanceOf(Error);
  });
});

describe("M-9: at most one focused element in a plan (pending the design ruling; the reader refuses two)", () => {
  function farList(flags: [number, number]): DisplayList {
    const n = (id: string) => ({ id, type: "t" });
    return {
      format: "igr-dl/1", width: 900, height: 600, directed: false, artifactSha256: "1".repeat(64), sceneSha256: "2".repeat(64), layoutSha256: "3".repeat(64),
      nodes: [n("s:a"), n("s:b")], edges: [], records: [["N", 1, 0, flags[0], -2_000_000_000, 300000], ["N", 2, 0, flags[1], 2_000_000_000, 300000]],
    } as unknown as DisplayList;
  }
  it("two focus flags (here in cn) are rejected by the reader; one is accepted; readoutFromGl is deterministic", () => {
    const one = serializePlan(planGl(farList([2, 0])));
    expect(errOf(() => parseGlPlan(one))).toBe("none");
    const two = serializePlan(planGl(farList([2, 2])));
    expect(() => parseGlPlan(two)).toThrow(/G12:/);
    expect(errOf(() => readGlPlan(two, { skip: ["G12"] }))).toBe("none");
    const plan = readGlPlan(two, { lenient: true });
    expect(readoutFromGl(plan).marked.focus).toBeUndefined(); // two foci in a plan read without its rules: none, never an arbitrary one
    expect(readoutFromGl(parseGlPlan(one)).marked.focus).toEqual({ node: { id: "s:a", type: "t" } });
  });
});

describe("M-16: probeWebgl validates its arguments", () => {
  it("a NaN or non-integer need and a non-boolean option are PROBE_ERROR, never a pass or a forwarded value", () => {
    const mk = (log: string[]) => () => createFakeCanvas({ log, webgl2: createFakeGl({ log }), ctx2d: true });
    expect(probeWebgl(mk([]), { widthPx: NaN })).toEqual({ available: false, reason: "PROBE_ERROR" });
    expect(probeWebgl(mk([]), { heightPx: 1.5 })).toEqual({ available: false, reason: "PROBE_ERROR" });
    expect(probeWebgl(mk([]), { widthPx: 0 })).toEqual({ available: false, reason: "PROBE_ERROR" });
    const log: string[] = [];
    expect(probeWebgl(mk(log), undefined, { failIfMajorPerformanceCaveat: "no" as never })).toEqual({ available: false, reason: "PROBE_ERROR" });
    expect(log.some((l) => l.includes('"no"'))).toBe(false);
    expect(probeWebgl(mk([]), { widthPx: 2, heightPx: 2 }).available).toBe(true);
  });
});

describe("N-2: the info log is cut at a scalar boundary", () => {
  it("a log whose 120th unit would split a surrogate pair does not end in a lone surrogate", () => {
    const log: string[] = [];
    let err: unknown;
    try { createGlResources(createFakeGl({ log, failCompile: "arrow.vs", infoLog: "x".repeat(119) + "\u{1f600}tail" })); } catch (e) { err = e; }
    const d = (err as IgrError).detail!;
    expect(d.startsWith("COMPILE_FAILED:" + "x".repeat(119))).toBe(true);
    expect(d.length).toBeLessThanOrEqual("COMPILE_FAILED:".length + 120);
    expect(d.charCodeAt(d.length - 1) >= 0xd800 && d.charCodeAt(d.length - 1) <= 0xdbff).toBe(false);
  });
});

describe("I-2 (design rev 5: a RENDERER with a label budget of 0 is refused; the builder and planGl accept 0)", () => {
  it("planGl of a list built with budget 0 is the bytes of plan/B08.c.glplan (the oracle's case c at the list level)", async () => {
    const m = await loadModel(O1.scene, O1.layout);
    const list = buildDisplayList(m, initialState(m, SIZE), { maxDrawnLabelUnits: 0 });
    expect(text(serializePlan(planGl(list)))).toBe(text(readOracle("plan/B08.c.glplan")));
    expect(JSON.parse(readOracleText("json/B08.c.json")).nt).toBe(0);
  });
  it("a renderer built with dl.maxDrawnLabelUnits 0 or capacity.maxDrawnLabelUnits 0 is INVALID_INPUT/OUT_OF_RANGE, like V5 and V6 (the manifest too)", () => {
    expect(errOf(() => createWebglRenderer({ dl: { maxDrawnLabelUnits: 0 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => glManifest("headless", { dl: { maxDrawnLabelUnits: 0 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => glManifest("dom", { capacity: { maxDrawnLabelUnits: 0 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => glManifest("headless", { dl: { maxDrawnLabelUnits: 1 } }))).toBe("none");
  });
});

void createDomWebglRenderer;
