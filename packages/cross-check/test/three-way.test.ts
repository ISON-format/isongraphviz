// XR-1 (design 9.5): the three-way cross-renderer semantic readout check. For a render model M, a state s and the shared label options o:
//   L = buildDisplayList(M, s, o)
//   rho_svg = readoutFromSvgReadout(readSvg(renderSvg(M, s, o)))      V5, its own writer, its own reader (independent of L for what the readout contains)
//   rho_cv  = readoutFromCanvasStream(recordCanvasCalls(L), L)         a projection of L
//   rho_gl  = readoutFromGl(planGl(L))                                  a projection of L
//   rho_dl  = readoutFromList(L)                                        a projection of L
// XR-1 holds iff the four are byte-identical and `drawn`, `marked` equal those of every renderer's probe().
//
// WHAT THIS PROVES AND WHAT IT DOES NOT (9.5, stated plainly; the README repeats it):
//  * INDEPENDENT: V5's SVG renderer (own writer, own reader, own DOM) against the display list for what the readout contains (presence, marks, node centres,
//    label text); and the Python oracle's bytes (oracles-dl xr/Rnn) against every one of the four.
//  * BY CONSTRUCTION, NOT INDEPENDENT: rho_dl, rho_cv and rho_gl are projections of ONE list built by ONE function. Their agreement proves that the Canvas
//    executor and the plan encoder follow the list, not that the list is right. Canvas and WebGL label agreement is the same replay over the same text records.
//  * NOT COMPARED: edge routes and label positions (only the parity test C-V5 below compares them with V5's printed numbers), ring and halo shapes, colours,
//    fonts, pixels, hidden-by-guard geometry. XR-1 does not prove pixel equality, equal glyphs, or that a human sees the same graph.
import { describe, expect, it } from "vitest";
import { compareReadouts, serializeReadout, type Readout } from "isongraph-visualize-display-list";
import { createCanvasRenderer } from "isongraph-visualize-renderer-canvas";
import { createSvgRenderer } from "isongraph-visualize-renderer-svg";
import { createWebglRenderer } from "isongraph-visualize-renderer-webgl";
import { DL_DIGEST, DL_DIR, SVG_DIGEST, SVG_DIR, bytes, digestOf, loadRows, read, readText, readouts, scene, text, type Row } from "./helpers.js";

const ENV = { host: "headless", size: { width: 900, height: 600 }, reducedMotion: false };

describe("the corpora read as data are the ones this harness was written against (13.1)", () => {
  it("oracles-svg SHA256SUMS is 6d979238... and oracles-dl SHA256SUMS is 3ac2b0cc...", () => {
    expect(digestOf(SVG_DIR)).toBe(SVG_DIGEST);
    expect(digestOf(DL_DIR)).toBe(DL_DIGEST);
  });
});

