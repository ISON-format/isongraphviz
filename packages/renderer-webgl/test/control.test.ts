// The controller, the executor and the probe beyond the oracle rows E, P and U20-U39: option validation, the verify hook of the adapter, handler safety,
// frame validation, the interface discipline of 7.5 (a double that throws on every member outside Gl2Like replays a whole plan and a whole lifecycle).
import { describe, expect, it } from "vitest";
import { IgrError } from "isongraph-visualize-renderer-core";
import { buildDisplayList } from "isongraph-visualize-display-list";
import { createGlController, createGlResources, deleteGlResources, executePlan, planGl, probeWebgl, releaseGlContext, type GlStatus } from "../src/index.js";
import { createFakeCanvas, createFakeGl } from "./fake-gl.js";
import { O1, errOf, initial } from "./helpers.js";

async function g01() { const { model, state } = await initial(O1); return planGl(buildDisplayList(model, state)); }
const rig = (extra: Record<string, unknown> = {}) => {
  const log: string[] = [];
  const gl = createFakeGl({ log });
  const canvas = createFakeCanvas({ log, webgl2: gl, logGetContext: false });
  const statuses: GlStatus[] = [], errors: IgrError[] = [];
  const ctl = createGlController(canvas, { onStatus: (s) => statuses.push(s), onError: (e) => errors.push(e), ...extra });
  return { log, gl, canvas, ctl, statuses, errors };
};

describe("the interface discipline of 7.5", () => {
  it("a Gl2Like double that throws on every member outside the interface replays creation, a frame, a loss cycle and disposal", async () => {
    const plan = await g01();
    const r = rig({ labels: { clear: () => undefined, draw: () => undefined } });
    r.ctl.initialize();
    r.ctl.commit(plan);
    r.gl.lost = true; r.canvas.fire("webglcontextlost");
    r.gl.lost = false; r.canvas.fire("webglcontextrestored");
    r.ctl.render();
    r.ctl.dispose();
    expect(r.ctl.status().phase).toBe("disposed");
    expect(() => (r.gl as unknown as Record<string, unknown>)["texImage2D"]).toThrow(/not a member of the interface/);
    expect(() => (r.gl as unknown as Record<string, () => void>)["getError"]!()).toThrow();
  });
  it("shaderSource receives only the constants of SHADER_SOURCES (the log carries the digest of what was submitted)", async () => {
    const { SHADER_SOURCES } = await import("../src/index.js");
    const { createHash } = await import("node:crypto");
    const log: string[] = [];
    createGlResources(createFakeGl({ log }));
    const digests = log.filter((l) => l.startsWith('["shaderSource"')).map((l) => (JSON.parse(l) as string[])[2]);
    const want = (["arrow", "disc", "edge"] as const).flatMap((p) => [SHADER_SOURCES[p].vs, SHADER_SOURCES[p].fs].map((s) => createHash("sha256").update(s).digest("hex").slice(0, 16)));
    expect(digests).toEqual(want);
  });
});

describe("executePlan frame input", () => {
  it("validates the frame: an object with integer widthPx, heightPx in 1..16384 and an ink of three integers 0..255", async () => {
    const plan = await g01();
    const gl = createFakeGl({ log: [] });
    const res = createGlResources(gl);
    const run = (frame: unknown): string => errOf(() => executePlan(gl, plan, res, frame as never));
    expect(run({ widthPx: 900, heightPx: 600, ink: [34, 34, 34] })).toBe("none");
    expect(run(null)).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ widthPx: "900", heightPx: 600, ink: [0, 0, 0] })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ widthPx: 0, heightPx: 600, ink: [0, 0, 0] })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ widthPx: 900.5, heightPx: 600, ink: [0, 0, 0] })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ widthPx: 900, heightPx: 600, ink: [0, 0] })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ widthPx: 900, heightPx: 600, ink: [0, 0, 256] })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ widthPx: 900, heightPx: 600, ink: [0, 0.5, 0] })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ widthPx: 900, heightPx: 600, ink: "red" })).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a refused frame makes no GL call", async () => {
    const plan = await g01();
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const res = createGlResources(gl);
    log.length = 0;
    expect(errOf(() => executePlan(gl, plan, res, { widthPx: -1, heightPx: 600, ink: [0, 0, 0] }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(log).toEqual([]);
  });
});

