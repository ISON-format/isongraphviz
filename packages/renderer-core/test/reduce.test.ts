// Intents, the reducer, events, viewport arithmetic (design sections 5 and 6; Appendix A.3 and A.6; vectors R*).
import { describe, expect, it } from "vitest";
import { buildRenderModel } from "../src/model.js";
import { fitViewport, reduce, serializeEvents } from "../src/reduce.js";
import { initialState, parseState, serializeState } from "../src/state.js";
import { layoutToScreen } from "../src/viewport.js";
import type { Intent, RenderModel, SemanticEvent, SemanticState } from "../src/types.js";
import { ARTIFACT_O1, dec, errOf, igl, o1Scene } from "./helpers.js";

const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };
const E0 = { ord: "0", rel: "KNOWS", src: I1, tgt: ANN };
let O1: RenderModel, M20: RenderModel;
const o1 = async () => (O1 ??= await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json")));
const m20 = async () => (M20 ??= await buildRenderModel(igl("scenes/mixed20.scene.json"), igl("layouts/F04.layout.json")));
const start = async () => initialState(await o1(), { width: 900, height: 600 });
const run = async (s: SemanticState, i: unknown, m?: RenderModel, limits?: object) => reduce(m ?? (await o1()), s, i, limits);
const sel = (nodes: unknown[], edges: unknown[] = []) => ({ nodes, edges });
const evTypes = (e: SemanticEvent[]) => e.map((x) => x.type);
const node = (n: unknown) => ({ node: n });
const edge = (e: unknown) => ({ edge: e });

describe("Appendix A.3 viewport intents from the A.2 state", () => {
  it("pan with rounding: +10 px -> 5015 units, -7 px -> -3511 (negative rounding)", async () => {
    const s = await start();
    expect((await run(s, { type: "pan", dx: 10, dy: 0 })).state.viewport.center_x).toBe(378539);
    expect((await run(s, { type: "pan", dx: -7, dy: 0 })).state.viewport.center_x).toBe(387065);
    expect((await run(s, { type: "pan", dx: 0, dy: 10 })).state.viewport.center_y).toBe(134563 - 5015);
  });
  it("zoom without anchor: 2000 -> zoom 3988, centre unchanged", async () => {
    const r = await run(await start(), { type: "zoom", factor_milli: 2000 });
    expect(r.state.viewport).toEqual({ center_x: 383554, center_y: 134563, width: 900, height: 600, zoom: 3988 });
  });
  it("zoom with anchor (0, 300) lying on the viewport edge: centre_x 270716, centre_y unchanged", async () => {
    const r = await run(await start(), { type: "zoom", factor_milli: 2000, anchor: { x: 0, y: 300 } });
    expect(r.state.viewport).toEqual({ center_x: 270716, center_y: 134563, width: 900, height: 600, zoom: 3988 });
  });
  it("fit {padding: 32} returns the A.2 viewport (R24)", async () => {
    const m = await o1();
    const s0 = await start();
    const moved = (await run(s0, { type: "pan", dx: 50, dy: -20 })).state;
    const r = await run(moved, { type: "fit", padding: 32 });
    expect(r.state.viewport).toEqual(s0.viewport);
    expect(fitViewport(m, moved, 32)).toEqual(s0.viewport);
    expect(r.events).toEqual([{ type: "viewport-changed", viewport: s0.viewport }]);
  });
});

describe("Appendix A.6 events and state bytes", () => {
  it("select replace -> exactly one selection-changed event, with ObjectRef only", async () => {
    const m = await o1();
    const r = await run(await start(), { type: "select", mode: "replace", targets: [node(I1)] });
    expect(dec(serializeEvents(r.events))).toBe(`[{"selection":[{"address":{"id":"i:1","type":"person"},"artifact_sha256":"${ARTIFACT_O1}"}],"type":"selection-changed"}]`);
    expect(r.state.selection).toEqual(sel([I1]));
    expect(dec(serializeState(m, r.state))).toContain('"selection":{"edges":[],"nodes":[{"id":"i:1","type":"person"}]}');
  });
  it("focus-step walks node, node, edge and then reports the boundary without a state change", async () => {
    const m = await o1();
    let s = (await run(await start(), { type: "select", mode: "replace", targets: [node(I1)] })).state;
    const r1 = await run(s, { type: "focus-step", delta: 1 });
    expect(dec(serializeEvents(r1.events))).toBe(`[{"focus":{"address":{"id":"i:1","type":"person"},"artifact_sha256":"${ARTIFACT_O1}"},"type":"focus-changed"}]`);
    expect(dec(serializeState(m, r1.state))).toContain('"focus":{"node":{"id":"i:1","type":"person"}}');
    expect(dec(serializeState(m, r1.state)).startsWith('{"focus"')).toBe(true);
    s = r1.state;
    const r2 = await run(s, { type: "focus-step", delta: 1 }); expect(r2.state.focus).toEqual({ node: ANN }); s = r2.state;
    const r3 = await run(s, { type: "focus-step", delta: 1 }); expect(r3.state.focus).toEqual({ edge: E0 }); s = r3.state;
    const r4 = await run(s, { type: "focus-step", delta: 1 });
    expect(r4.state).toEqual(s);
    expect(dec(serializeEvents(r4.events))).toBe('[{"end":"end","type":"traversal-boundary"}]');
  });
  it("serializeEvents is IGR-CJ/1 of the array", () => {
    expect(dec(serializeEvents([]))).toBe("[]");
  });
});

describe("select (R01-R09, R35)", () => {
  it("R01 replace; empty replace clears; R02 add; R04 remove with absent and hidden targets is no error; R03 toggle", async () => {
    const s0 = await start();
    const r1 = await run(s0, { type: "select", mode: "replace", targets: [node(ANN), edge(E0)] });
    expect(r1.state.selection).toEqual(sel([ANN], [E0]));
    expect(evTypes(r1.events)).toEqual(["selection-changed"]);
    const r2 = await run(r1.state, { type: "select", mode: "add", targets: [node(I1)] });
    expect(r2.state.selection).toEqual(sel([I1, ANN], [E0])); // scene order, not click order
    const r3 = await run(r2.state, { type: "select", mode: "toggle", targets: [node(ANN), node(ANN)] }); // distinct targets flip once
    expect(r3.state.selection).toEqual(sel([I1], [E0]));
    const r4 = await run(r3.state, { type: "select", mode: "remove", targets: [node(ANN), edge(E0)] });
    expect(r4.state.selection).toEqual(sel([I1]));
    expect((await run(r4.state, { type: "select", mode: "replace", targets: [] })).state.selection).toEqual(sel([]));
    expect((await run(r4.state, { type: "select", mode: "add", targets: [] })).events).toEqual([]);
  });
  it("R04 remove of a hidden target is not an error (K60); remove of an unresolved target IS UNRESOLVED_ELEMENT", async () => {
    const hidden = (await run(await start(), { type: "set-hidden", targets: [node(ANN)], hidden: true })).state;
    const r = await run(hidden, { type: "select", mode: "remove", targets: [node(ANN)] });
    expect(r.events).toEqual([]);
    expect(await errOfAsync2(() => run(hidden, { type: "select", mode: "remove", targets: [node({ id: "i:9", type: "person" })] }))).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT");
  });
  it("R05 mixed targets: the order of targets does not change the bytes", async () => {
    const m = await o1();
    const a = (await run(await start(), { type: "select", mode: "replace", targets: [edge(E0), node(ANN), node(I1)] })).state;
    const b = (await run(await start(), { type: "select", mode: "replace", targets: [node(I1), node(ANN), edge(E0)] })).state;
    expect(serializeState(m, a)).toEqual(serializeState(m, b));
  });
  it("R06 duplicate targets are de-duplicated", async () => {
    const r = await run(await start(), { type: "select", mode: "replace", targets: [node(I1), node(I1)] });
    expect(r.state.selection).toEqual(sel([I1]));
  });
  it("R07 an unresolved target is atomic: nothing changes, the state is returned untouched", async () => {
    const s = await start();
    const before = JSON.stringify(s);
    expect(await errOfAsync2(() => run(s, { type: "select", mode: "replace", targets: [node(I1), node({ id: "i:9", type: "person" })] }))).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT");
    expect(JSON.stringify(s)).toBe(before);
  });
  it("R08 a hidden target is ELEMENT_HIDDEN for replace/add/toggle", async () => {
    const hidden = (await run(await start(), { type: "set-hidden", targets: [node(ANN)], hidden: true })).state;
    for (const mode of ["replace", "add", "toggle"]) expect(await errOfAsync2(() => run(hidden, { type: "select", mode, targets: [node(ANN)] })), mode).toBe("INVALID_INTENT/ELEMENT_HIDDEN");
    // the edge with a hidden endpoint is effectively hidden
    expect(await errOfAsync2(() => run(hidden, { type: "select", mode: "add", targets: [edge(E0)] }))).toBe("INVALID_INTENT/ELEMENT_HIDDEN");
  });
  it("unresolved is judged for all targets before hidden (two passes)", async () => {
    const hidden = (await run(await start(), { type: "set-hidden", targets: [node(ANN)], hidden: true })).state;
    expect(await errOfAsync2(() => run(hidden, { type: "select", mode: "add", targets: [node(ANN), node({ id: "i:9", type: "person" })] }))).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT");
  });
  it("R09 an intent whose result equals the input yields an equal state and no event", async () => {
    const s = (await run(await start(), { type: "select", mode: "replace", targets: [node(I1)] })).state;
    const r = await run(s, { type: "select", mode: "replace", targets: [node(I1)] });
    expect(r.state).toEqual(s);
    expect(r.events).toEqual([]);
    expect((await run(s, { type: "clear-selection" })).events.map((e) => e.type)).toEqual(["selection-changed"]);
    expect((await run(await start(), { type: "clear-selection" })).events).toEqual([]);
  });
  it("R35 events carry ObjectRef only: no index, pointer or pixel", async () => {
    const r = await run(await start(), { type: "select", mode: "replace", targets: [node(I1), edge(E0)] });
    expect(dec(serializeEvents(r.events))).toBe(`[{"selection":[{"address":{"id":"i:1","type":"person"},"artifact_sha256":"${ARTIFACT_O1}"},{"address":{"ord":"0","rel":"KNOWS","src":{"id":"i:1","type":"person"},"tgt":{"id":"s:ann","type":"person"}},"artifact_sha256":"${ARTIFACT_O1}"}],"type":"selection-changed"}]`);
  });
});

async function errOfAsync2(f: () => Promise<unknown>): Promise<string> {
  try { await f(); } catch (e) { return `${(e as { code: string }).code}/${(e as { reason?: string }).reason ?? ""}`; }
  return "no error";
}

describe("visibility (R10-R13, set-hidden)", () => {
  it("R10 hiding a node cascades to incident edges and drops them from selection and focus; events in the stated order", async () => {
    let s = (await run(await start(), { type: "select", mode: "replace", targets: [node(ANN), edge(E0), node(I1)] })).state;
    s = (await run(s, { type: "focus", target: edge(E0) })).state;
    const r = await run(s, { type: "set-hidden", targets: [node(ANN)], hidden: true });
    expect(r.state.hidden).toEqual(sel([ANN]));
    expect(r.state.selection).toEqual(sel([I1]));
    expect(r.state.focus).toBeUndefined();
    expect(evTypes(r.events)).toEqual(["visibility-changed", "selection-changed", "focus-changed"]);
    expect(r.events[0]).toEqual({ type: "visibility-changed", hidden: [{ artifact_sha256: ARTIFACT_O1, address: ANN }] });
    expect(r.events[2]).toEqual({ type: "focus-changed" }); // focus absent
  });
  it("R11 unhide restores nothing", async () => {
    let s = (await run(await start(), { type: "select", mode: "replace", targets: [node(ANN), node(I1)] })).state;
    s = (await run(s, { type: "set-hidden", targets: [node(ANN)], hidden: true })).state;
    const r = await run(s, { type: "set-hidden", targets: [node(ANN)], hidden: false });
    expect(r.state.hidden).toEqual(sel([]));
    expect(r.state.selection).toEqual(sel([I1]));
    expect(evTypes(r.events)).toEqual(["visibility-changed"]);
  });
  it("R12 an edge may be hidden explicitly while its endpoints are visible; hiding an already hidden or visible element is a no-op", async () => {
    const s0 = await start();
    const r = await run(s0, { type: "set-hidden", targets: [edge(E0)], hidden: true });
    expect(r.state.hidden).toEqual(sel([], [E0]));
    expect((await run(r.state, { type: "set-hidden", targets: [edge(E0)], hidden: true })).events).toEqual([]);
    expect((await run(s0, { type: "set-hidden", targets: [edge(E0)], hidden: false })).events).toEqual([]);
    // hiding a node that is already effectively hidden through nothing else, then hiding the incident edge explicitly is allowed
    const both = await run((await run(s0, { type: "set-hidden", targets: [node(ANN)], hidden: true })).state, { type: "set-hidden", targets: [edge(E0)], hidden: true });
    expect(both.state.hidden).toEqual(sel([ANN], [E0]));
  });
  it("R13 hiding the focused element clears focus", async () => {
    const s = (await run(await start(), { type: "focus", target: node(I1) })).state;
    const r = await run(s, { type: "set-hidden", targets: [node(I1)], hidden: true });
    expect(r.state.focus).toBeUndefined();
    expect(evTypes(r.events)).toEqual(["visibility-changed", "focus-changed"]);
  });
  it("set-hidden of an unresolved target is UNRESOLVED_ELEMENT", async () => {
    expect(await errOfAsync2(async () => run(await start(), { type: "set-hidden", targets: [node({ id: "i:9", type: "person" })], hidden: true }))).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT");
  });
});

describe("focus and traversal (R14-R19)", () => {
  it("R14/R16 steps through nodes then edges, skipping hidden elements", async () => {
    const m = await m20();
    let s = initialState(m, { width: 900, height: 600 });
    s = (await reduce(m, s, { type: "set-hidden", targets: [node(m.nodes[1]!.ref)], hidden: true })).state;
    const seen: string[] = [];
    for (let i = 0; i < 100; i++) {
      const r = reduce(m, s, { type: "focus-step", delta: 1 });
      if (r.events[0]?.type === "traversal-boundary") break;
      s = r.state;
      seen.push("node" in s.focus! ? "n:" + s.focus.node.id : "e:" + s.focus!.edge.ord);
    }
    expect(seen.filter((x) => x.startsWith("n:"))).toHaveLength(19);
    expect(seen.indexOf(seen.find((x) => x.startsWith("e:"))!)).toBe(19); // nodes first
    expect(seen.includes("n:" + m.nodes[1]!.ref.id)).toBe(false);
    const hiddenEdges = m.edges.filter((e) => e.src === 1 || e.tgt === 1).length;
    expect(seen).toHaveLength(19 + 37 - hiddenEdges);
  });
  it("R15 boundaries with no wrap, both ends", async () => {
    const s0 = await start();
    const first = (await run(s0, { type: "focus-first" })).state;
    const r = await run(first, { type: "focus-step", delta: -1 });
    expect(r.state).toEqual(first);
    expect(r.events).toEqual([{ type: "traversal-boundary", end: "start" }]);
    const last = (await run(s0, { type: "focus-last" })).state;
    expect(last.focus).toEqual({ edge: E0 });
    expect((await run(last, { type: "focus-step", delta: 1 })).events).toEqual([{ type: "traversal-boundary", end: "end" }]);
    expect((await run(last, { type: "focus-step", delta: -1 })).state.focus).toEqual({ node: ANN });
  });
  it("R17 first, last, step on an empty traversal are no-ops without events", async () => {
    const m = await buildRenderModel(igl("scenes/empty.scene.json"), igl("layouts/F07.layout.json"));
    const s = initialState(m, { width: 100, height: 100 });
    for (const i of [{ type: "focus-step", delta: 1 }, { type: "focus-step", delta: -1 }, { type: "focus-first" }, { type: "focus-last" }]) {
      const r = reduce(m, s, i);
      expect(r.state).toEqual(s); expect(r.events).toEqual([]);
    }
  });
  it("R18 step with no focus: +1 -> first element, -1 -> last", async () => {
    const s = await start();
    expect((await run(s, { type: "focus-step", delta: 1 })).state.focus).toEqual({ node: I1 });
    expect((await run(s, { type: "focus-step", delta: -1 })).state.focus).toEqual({ edge: E0 });
  });
  it("R19 focus an explicit target and clear it; focusing never selects; hidden target is refused; first/last when already there is silent", async () => {
    const s0 = await start();
    const r = await run(s0, { type: "focus", target: node(ANN) });
    expect(r.state.focus).toEqual({ node: ANN });
    expect(r.state.selection).toEqual(sel([]));
    expect(evTypes(r.events)).toEqual(["focus-changed"]);
    expect((await run(r.state, { type: "focus", target: node(ANN) })).events).toEqual([]);
    const cleared = await run(r.state, { type: "focus" });
    expect(cleared.state.focus).toBeUndefined();
    expect(cleared.events).toEqual([{ type: "focus-changed" }]);
    expect((await run(cleared.state, { type: "focus" })).events).toEqual([]);
    expect((await run(cleared.state, { type: "focus", target: undefined })).events).toEqual([]);
    const hidden = (await run(s0, { type: "set-hidden", targets: [node(ANN)], hidden: true })).state;
    expect(await errOfAsync2(() => run(hidden, { type: "focus", target: node(ANN) }))).toBe("INVALID_INTENT/ELEMENT_HIDDEN");
    const f = (await run(s0, { type: "focus-first" })).state;
    expect((await run(f, { type: "focus-first" })).events).toEqual([]);
  });
  it("R37 reserved V11 intents are UNKNOWN_TYPE", async () => {
    for (const t of ["focus-endpoint", "focus-incident", "lasso", ""]) expect(await errOfAsync2(async () => run(await start(), { type: t }))).toBe("INVALID_INTENT/UNKNOWN_TYPE");
  });
});

describe("viewport (R20-R33, R36, R38)", () => {
  it("R20 pan: sign and rounding; dx=0 is a no-op without an event", async () => {
    const s = await start();
    expect((await run(s, { type: "pan", dx: 0, dy: 0 })).events).toEqual([]);
    const r = await run(s, { type: "pan", dx: 3, dy: -4 });
    expect(r.state.viewport.center_x).toBe(383554 - 1505); // divRound(3e6, 1994) = 1504.5 -> 1505
    expect(r.state.viewport.center_y).toBe(134563 + 2006); // divRound(-4e6, 1994) = -2006.0 (exactly -2006.02) -> -2006
    expect(r.events).toEqual([{ type: "viewport-changed", viewport: r.state.viewport }]);
  });
  it("R21 zoom factor 1000 changes nothing; zoom 500 halves", async () => {
    const s = await start();
    expect((await run(s, { type: "zoom", factor_milli: 1000 })).events).toEqual([]);
    expect((await run(s, { type: "zoom", factor_milli: 500 })).state.viewport.zoom).toBe(997);
  });
  it("R22 zoom with an anchor outside the viewport", async () => {
    const s = await start();
    const r = await run(s, { type: "zoom", factor_milli: 2000, anchor: { x: -300, y: 1000 } });
    // u = -600-900 = -1500, v = 2000-600 = 1400; z = 1994 -> 3988
    const cx = 383554n + BigInt(Math.round(-1500e6 / (2 * 1994))) - BigInt(Math.round(-1500e6 / (2 * 3988)));
    expect(BigInt(r.state.viewport.center_x)).toBe(cx);
    const cy = 134563n + BigInt(Math.round(1400e6 / (2 * 1994))) - BigInt(Math.round(1400e6 / (2 * 3988)));
    expect(BigInt(r.state.viewport.center_y)).toBe(cy);
  });
  it("R23 clamp at min and max", async () => {
    const s = await start();
    const big = (await run(s, { type: "zoom", factor_milli: 1_000_000 })).state;
    expect(big.viewport.zoom).toBe(100000);
    const small = (await run(s, { type: "zoom", factor_milli: 1 })).state;
    expect(small.viewport.zoom).toBe(10);
    expect((await run(small, { type: "zoom", factor_milli: 1 })).events).toEqual([]); // R36 at ZOOM_MIN a small factor rounds back
    expect((await run(small, { type: "zoom", factor_milli: 1049 })).state.viewport.zoom).toBe(10);
  });
  it("R25 fit a single node (both spans 0) uses ZOOM_DEFAULT and centres it", async () => {
    const m = await buildRenderModel(igl("scenes/single.scene.json"), igl("layouts/F08.layout.json"));
    const s = initialState(m, { width: 640, height: 480 });
    const moved = reduce(m, s, { type: "set-viewport", center_x: 5, center_y: 5, zoom: 77 }).state;
    const r = reduce(m, moved, { type: "fit" });
    expect(r.state.viewport).toEqual(s.viewport);
    expect(r.state.viewport.zoom).toBe(1000);
  });
  it("R26 fit excludes hidden nodes; with all nodes hidden the viewport is unchanged", async () => {
    const m = await o1();
    const s0 = await start();
    const hiddenAnn = (await run(s0, { type: "set-hidden", targets: [node(ANN)], hidden: true })).state;
    const r = await run(hiddenAnn, { type: "fit" });
    expect(r.state.viewport.zoom).toBe(1000); // only i:1 remains: both spans are 0
    expect(r.state.viewport.center_x).toBe(173961);
    const allHidden = (await run(hiddenAnn, { type: "set-hidden", targets: [node(I1)], hidden: true })).state;
    const r2 = await run(allHidden, { type: "fit", padding: 5 });
    expect(r2.state.viewport).toEqual(allHidden.viewport);
    expect(r2.events).toEqual([]);
    void m;
  });
  it("R27/R28 fit padding too large or negative; fractional or non-number; boundary exactly w-2p = 1", async () => {
    const s = await start();
    expect(await errOfAsync2(() => run(s, { type: "fit", padding: 300 }))).toBe("INVALID_INTENT/OUT_OF_RANGE"); // 600 - 600 = 0 < 1
    expect(await errOfAsync2(() => run(s, { type: "fit", padding: 16385 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(s, { type: "fit", padding: -1 }))).toBe("INVALID_INTENT/INVALID_VALUE");
    expect(await errOfAsync2(() => run(s, { type: "fit", padding: 1.5 }))).toBe("INVALID_INTENT/INVALID_VALUE");
    expect(await errOfAsync2(() => run(s, { type: "fit", padding: "3" }))).toBe("INVALID_INTENT/SCHEMA");
    expect(await errOfAsync2(() => run(s, { type: "fit", padding: 299 }))).toBe("no error"); // h - 2p = 2
    expect(await errOfAsync2(() => run(s, { type: "fit", padding: 0 }))).toBe("no error");
  });
  it("R29 resize keeps centre and zoom", async () => {
    const s = await start();
    const r = await run(s, { type: "resize", width: 1000, height: 50 });
    expect(r.state.viewport).toEqual({ ...s.viewport, width: 1000, height: 50 });
    expect(await errOfAsync2(() => run(s, { type: "resize", width: 0, height: 5 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(s, { type: "resize", width: 5, height: 16385 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(s, { type: "resize", width: 5.5, height: 6 }))).toBe("INVALID_INTENT/INVALID_VALUE");
    expect((await run(s, { type: "resize", width: 900, height: 600 })).events).toEqual([]);
  });
  it("R30 set-viewport: out of range is an error, never a clamp", async () => {
    const s = await start();
    expect((await run(s, { type: "set-viewport", center_x: -7, center_y: 9, zoom: 10 })).state.viewport).toMatchObject({ center_x: -7, center_y: 9, zoom: 10, width: 900 });
    expect(await errOfAsync2(() => run(s, { type: "set-viewport", center_x: 0, center_y: 0, zoom: 9 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(s, { type: "set-viewport", center_x: 0, center_y: 0, zoom: 100001 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(s, { type: "set-viewport", center_x: 2 ** 53, center_y: 0, zoom: 10 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(s, { type: "set-viewport", center_x: 2 ** 53 - 1, center_y: -(2 ** 53 - 1), zoom: 10 }))).toBe("no error");
  });
  it("R31 fit on the extreme layouts igl:V45/V46 stays exact", async () => {
    for (const v of ["V45", "V46"]) {
      const m = await buildRenderModel(o1Scene(), igl(`verify/${v}.layout.json`));
      const s = initialState(m, { width: 900, height: 600 });
      expect(Number.isSafeInteger(s.viewport.center_x) && Number.isSafeInteger(s.viewport.center_y), v).toBe(true);
      expect(parseState(m, serializeState(m, s))).toEqual(s);
      expect(reduce(m, s, { type: "fit" }).state.viewport).toEqual(s.viewport);
    }
  });
  it("R32 pan overflow and R33 zoom-anchor overflow are OUT_OF_RANGE, never wraparound", async () => {
    const m = await o1();
    const far = reduce(m, await start(), { type: "set-viewport", center_x: 2 ** 53 - 1, center_y: 0, zoom: 10 }).state;
    expect(await errOfAsync2(() => run(far, { type: "pan", dx: -(2 ** 31), dy: 0 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(far, { type: "pan", dx: 2 ** 31 + 1, dy: 0 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(far, { type: "zoom", factor_milli: 1_000_000, anchor: { x: 2 ** 31, y: 0 } }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(far, { type: "zoom", factor_milli: 1000, anchor: { x: 2 ** 31 + 1, y: 0 } }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(far, { type: "zoom", factor_milli: 1_000_001 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await errOfAsync2(() => run(far, { type: "zoom", factor_milli: 0 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
  });
  it("R38 fit without padding succeeds on 1x1 and 64x64 viewports", async () => {
    const m = await o1();
    for (const [w, h] of [[1, 1], [64, 64], [65, 65], [2, 3]] as const) {
      const s = initialState(m, { width: w, height: h });
      expect(reduce(m, s, { type: "fit" }).state.viewport).toEqual(s.viewport);
    }
  });
  it("pan then the opposite pan returns within one rounding unit", async () => {
    const s = await start();
    for (const dx of [1, 7, -13, 250, 2 ** 20]) {
      const r = (await run((await run(s, { type: "pan", dx, dy: 0 })).state, { type: "pan", dx: -dx, dy: 0 })).state;
      expect(Math.abs(r.viewport.center_x - s.viewport.center_x)).toBeLessThanOrEqual(1);
    }
  });
});

describe("layoutToScreen (design section 6)", () => {
  it("maps with X = (x - cx) z + w 500000, as double pixels", async () => {
    const s = await start();
    const p = layoutToScreen(s.viewport, { x: 173961, y: 81203 });
    expect(p.x).toBeCloseTo(32.071558, 6);
    expect(p.y).toBeCloseTo(193.60016, 6);
    const q = layoutToScreen(s.viewport, { x: 593147, y: 187923 });
    expect(q.x).toBeCloseTo(867.928442, 6);
    expect(q.y).toBeCloseTo(406.39984, 6);
  });
});

describe("intent schema failures (R34)", () => {
  const bad = async (i: unknown) => errOfAsync2(async () => run(await start(), i));
  it("not an object and an intent without a type are SCHEMA; a type that is present but not a known string is UNKNOWN_TYPE (rev 4, 5.2)", async () => {
    for (const i of [null, undefined, 5, "pan", [], { }, { type: undefined }]) expect(await bad(i), JSON.stringify(i)).toBe("INVALID_INTENT/SCHEMA"); // R46
    for (const i of [{ type: 5 }, { type: null }, { type: "constructor" }, { type: "toString" }]) expect(await bad(i), JSON.stringify(i)).toBe("INVALID_INTENT/UNKNOWN_TYPE");
  });
  it("rev 3 order of checks: closed field set before numbers before TARGET_LIMIT before resolution before visibility", async () => {
    expect(await bad({ type: "pan", dx: "x", dy: 0, extra: 1 })).toBe("INVALID_INTENT/SCHEMA"); // field set first
    expect(await bad({ type: "zoom", factor_milli: 0, anchor: { x: 1 } })).toBe("INVALID_INTENT/OUT_OF_RANGE"); // factor_milli precedes the anchor
    const lim = async (i: unknown) => errOfAsync2(async () => run(await start(), i, undefined, { maxIntentTargets: 1 }));
    const ghost = { node: { id: "i:9", type: "person" } };
    expect(await lim({ type: "select", mode: "add", targets: [ghost, ghost] })).toBe("RESOURCE_LIMIT/TARGET_LIMIT"); // counted before de-duplication and before resolution
    expect(await lim({ type: "select", mode: "add", targets: [ghost] })).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT");
    expect(await lim({ type: "select", mode: "add", targets: [{ node: I1 }, { node: I1 }] })).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
  });
  it("an integer-valued double beyond the safe range is OUT_OF_RANGE in an intent, a boolean where a number belongs is SCHEMA", async () => {
    expect(await bad({ type: "set-viewport", center_x: 1e300, center_y: 0, zoom: 10 })).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(await bad({ type: "pan", dx: true, dy: 0 })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "resize", width: 2 ** 60, height: 1 })).toBe("INVALID_INTENT/OUT_OF_RANGE");
  });
  it("rev 4 order: the fields of an intent in their stated order, then TARGET_LIMIT counting malformed targets too, then resolution", async () => {
    const lim = async (i: unknown) => errOfAsync2(async () => run(await start(), i, undefined, { maxIntentTargets: 1 }));
    expect(await lim({ type: "set-hidden", targets: [{ node: 1 }], hidden: "x" })).toBe("INVALID_INTENT/SCHEMA"); // hidden before TARGET_LIMIT
    expect(await lim({ type: "set-hidden", targets: [{ node: {} }, { node: {} }], hidden: true })).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
    expect(await lim({ type: "zoom", factor_milli: 0, anchor: 5 })).toBe("INVALID_INTENT/OUT_OF_RANGE"); // factor_milli before the anchor
    expect(await bad({ type: "zoom", factor_milli: 1000, anchor: 5 })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "zoom", factor_milli: 1000, anchor: { x: 1, y: 2, z: 3 } })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "fit", padding: 300 })).toBe("INVALID_INTENT/OUT_OF_RANGE"); // the size rule is part of the field check
    expect(await bad({ type: "select", mode: "add", targets: [{ node: { id: "i:1", type: "person" } }, { edge: { ord: "0" } }] })).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT");
  });
  it("extra field, missing field", async () => {
    expect(await bad({ type: "pan", dx: 1, dy: 2, extra: 1 })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "pan", dx: 1 })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "clear-selection", x: 1 })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "select", mode: "replace" })).toBe("INVALID_INTENT/SCHEMA");
  });
  it("NaN, Infinity: NOT_FINITE; fraction: INVALID_VALUE; string: SCHEMA", async () => {
    expect(await bad({ type: "pan", dx: NaN, dy: 0 })).toBe("INVALID_INTENT/NOT_FINITE");
    expect(await bad({ type: "pan", dx: 0, dy: Infinity })).toBe("INVALID_INTENT/NOT_FINITE");
    expect(await bad({ type: "pan", dx: 1.5, dy: 0 })).toBe("INVALID_INTENT/INVALID_VALUE");
    expect(await bad({ type: "pan", dx: "1", dy: 0 })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "zoom", factor_milli: 1500.5 })).toBe("INVALID_INTENT/INVALID_VALUE");
    expect(await bad({ type: "zoom", factor_milli: 1000, anchor: { x: 1 } })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "zoom", factor_milli: 1000, anchor: { x: NaN, y: 0 } })).toBe("INVALID_INTENT/NOT_FINITE");
  });
  it("select/set-hidden/focus value rules", async () => {
    expect(await bad({ type: "select", mode: "weird", targets: [] })).toBe("INVALID_INTENT/INVALID_VALUE");
    expect(await bad({ type: "select", mode: 3, targets: [] })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "select", mode: "add", targets: "x" })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "select", mode: "add", targets: [{}] })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "select", mode: "add", targets: [{ node: I1, edge: E0 }] })).toBe("INVALID_INTENT/SCHEMA");
    // rev 4 (5.2 step 3): only the CONTAINER is checked before TARGET_LIMIT; anything wrong inside the address names nothing
    expect(await bad({ type: "select", mode: "add", targets: [{ node: { id: "i:1" } }] })).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT"); // R42
    expect(await bad({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: 5 } }] })).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT"); // R43
    expect(await bad({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person", extra: 1 } }] })).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT"); // R44
    for (const targets of [[{}], [{ node: {}, edge: {} }], [{ node: 5 }], [5], [{ node: null }], [{ node: [] }], [null]]) expect(await bad({ type: "select", mode: "replace", targets }), JSON.stringify(targets)).toBe("INVALID_INTENT/SCHEMA"); // R45
    expect(await bad({ type: "select", mode: "bogus", targets: 5 })).toBe("INVALID_INTENT/INVALID_VALUE"); // R48: mode is checked at its field position, before targets
    expect(await bad({ type: "select", mode: "replace", targets: 5 })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "set-hidden", targets: [], hidden: "true" })).toBe("INVALID_INTENT/SCHEMA"); // R50
    // an own property whose value is undefined is absent
    expect(await bad({ type: "focus", target: undefined })).toBe("no error");
    expect(await bad({ type: "fit", padding: undefined })).toBe("no error");
    expect(await bad({ type: "zoom", factor_milli: 1000, anchor: undefined })).toBe("no error");
    expect(await bad({ type: "pan", dx: undefined, dy: 0 })).toBe("INVALID_INTENT/SCHEMA"); // required: missing
    expect(await bad({ type: "set-hidden", targets: [], hidden: "yes" })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "focus-step", delta: 2 })).toBe("INVALID_INTENT/INVALID_VALUE");
    expect(await bad({ type: "focus-step", delta: 0 })).toBe("INVALID_INTENT/INVALID_VALUE");
    expect(await bad({ type: "focus-step" })).toBe("INVALID_INTENT/SCHEMA");
    expect(await bad({ type: "focus", target: { node: { id: "i:01", type: "person" } } })).toBe("INVALID_INTENT/UNRESOLVED_ELEMENT");
  });
  it("a throwing getter is INVALID_INTENT/SCHEMA and every property is read once", async () => {
    const m = await o1(); const s = await start();
    expect(errOf(() => reduce(m, s, { type: "pan", get dx(): number { throw new Error("x"); }, dy: 0 }))).toBe("INVALID_INTENT/SCHEMA");
    let reads = 0;
    const intent = { type: "pan", get dx() { reads++; return reads === 1 ? 10 : 99; }, dy: 0 };
    expect(reduce(m, s, intent).state.viewport.center_x).toBe(378539);
    expect(reads).toBe(1);
  });
  it("rejects a non-model and an invalid state before anything else", async () => {
    expect(errOf(() => reduce({} as never, {} as never, { type: "fit" }))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    expect(errOf(() => reduce(O1, { igr: "IGR/1" } as never, { type: "fit" }))).toBe("INVALID_STATE/MISSING_FIELD");
  });
});

