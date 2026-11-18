// Audit M-3: the Appendix A figures asserted from TRACKED files, so that they run on a fresh clone where the git-ignored design file is absent
// (test/appendix-a.test.ts extracts the same blocks from the design and is skipped there). The bytes come from the oracle documents G01, Y03, Y07, N14,
// O01-O05, G02, G05, N11 under fixtures/oracles-svg (SHA256SUMS-covered); the literal figures below are those of design 30 Appendix A.
import { describe, expect, it } from "vitest";
import { hitTest, initialState, reduce, type ElementAddress } from "isongraph-visualize-renderer-core";
import { elementDomId, pickElement, renderSvg, renderSvgDetailed } from "../src/index.js";
import { MIXED20, O1, O4, SIZE, loadModel, o1, readOracleText, sha256 } from "./helpers.js";

const bytes = (s: string): number => new TextEncoder().encode(s).length;
const I1: ElementAddress = { node: { id: "i:1", type: "person" } };
const ANN: ElementAddress = { node: { id: "s:ann", type: "person" } };
const KNOWS: ElementAddress = { edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } };
const fromNodes = (d: string): string => d.slice(d.indexOf('<g class="igr-nodes">'));

describe("Appendix A from the tracked oracle files (runs without the design file)", () => {
  it("A.1: G01 is 3193 bytes with SHA-256 265736b6... and the implementation writes it", async () => {
    const g01 = readOracleText("svg/G01.svg");
    expect(bytes(g01)).toBe(3193);
    expect(sha256(g01)).toBe("265736b6b7523681b589fcda23a20a10b574601c603e473bd78c7df7d1977653");
    expect(g01.startsWith("<svg xmlns=")).toBe(true);
    expect(g01.endsWith("</svg>\n")).toBe(true);
    const { model, state } = await o1();
    expect(renderSvg(model, state, {})).toBe(g01);
  });
  it("A.2: Y03 is 3441 bytes, SHA-256 d2db035d..., differs from G01 only in the desc line and from the nodes group on", async () => {
    const y03 = readOracleText("svg/Y03.svg"), g01 = readOracleText("svg/G01.svg");
    expect(bytes(y03)).toBe(3441);
    expect(sha256(y03)).toBe("d2db035d11252ee3be86cd4259ca11cdd0cd55178abd5bf8df15deedf5739261");
    expect(y03.slice(0, y03.indexOf("<desc"))).toBe(g01.slice(0, g01.indexOf("<desc")));
    expect(y03).toContain('<desc id="igr-desc">2 selected, 0 hidden. Focus: person ann.</desc>');
    const { model, state } = await o1();
    let s = reduce(model, state, { type: "select", mode: "replace", targets: [I1, KNOWS] }).state;
    s = reduce(model, s, { type: "focus", target: ANN }).state;
    expect(fromNodes(renderSvg(model, s))).toBe(fromNodes(y03));
    expect(renderSvg(model, s)).toBe(y03);
  });
  it("A.3: Y07 is 2242 bytes, SHA-256 6694f5e2..., and the implementation writes it", async () => {
    const y07 = readOracleText("svg/Y07.svg");
    expect(bytes(y07)).toBe(2242);
    expect(sha256(y07)).toBe("6694f5e23e261cf442409f627115d94650a70e7a16f11528209e03c88c0254fd");
    const { model, state } = await o1();
    expect(renderSvg(model, reduce(model, state, { type: "set-hidden", targets: [ANN], hidden: true }).state)).toBe(y07);
  });
  it("A.4: the degenerate edge at zoom 10 (three lines of N14)", async () => {
    const lines = ['<path class="igr-line" d="M 447.904 299.466 L 452.096 300.534" marker-end="url(#igr-arrow)"/>', '<path class="igr-pick" d="M 447.904 299.466 L 452.096 300.534"/>',
      '<text class="igr-elabel" x="450" y="296" text-anchor="middle">KNOWS</text>'];
    const n14 = readOracleText("svg/N14.svg");
    expect(n14).toContain(lines.join("\n") + "\n");
    const { model, state } = await o1();
    const z = reduce(model, state, { type: "set-viewport", center_x: 383554, center_y: 134563, zoom: 10 }).state;
    expect(renderSvg(model, z)).toContain(lines.join("\n") + "\n");
  });
  it("A.5: the four ids of i:7, s:7, s:007, s:-0 (type p)", () => {
    const want: [string, string][] = [["i:7", "igr-n-7b226964223a22693a37222c2274797065223a2270227d"], ["s:7", "igr-n-7b226964223a22733a37222c2274797065223a2270227d"],
      ["s:007", "igr-n-7b226964223a22733a303037222c2274797065223a2270227d"], ["s:-0", "igr-n-7b226964223a22733a2d30222c2274797065223a2270227d"]];
    for (const [id, hex] of want) { expect(elementDomId("igr", { node: { id, type: "p" } })).toBe(hex); expect(readOracleText("svg/X01.svg")).toContain(`"${hex}"`); }
  });
  it("A.6: the budget on G01 (9 keeps all, 8 omits the edge label, 0 omits every text)", async () => {
    const { model, state } = await o1();
    expect(renderSvgDetailed(model, state, { maxDrawnLabelUnits: 9 })).toMatchObject({ label_units: 9, fidelity: { labels: "full" } });
    expect(renderSvgDetailed(model, state, { maxDrawnLabelUnits: 8 }).fidelity.labels).toBe("elided");
    expect(renderSvg(model, state, { maxDrawnLabelUnits: 0 })).not.toContain("<text");
    expect(readOracleText("svg/O06.svg")).toBe(renderSvg(model, state, { maxDrawnLabelUnits: 9 }));
  });
  it("A.7 and A.10: the click chain numbers, the hit limitation and the node-wins rule", async () => {
    const { model, state } = await o1();
    const P = "igr";
    expect(pickElement(model, state, P, { point: { x: 32.0, y: 193.5 } })).toEqual(I1);
    expect(pickElement(model, state, P, { targetId: elementDomId(P, I1) })).toEqual(I1);
    expect(pickElement(model, state, P, { point: { x: 500, y: 308 } })).toEqual(KNOWS);
    expect(pickElement(model, state, P, { point: { x: 500, y: 300 } })).toBeUndefined();
    expect(pickElement(model, state, P, { point: { x: 867.9, y: 406.4 } })).toEqual(ANN);
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const st = initialState(m, SIZE);
    const e7 = { edge: m.edges[7]!.ref }, e26 = { edge: m.edges[26]!.ref };
    expect(hitTest(m, st, { x: 184.517, y: 216.904 })).toEqual(e7);
    expect(pickElement(m, st, P, { targetId: elementDomId(P, e26), point: { x: 184.517, y: 216.904 } })).toEqual(e26);
    expect(hitTest(m, st, { x: 187.122, y: 208.693 })).toBeUndefined();
    expect(hitTest(m, st, { x: 181.912, y: 225.115 })).toBeUndefined();
    const m4 = await loadModel(O4.scene, O4.layout);
    expect(hitTest(m4, initialState(m4, SIZE), { x: 867.928, y: 381.4 })).toBeUndefined();
    const z10 = reduce(model, state, { type: "set-viewport", center_x: 383554, center_y: 134563, zoom: 10 }).state;
    expect(pickElement(model, z10, P, { targetId: elementDomId(P, KNOWS), point: { x: 447.904, y: 299.466 } })).toEqual(I1);
  });
  it("A.8: the self-loop, the mixed20 parallel groups and the extreme coordinates are in the tracked documents and in the output", async () => {
    const g02 = readOracleText("svg/G02.svg"), g05 = readOracleText("svg/G05.svg"), n11 = readOracleText("svg/N11.svg");
    const loop = 'd="M 860.928 399.4 C 852.928 375.4 882.928 375.4 874.928 399.4"';
    expect(g02).toContain(loop);
    expect(g02).toContain('<text class="igr-elabel" x="867.928" y="377.4" text-anchor="middle">R</text>');
    for (const d of ["M 48.069 172.326 Q 189.356 201.653 321.708 259.139", "M 320.965 261.481 Q 179.679 232.155 47.326 174.668", "M 634.051 343.641 Q 742.786 313.185 855.692 311.353", "M 856.135 314.395 Q 747.399 344.851 634.494 346.683"]) expect(g05).toContain(`d="${d}"`);
    for (const t of ['cx="45035996720.739" cy="299.466"', 'cx="-45035995820.739" cy="300.534"', 'd="M 45035996708.739 299.466 L -45035995808.739 300.534"']) expect(n11).toContain(t);
    const o4 = await loadModel(O4.scene, O4.layout);
    expect(renderSvg(o4, initialState(o4, SIZE))).toBe(g02);
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    expect(renderSvg(m, initialState(m, SIZE))).toBe(g05);
    const e = await loadModel(O1.scene, "../oracles-igl/verify/V45.layout.json");
    expect(renderSvg(e, initialState(e, SIZE))).toBe(n11);
  });
  it("A.9: the option sizes (3232, 2207, 2965, 3118, 3193) from O05, O01, O02, O03, O04", async () => {
    const { model, state } = await o1();
    const cases: [string, Record<string, unknown>, number][] = [["O05", { xmlDeclaration: true }, 3232], ["O01", { style: false }, 2207], ["O02", { labels: false }, 2965], ["O03", { edgeLabels: false }, 3118], ["O04", { idPrefix: "g-1" }, 3193]];
    for (const [row, o, n] of cases) { const f = readOracleText(`svg/${row}.svg`); expect(bytes(f), row).toBe(n); expect(renderSvg(model, state, o), row).toBe(f); }
  });
});