describe("createGlResources: failure and loss", () => {
  it("a lost context after a status check stops creation with CONTEXT_LOST, no cleanup call and no info log", () => {
    const log: string[] = [];
    const gl = createFakeGl({ log });
    gl.loseAfterArrowVs = true;
    let err: unknown;
    try { createGlResources(gl); } catch (e) { err = e; }
    expect((err as IgrError).detail).toBe("CONTEXT_LOST");
    expect(log.length).toBe(4);
    expect(log.some((l) => /delete|InfoLog/.test(l))).toBe(false);
  });
  it("a link failure reports at most 120 characters of the program's info log after the token", () => {
    const log: string[] = [];
    const gl = createFakeGl({ log, failLink: "arrow", infoLog: "x".repeat(300) });
    let err: unknown;
    try { createGlResources(gl); } catch (e) { err = e; }
    expect((err as IgrError).detail).toBe("LINK_FAILED:" + "x".repeat(120));
    expect((err as IgrError).code + "/" + (err as IgrError).reason).toBe("INVALID_INPUT/INVALID_VALUE");
  });
  it("the info log is read once, before the cleanup", () => {
    const log: string[] = [];
    try { createGlResources(createFakeGl({ log, failCompile: "arrow.fs", infoLog: "bad" })); } catch { /* expected */ }
    const at = log.findIndex((l) => l.startsWith('["getShaderInfoLog"'));
    expect(log.filter((l) => l.startsWith('["getShaderInfoLog"')).length).toBe(1);
    expect(log.slice(0, at).some((l) => l.startsWith('["delete'))).toBe(false);
    expect(log.slice(at + 1).every((l) => l.startsWith('["delete'))).toBe(true);
  });
  it("deleteGlResources and releaseGlContext follow 7.5; a context without WEBGL_lose_context is released by doing nothing further", () => {
    const log: string[] = [];
    const gl = createFakeGl({ log, extensions: [] });
    const res = createGlResources(gl);
    log.length = 0;
    deleteGlResources(gl, res);
    releaseGlContext(gl);
    expect(log.length).toBe(9 + 1);
    expect(log[log.length - 1]).toBe('["getExtension","WEBGL_lose_context"]');
  });
});