describe("TARGET_LIMIT (R39-R41, design 15)", () => {
  it("R39/R40 exactly maxIntentTargets succeeds, one more is TARGET_LIMIT; limits are inclusive", async () => {
    const s = await start();
    const t = [node(I1), node(ANN)];
    expect((await run(s, { type: "select", mode: "add", targets: t }, undefined, { maxIntentTargets: 2 })).state.selection.nodes).toHaveLength(2);
    expect(await errOfAsync2(() => run(s, { type: "select", mode: "add", targets: t }, undefined, { maxIntentTargets: 1 }))).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
    expect(await errOfAsync2(() => run(s, { type: "set-hidden", targets: t, hidden: true }, undefined, { maxIntentTargets: 1 }))).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
  });
  it("address text over maxSceneBytes is TARGET_LIMIT (the sum of the UTF-16 lengths of every string inside every target address)", async () => {
    const s = await start();
    const len = "i:1".length + "person".length; // one node target
    expect(await errOfAsync2(() => run(s, { type: "select", mode: "add", targets: [node(I1)] }, undefined, { maxSceneBytes: len }))).toBe("no error");
    expect(await errOfAsync2(() => run(s, { type: "select", mode: "add", targets: [node(I1)] }, undefined, { maxSceneBytes: len - 1 }))).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
    const e = "0".length + "KNOWS".length + ("i:1".length + "person".length) + ("s:ann".length + "person".length); // an edge target counts ord, rel and both endpoints
    expect(await errOfAsync2(() => run(s, { type: "select", mode: "add", targets: [edge(E0)] }, undefined, { maxSceneBytes: e }))).toBe("no error");
    expect(await errOfAsync2(() => run(s, { type: "select", mode: "add", targets: [edge(E0)] }, undefined, { maxSceneBytes: e - 1 }))).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
  });
  it("R41 select-all of every element of mixed20 under default limits succeeds", async () => {
    const m = await m20();
    const all = [...m.nodes.map((n) => node(n.ref)), ...m.edges.map((e) => edge(e.ref))];
    const r = reduce(m, initialState(m, { width: 900, height: 600 }), { type: "select", mode: "replace", targets: all });
    expect(r.state.selection.nodes).toHaveLength(20);
    expect(r.state.selection.edges).toHaveLength(37);
  });
});