/** XR-1 on one scene: the four readouts are byte-identical, compareReadouts agrees, and drawn and marked equal every renderer's probe(). */
async function xr1(row: Row, dir: string): Promise<{ applicable: boolean; bytesEqual: boolean }> {
  const { model, state, options, size } = await scene(dir, row);
  let r: ReturnType<typeof readouts>;
  try { r = readouts(model, state, options); }
  catch (e) { expect((e as { reason?: string }).reason, `${row.id}: only the refusal of 3.5 may stop a readout`).toBe("OUT_OF_RANGE"); return { applicable: false, bytesEqual: false }; }
  const ref = bytes(r.dl);
  expect(bytes(r.svg), `${row.id} rho_svg`).toBe(ref);
  expect(bytes(r.canvas), `${row.id} rho_cv`).toBe(ref);
  expect(bytes(r.gl), `${row.id} rho_gl`).toBe(ref);
  const cmp = compareReadouts([{ renderer: "svg", readout: r.svg }, { renderer: "canvas", readout: r.canvas }, { renderer: "webgl", readout: r.gl }, { renderer: "list", readout: r.dl }]);
  expect(cmp, `${row.id} compareReadouts`).toEqual({ agree: true, differences: [] });
  // drawn and marked equal the probe() of every renderer built with the same options
  const budget = options.maxDrawnLabelUnits;
  // a label budget of 0 is legal for a list (4.5) but no renderer can declare a capacity of 0 (design rev 5: V5, V6 and V7 refuse it): no probe() to compare
  const rend = budget === 0 ? [] : ([
    ["svg", createSvgRenderer({ svg: { ...options } } as never)],
    ["canvas", createCanvasRenderer({ dl: options })],
    ["webgl", createWebglRenderer({ dl: options })],
  ] as const);
  for (const [name, renderer] of rend) {
    await renderer.initialize({ ...ENV, size } as never);
    await renderer.loadScene(model, state);
    const rep = renderer.probe();
    expect(rep.drawn, `${row.id} ${name} probe().drawn`).toEqual(r.dl.drawn);
    expect(rep.marked, `${row.id} ${name} probe().marked`).toEqual(r.dl.marked);
    await renderer.dispose();
  }
  return { applicable: true, bytesEqual: true };
}

describe("XR-1 over the scenes of oracles-svg (V5's rows G, N, X, Y and the label-option rows of O)", () => {
  const rows = loadRows(SVG_DIR).filter((r) => /^(G|N|X|Y|O)\d+b?$/.test(r.id) && r.expected.endsWith(".svg") && r.scene !== "");
  it("covers at least 60 scenes", () => { expect(rows.length).toBeGreaterThanOrEqual(60); });
  const results: Record<string, boolean> = {};
  for (const row of rows) {
    const input = JSON.parse(row.input) as { options?: Record<string, unknown> };
    const keys = Object.keys(input.options ?? {});
    if (keys.some((k) => !["labels", "edgeLabels", "maxDrawnLabelUnits"].includes(k))) continue; // an SVG-only option (idPrefix, style, xmlDeclaration): not a shared one
    it(`${row.id}`, async () => { results[row.id] = (await xr1(row, SVG_DIR)).applicable; });
  }
  it("reports what was applicable: the states for which buildDisplayList refuses (3.5) are exactly those the design names (N11, N12)", () => {
    const refused = Object.entries(results).filter(([, ok]) => !ok).map(([id]) => id).sort();
    console.log(`[xr-1] applicable ${Object.values(results).filter(Boolean).length} of ${Object.keys(results).length}; not applicable (list refuses, 3.5): ${refused.join(",") || "none"}`);
    expect(refused).toEqual(["N11", "N12"]);
  });
});

describe("XR-1 against the Python oracle's bytes (oracles-dl rows R of the form {from: list}, expected xr/Rnn.xr.json)", () => {
  const rows = loadRows(DL_DIR).filter((r) => r.group === "R" && r.scene !== "" && r.input.includes('"from":"list"'));
  it("there are 15 or more such rows", () => { expect(rows.length).toBeGreaterThanOrEqual(15); });
  for (const row of rows) {
    it(`${row.id}: all four readouts are the expected bytes (the SVG one only where V5 renders the state and the list does not refuse it)`, async () => {
      const { model, state, options } = await scene(DL_DIR, row);
      const want = text(read(DL_DIR, row.expected));
      const r = readouts(model, state, options);
      expect(bytes(r.dl)).toBe(want);
      expect(bytes(r.canvas)).toBe(want);
      expect(bytes(r.gl)).toBe(want);
      expect(bytes(r.svg), `${row.id} rho_svg`).toBe(want);
    });
  }
});

