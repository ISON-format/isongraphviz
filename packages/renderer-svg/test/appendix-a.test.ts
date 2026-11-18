// Design 15.7 (1): Appendix A as unit tests. The code blocks and quoted sizes/SHA-256 values are EXTRACTED from the design file
// (docs/isongraph-visualize-blueprint/30-SVG-RENDERER-DESIGN.md, git-ignored and local) and compared with the implementation's output.
// If the design file is absent the whole file is skipped, loudly (see the skip reason in the describe title).
import { describe, expect, it } from "vitest";
import { hitTest, reduce, initialState, type ElementAddress, type SemanticState } from "isongraph-visualize-renderer-core";
import { renderSvg, renderSvgDetailed, pickElement, elementDomId } from "../src/index.js";
import { MIXED20, O1, O4, SIZE, blockAfter, designText, loadModel, o1, sha256 } from "./helpers.js";

const md = designText();
const NOTE = "SKIPPED: design file docs/isongraph-visualize-blueprint/30-SVG-RENDERER-DESIGN.md is not present (it is git-ignored and local)";
if (md === undefined) console.warn(`[appendix-a] ${NOTE}`);
const text = md ?? "";
const bytes = (s: string): number => new TextEncoder().encode(s).length;

const I1: ElementAddress = { node: { id: "i:1", type: "person" } };
const ANN: ElementAddress = { node: { id: "s:ann", type: "person" } };
const KNOWS: ElementAddress = { edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } };

describe.skipIf(md === undefined)(md === undefined ? `Appendix A extraction (${NOTE})` : "Appendix A extraction", () => {
  it("A.1: the extracted block (plus the final LF) equals renderSvg of O1/F01; 3193 bytes; SHA-256 265736b6...", async () => {
    const { model, state } = await o1();
    const block = blockAfter(text, "**A.1 `renderSvg(O1/F01, initial, {})`");
    expect(block.startsWith("<svg xmlns=")).toBe(true);
    expect(block.endsWith("</svg>")).toBe(true);
    expect(bytes(block)).toBe(3192);
    const doc = renderSvg(model, state, {});
    expect(doc).toBe(block + "\n");
    expect(bytes(doc)).toBe(3193);
    expect(sha256(doc)).toBe("265736b6b7523681b589fcda23a20a10b574601c603e473bd78c7df7d1977653");
    // the quoted figures in the design text itself
    expect(text).toContain("3193 bytes, SHA-256 `265736b6b7523681b589fcda23a20a10b574601c603e473bd78c7df7d1977653`");
  });

  it("A.2 (hooks): from <g class=\"igr-nodes\"> on equals the block, the desc line differs; 3441 bytes; SHA-256 d2db035d...", async () => {
    const { model, state } = await o1();
    let s: SemanticState = reduce(model, state, { type: "select", mode: "replace", targets: [I1, KNOWS] }).state;
    s = reduce(model, s, { type: "focus", target: ANN }).state;
    const doc = renderSvg(model, s, {});
    const block = blockAfter(text, "**A.2 Hooks.**");
    expect(doc.slice(doc.indexOf('<g class="igr-nodes">'))).toBe(block + "\n");
    expect(doc).toContain('<desc id="igr-desc">2 selected, 0 hidden. Focus: person ann.</desc>');
    expect(bytes(doc)).toBe(3441);
    expect(sha256(doc)).toBe("d2db035d11252ee3be86cd4259ca11cdd0cd55178abd5bf8df15deedf5739261");
    // differs from A.1 only in the desc line and from the nodes group on
    const base = renderSvg(model, state, {});
    expect(doc.slice(0, doc.indexOf("<desc"))).toBe(base.slice(0, base.indexOf("<desc")));
  });

  it("A.3 (hidden s:ann): block, 2242 bytes, SHA-256 6694f5e2...", async () => {
    const { model, state } = await o1();
    const s = reduce(model, state, { type: "set-hidden", targets: [ANN], hidden: true }).state;
    const doc = renderSvg(model, s, {});
    expect(doc.slice(doc.indexOf('<g class="igr-nodes">'))).toBe(blockAfter(text, "**A.3 Hidden**") + "\n");
    expect(doc).toContain('<desc id="igr-desc">0 selected, 2 hidden.</desc>');
    expect(bytes(doc)).toBe(2242);
    expect(sha256(doc)).toBe("6694f5e23e261cf442409f627115d94650a70e7a16f11528209e03c88c0254fd");
  });

  it("A.4: the degenerate edge at zoom 10 (three lines)", async () => {
    const { model, state } = await o1();
    const s = reduce(model, state, { type: "set-viewport", center_x: 383554, center_y: 134563, zoom: 10 }).state;
    const doc = renderSvg(model, s, {});
    const block = blockAfter(text, "**A.4 Degenerate edge");
    expect(doc).toContain(block + "\n");
  });

  it("A.5: the four ids (type p) quoted in the design", () => {
    const ids: [string, string][] = [["i:7", "igr-n-7b226964223a22693a37222c2274797065223a2270227d"], ["s:7", "igr-n-7b226964223a22733a37222c2274797065223a2270227d"],
      ["s:007", "igr-n-7b226964223a22733a303037222c2274797065223a2270227d"], ["s:-0", "igr-n-7b226964223a22733a2d30222c2274797065223a2270227d"]];
    for (const [id, want] of ids) { expect(text).toContain("`" + want + "`"); expect(elementDomId("igr", { node: { id, type: "p" } })).toBe(want); }
  });

  it("A.9: option sizes on G01 (3232, 2207, 2965, 3118, 3193)", async () => {
    const { model, state } = await o1();
    expect(text).toContain("`xmlDeclaration: true` prepends `<?xml version=\"1.0\" encoding=\"UTF-8\"?>` and LF (3232)");
    const sizes: [Record<string, unknown>, number, string?][] = [
      [{ xmlDeclaration: true }, 3232], [{ style: false }, 2207], [{ labels: false }, 2965, "none"], [{ edgeLabels: false }, 3118], [{ idPrefix: "g-1" }, 3193],
    ];
    for (const [o, n, labels] of sizes) {
      const r = renderSvgDetailed(model, state, o);
      expect(r.bytes, JSON.stringify(o)).toBe(n);
      expect(bytes(r.svg)).toBe(n);
      if (labels) expect(r.fidelity.labels).toBe(labels);
    }
    expect(renderSvg(model, state, { xmlDeclaration: true }).startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')).toBe(true);
    const g1 = renderSvg(model, state, { idPrefix: "g-1" });
    for (const t of ['id="g-1-title"', 'id="g-1-desc"', 'id="g-1-arrow"', "url(#g-1-arrow)", 'id="g-1-n-', 'id="g-1-e-', 'aria-labelledby="g-1-title"', 'aria-describedby="g-1-desc"']) expect(g1).toContain(t);
    expect(g1).not.toContain("igr-title");
    expect(g1).toContain('class="igr-svg"');
  });

  it("A.8: self-loop and the straight edge of O4/F02", async () => {
    const model = await loadModel(O4.scene, O4.layout);
    const doc = renderSvg(model, initialState(model, SIZE), {});
    expect(doc).toContain('d="M 860.928 399.4 C 852.928 375.4 882.928 375.4 874.928 399.4"');
    expect(doc).toContain('<text class="igr-elabel" x="867.928" y="377.4" text-anchor="middle">R</text>');
    expect(doc).toContain('d="M 43.701 196.561 L 856.299 403.439"');
    expect(doc).not.toContain("<defs>");
    expect(doc).not.toContain("marker-end");
    expect(text).toContain("`d=\"M 860.928 399.4 C 852.928 375.4 882.928 375.4 874.928 399.4\"`");
  });

  it("A.8: mixed20 parallel groups (edges 7, 26, 1, 28)", async () => {
    const model = await loadModel(MIXED20.scene, MIXED20.layout);
    const state = initialState(model, SIZE);
    expect(state.viewport.center_x).toBe(450000);
    expect(state.viewport.center_y).toBe(300000);
    expect(state.viewport.zoom).toBe(1071);
    const doc = renderSvg(model, state, {});
    for (const d of ["M 48.069 172.326 Q 189.356 201.653 321.708 259.139", "M 320.965 261.481 Q 179.679 232.155 47.326 174.668",
      "M 634.051 343.641 Q 742.786 313.185 855.692 311.353", "M 856.135 314.395 Q 747.399 344.851 634.494 346.683"]) {
      expect(doc).toContain(`d="${d}"`);
      expect(text).toContain(d);
    }
  });

  it("A.8: extreme coordinates (O1 + V45)", async () => {
    const model = await loadModel(O1.scene, "../oracles-igl/verify/V45.layout.json");
    const s = initialState(model, SIZE);
    expect(s.viewport.center_x).toBe(4503599627667069);
    const doc = renderSvg(model, s, {});
    expect(doc).toContain('cx="45035996720.739" cy="299.466"');
    expect(doc).toContain('cx="-45035995820.739" cy="300.534"');
    expect(doc).toContain('d="M 45035996708.739 299.466 L -45035995808.739 300.534"');
  });

  it("A.7 and A.10: click chain numbers and the hit limitation", async () => {
    const { model, state } = await o1();
    const P = "igr";
    expect(pickElement(model, state, P, { point: { x: 32.0, y: 193.5 } })).toEqual(I1);
    expect(pickElement(model, state, P, { targetId: elementDomId(P, I1) })).toEqual(I1);
    expect(pickElement(model, state, P, { point: { x: 500, y: 308 } })).toEqual(KNOWS);
    expect(pickElement(model, state, P, { point: { x: 500, y: 300 } })).toBeUndefined();
    expect(pickElement(model, state, P, { point: { x: 867.9, y: 406.4 } })).toEqual(ANN);
    // A.10: mixed20 edges 7 and 26; the chord midpoint belongs to edge 7 by hitTest; the id decides for edge 26
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const st = initialState(m, SIZE);
    const e7 = { edge: m.edges[7]!.ref }, e26 = { edge: m.edges[26]!.ref };
    expect(hitTest(m, st, { x: 184.517, y: 216.904 })).toEqual(e7);
    expect(pickElement(m, st, P, { targetId: elementDomId(P, e26), point: { x: 184.517, y: 216.904 } })).toEqual(e26);
    expect(hitTest(m, st, { x: 187.122, y: 208.693 })).toBeUndefined();
    expect(hitTest(m, st, { x: 181.912, y: 225.115 })).toBeUndefined();
    const m4 = await loadModel(O4.scene, O4.layout);
    expect(hitTest(m4, initialState(m4, SIZE), { x: 867.928, y: 381.4 })).toBeUndefined();
    // T31-style: node wins over the KNOWS edge target within the hit radius (zoom 10)
    const z10 = reduce(model, state, { type: "set-viewport", center_x: 383554, center_y: 134563, zoom: 10 }).state;
    expect(pickElement(model, z10, P, { targetId: elementDomId(P, KNOWS), point: { x: 447.904, y: 299.466 } })).toEqual(I1);
  });

  it("A.6: budget on G01 with maxDrawnLabelUnits 9, 8 and 0", async () => {
    const { model, state } = await o1();
    const r9 = renderSvgDetailed(model, state, { maxDrawnLabelUnits: 9 });
    expect(r9.fidelity.labels).toBe("full"); expect(r9.label_units).toBe(9);
    const r8 = renderSvgDetailed(model, state, { maxDrawnLabelUnits: 8 });
    expect(r8.fidelity.labels).toBe("elided"); expect(r8.svg).not.toContain("<text class=\"igr-elabel\"");
    const r0 = renderSvgDetailed(model, state, { maxDrawnLabelUnits: 0 });
    expect(r0.fidelity.labels).toBe("elided"); expect(r0.svg).not.toContain("<text");
  });
});