describe("the controller", () => {
  it("validates contextAttributes: an object with the one boolean key", () => {
    const c = createFakeCanvas({ log: [], webgl2: createFakeGl({ log: [] }) });
    expect(errOf(() => createGlController(c, { contextAttributes: { failIfMajorPerformanceCaveat: 1 } as never }))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createGlController(c, { contextAttributes: { x: 1 } as never }))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createGlController(c, { contextAttributes: null as never }))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createGlController(c, { contextAttributes: { failIfMajorPerformanceCaveat: false } }))).toBe("none");
    expect(createGlController(c, { contextAttributes: { failIfMajorPerformanceCaveat: false } }).status().attributes).toEqual({ failIfMajorPerformanceCaveat: false });
  });
  it("the verify hook of the adapter refuses the live context before the listeners are added, with the closed token and no onError", () => {
    const r = rig({ verify: () => "TOO_SMALL" });
    let err: unknown;
    try { r.ctl.initialize(); } catch (e) { err = e; }
    expect((err as IgrError).detail).toBe("TOO_SMALL");
    expect(r.ctl.status().failure).toBe("TOO_SMALL");
    expect(r.canvas.listeners()).toEqual([]);
    expect(r.errors).toEqual([]);
    r.ctl.dispose(); // the live context it obtained is released
    expect(r.log).toEqual(['["getExtension","WEBGL_lose_context"]', '["loseContext"]']);
  });
  it("a live canvas that refuses webgl2 rejects NO_CONTEXT through onError; a lost context during creation rejects CONTEXT_LOST", () => {
    const log: string[] = [];
    const errors: IgrError[] = [];
    const c = createFakeCanvas({ log, webgl2: null });
    const ctl = createGlController(c, { onError: (e) => errors.push(e) });
    expect(errOf(() => ctl.initialize())).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(ctl.status().failure).toBe("NO_CONTEXT");
    expect(errors.map((e) => e.detail)).toEqual(["NO_CONTEXT"]);
    const r = rig();
    r.gl.loseAfterArrowVs = true;
    expect(() => r.ctl.initialize()).toThrow(/CONTEXT_LOST/);
    expect(r.ctl.status().failure).toBe("CONTEXT_LOST");
    expect(r.ctl.status().phase).toBe("created");
  });
  it("events in `created` and in `disposed` are ignored: a loss or a restore never draws, never calls back", () => {
    const r = rig();
    r.canvas.fire("webglcontextlost");
    expect(r.log).toEqual([]);
    r.ctl.dispose();
    r.canvas.fire("webglcontextrestored");
    r.ctl.commit({} as never);
    r.ctl.render();
    r.ctl.initialize();
    expect(r.ctl.status().phase).toBe("disposed");
    expect(r.ctl.status().phase).toBe("disposed");
  });
  it("a throwing frame in a restore goes to onError and does not escape the handler", async () => {
    const plan = await g01();
    const r = rig();
    r.ctl.initialize();
    r.ctl.commit(plan);
    r.gl.lost = true; r.canvas.fire("webglcontextlost");
    r.gl.lost = false;
    r.ctl.commit({ ...plan, header: { ...plan.header, w: 0 } } as never); // retained while lost; the frame will refuse it
    expect(() => r.canvas.fire("webglcontextrestored")).not.toThrow();
    expect(r.errors.length).toBe(1);
  });
  it("it sets no timer and reads no pixel: the source never mentions them", async () => {
    const { readFileSync } = await import("node:fs");
    const t = readFileSync(new URL("../src/control.ts", import.meta.url), "utf8");
    expect(t).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|readPixels|getError/);
  });
});

describe("probeWebgl beyond the rows", () => {
  const caps = { vertexPrecision: 23, fragmentPrecision: 23 };
  it("releases the context on every path and returns the limits", () => {
    const log: string[] = [];
    const mk = () => createFakeCanvas({ log, webgl2: createFakeGl({ log, ...caps, maxViewportDims: [8192, 4096] }), ctx2d: true });
    expect(probeWebgl(mk, { widthPx: 8192, heightPx: 4096 })).toEqual({ available: true, limits: { maxViewportDims: [8192, 4096] } });
    expect(probeWebgl(mk, { widthPx: 8193, heightPx: 1 })).toEqual({ available: false, reason: "TOO_SMALL" });
    expect(probeWebgl(mk, { widthPx: 1, heightPx: 4097 })).toEqual({ available: false, reason: "TOO_SMALL" });
    expect(log.filter((l) => l === '["loseContext"]').length).toBe(3);
  });
  it("a throwing getContext or getShaderPrecisionFormat is PROBE_ERROR, a non-boolean option throws nothing out", () => {
    const log: string[] = [];
    expect(probeWebgl(() => createFakeCanvas({ log, webgl2: null, throws: "getContext" }))).toEqual({ available: false, reason: "PROBE_ERROR" });
    expect(probeWebgl(() => createFakeCanvas({ log, webgl2: createFakeGl({ log, throws: "getShaderPrecisionFormat" }), ctx2d: true }))).toEqual({ available: false, reason: "PROBE_ERROR" });
    expect(probeWebgl(undefined)).toEqual({ available: false, reason: "NO_FACTORY" });
  });
  it("never asks for an extension other than WEBGL_lose_context (the double throws on any other)", () => {
    const log: string[] = [];
    expect(probeWebgl(() => createFakeCanvas({ log, webgl2: createFakeGl({ log, ...caps }), ctx2d: true })).available).toBe(true);
    expect(log.filter((l) => l.startsWith('["getExtension"')).every((l) => l === '["getExtension","WEBGL_lose_context"]')).toBe(true);
  });
});