describe("D06: a harness double that derives its readout from probe() must fail (design 9.5, dl:D06)", () => {
  it("a readout built from a renderer's own report differs from the artifact readouts, and compareReadouts names the paths", async () => {
    const row = loadRows(SVG_DIR).find((r) => r.id === "G01")!;
    const { model, state, options, size } = await scene(SVG_DIR, row);
    const four = readouts(model, state, options);
    const r = createCanvasRenderer();
    await r.initialize({ ...ENV, size } as never);
    await r.loadScene(model, state);
    const rep = r.probe();
    // everything a report can say: which elements are drawn and marked. It cannot say where a node is, what text a label shows, or whether an arrow exists.
    const cheat: Readout = {
      ...four.dl, drawn: rep.drawn as never, marked: rep.marked as never, nodes_at: [], nodes_far: rep.drawn.nodes as never, arrows: [], labels: { nodes: [], edges: [] }, label_units: 0,
    };
    expect(bytes(cheat)).not.toBe(bytes(four.dl));
    const cmp = compareReadouts([{ renderer: "cheat", readout: cheat }, { renderer: "svg", readout: four.svg }]);
    expect("agree" in cmp && cmp.agree).toBe(false);
    expect(cmp).toMatchObject({ differences: expect.arrayContaining([expect.objectContaining({ path: "nodes_at" })]) });
    // and the honest drawn and marked parts DO agree: the cheat is caught on what only the artifacts contain (9.5)
    expect(rep.drawn).toEqual(four.dl.drawn);
    expect(rep.marked).toEqual(four.dl.marked);
    expect(serializeReadout(four.canvas)).toEqual(serializeReadout(four.dl));
  });
});

describe("a regression the harness must see: if one artifact drops an element, XR-1 differs", () => {
  it("a Canvas stream with a node's painting removed gives a readout that is not the list's", async () => {
    const row = loadRows(SVG_DIR).find((r) => r.id === "G05")!;
    const { model, state, options } = await scene(SVG_DIR, row);
    const four = readouts(model, state, options);
    const { recordCanvasCalls, readoutFromCanvasStream } = await import("isongraph-visualize-display-list/canvas2d");
    const lines = text(recordCanvasCalls(four.list)).split("\n");
    const at = lines.findIndex((l) => l.endsWith(',7]') && l.startsWith('["#"'));
    const cut = [...lines.slice(0, at), ...lines.slice(at + 1).filter((l, i, a) => { const before = a.slice(0, i); const seenMarker = before.some((x) => x.startsWith('["#"')); return seenMarker || l.startsWith('["#"'); })].join("\n");
    const broken = readoutFromCanvasStream(new TextEncoder().encode(cut), four.list);
    expect(bytes(broken)).not.toBe(bytes(four.dl));
  });
});

describe("the document the harness reads is V5's own (independence of the SVG side)", () => {
  it("the SVG readout comes from renderSvg's text, parsed by V5's reader, not from the display list", () => {
    const g01 = readText(SVG_DIR, "svg/G01.svg");
    expect(g01.startsWith("<svg")).toBe(true);
  });
});

describe("design rev 5: a RENDERER with a label budget of 0 is refused by V5, V6 and V7 alike (the codes differ, the refusal does not)", () => {
  it("createSvgRenderer, createCanvasRenderer and createWebglRenderer all throw, while the display-list builder accepts 0", async () => {
    const throws = (f: () => unknown): boolean => { try { f(); return false; } catch { return true; } };
    expect(throws(() => createSvgRenderer({ svg: { maxDrawnLabelUnits: 0 } } as never))).toBe(true);
    expect(throws(() => createCanvasRenderer({ dl: { maxDrawnLabelUnits: 0 } }))).toBe(true);
    expect(throws(() => createWebglRenderer({ dl: { maxDrawnLabelUnits: 0 } }))).toBe(true);
    const row = loadRows(SVG_DIR).find((r) => r.id === "G01")!;
    const { model, state } = await scene(SVG_DIR, row);
    expect(readouts(model, state, { maxDrawnLabelUnits: 0 }).list.records.some((r) => r[0] === "T")).toBe(false);
  });
});