describe("reducer properties", () => {
  it("never mutates its arguments; output sets always sorted and unique; focus always effectively visible", async () => {
    const m = await m20();
    let s = initialState(m, { width: 900, height: 600 });
    let rng = 12345 >>> 0;
    const next = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0);
    const pick = () => (next() % 3 === 0 && m.edges.length ? edge(m.edges[next() % m.edges.length]!.ref) : node(m.nodes[next() % m.nodes.length]!.ref));
    for (let i = 0; i < 400; i++) {
      const k = next() % 8;
      const intent: unknown = k === 0 ? { type: "select", mode: ["replace", "add", "remove", "toggle"][next() % 4], targets: [pick(), pick()] }
        : k === 1 ? { type: "set-hidden", targets: [pick()], hidden: next() % 2 === 0 }
        : k === 2 ? { type: "focus-step", delta: next() % 2 ? 1 : -1 }
        : k === 3 ? { type: "focus", target: pick() }
        : k === 4 ? { type: "pan", dx: (next() % 200) - 100, dy: (next() % 200) - 100 }
        : k === 5 ? { type: "zoom", factor_milli: 500 + (next() % 2000), anchor: { x: next() % 900, y: next() % 600 } }
        : k === 6 ? { type: "fit" } : { type: "clear-selection" };
      const before = JSON.stringify(s);
      let r;
      try { r = reduce(m, s, intent); } catch (e) { expect((e as { code: string }).code).toBe("INVALID_INTENT"); expect(JSON.stringify(s)).toBe(before); continue; }
      expect(JSON.stringify(s)).toBe(before);
      s = r.state;
      expect(() => serializeState(m, s)).not.toThrow(); // sorted, unique, resolvable, selection/focus visible
    }
  });
});
void (null as unknown as Intent);
