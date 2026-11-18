// C-V5 (design 3.2, informational check run by cross-check): every coordinate that V5 prints is fmt(v) of a micro-pixel value (30 3.2: m = divRound(v, 1000), then
// fixed-point text), and igr-dl/1 stores that same m as an integer. So for every shared input a coordinate of a display-list record, written with V5's fmt text
// rule, is the number V5 prints. The test compares node centres, the numbers of every route (`d`) and the edge label positions of the documents produced by
// renderSvg (V5's own writer, read back by V5's own reader) with the integers of the list. It is a TEST, not a rule that couples the packages: if V5 changes
// geometry (igr-svg/2), igr-dl/1 does not follow until igr-dl/2 adopts it. The arrowhead has no counterpart number in V5 (its marker is a fixed shape, 3.4(b)).
import { describe, expect, it } from "vitest";
import { buildDisplayList } from "isongraph-visualize-display-list";
import { readSvg, renderSvg } from "isongraph-visualize-renderer-svg";
import { SVG_DIR, loadRows, readText, scene } from "./helpers.js";

/** fmt of 30 3.2 for a milli-pixel integer: sign, integer part, up to three decimals without trailing zeros. */
function fmt(m: number): string {
  const a = Math.abs(m);
  const whole = Math.floor(a / 1000), frac = a % 1000;
  const f = frac === 0 ? "" : "." + String(frac).padStart(3, "0").replace(/0+$/, "");
  return (m < 0 ? "-" : "") + whole + f;
}

describe("fmt of the m-px integers is V5's printed text", () => {
  it("32072 is 32.072, 193600 is 193.6, 0 is 0, -1 is -0.001, 450000 is 450", () => {
    expect([fmt(32072), fmt(193600), fmt(0), fmt(-1), fmt(450000), fmt(-1500), fmt(1001)]).toEqual(["32.072", "193.6", "0", "-0.001", "450", "-1.5", "1.001"]);
  });
});

const rows = loadRows(SVG_DIR).filter((r) => /^(G|N|X|Y)\d+b?$/.test(r.id) && r.expected.endsWith(".svg") && r.scene !== "");

describe("C-V5: the integers of the list, printed with V5's fmt, are the numbers V5 prints (node centres, route numbers, edge label positions)", () => {
  const compared = { nodes: 0, routes: 0, labels: 0 };
  for (const row of rows) {
    it(`${row.id}`, async () => {
      const { model, state, options } = await scene(SVG_DIR, row);
      let list;
      try { list = buildDisplayList(model, state, options); } catch { return; } // the refusal of 3.5: V5 has no such limit, the comparison does not apply
      const svg = readSvg(renderSvg(model, state, options));
      const nd = list.nodes.length;
      const centres = list.records.filter((r) => r[0] === "N");
      expect(svg.nodes.length).toBe(centres.length);
      centres.forEach((n, i) => { expect([svg.nodes[i]!.cx, svg.nodes[i]!.cy]).toEqual([fmt(n[4] as number), fmt(n[5] as number)]); compared.nodes++; });
      const routes = list.records.filter((r) => r[0] === "E");
      expect(svg.edges.length).toBe(routes.length);
      routes.forEach((e, i) => {
        const form = e[3] as number, c = (e.slice(4) as number[]).map(fmt);
        const want = form === 0 ? `M ${c[0]} ${c[1]} L ${c[2]} ${c[3]}` : form === 1 ? `M ${c[0]} ${c[1]} Q ${c[2]} ${c[3]} ${c[4]} ${c[5]}` : `M ${c[0]} ${c[1]} C ${c[2]} ${c[3]} ${c[4]} ${c[5]} ${c[6]} ${c[7]}`;
        expect(svg.edges[i]!.d, `${row.id} edge ${i}`).toBe(want);
        compared.routes++;
      });
      for (const t of list.records.filter((r) => r[0] === "T" && r[2] === 1)) {
        const e = svg.edges[(t[1] as number) - nd - 1]!;
        expect([e.label_x, e.label_y], `${row.id} edge label of pid ${t[1]}`).toEqual([fmt(t[3] as number), fmt(t[4] as number)]);
        compared.labels++;
      }
    });
  }
  it("compared a substantial number of numbers", () => {
    console.log(`[c-v5] ${compared.nodes} node centres, ${compared.routes} routes, ${compared.labels} edge label positions compared`);
    expect(compared.nodes).toBeGreaterThan(100);
    expect(compared.routes).toBeGreaterThan(80);
    expect(compared.labels).toBeGreaterThan(50);
  });
  it("also on the expected documents of the V5 corpus themselves (svg:G01-G10, N08, N09 are stored files, read as data)", async () => {
    for (const id of ["G01", "G05", "N08", "N09"]) {
      const row = rows.find((r) => r.id === id)!;
      const { model, state, options } = await scene(SVG_DIR, row);
      const stored = readSvg(readText(SVG_DIR, `svg/${id}.svg`));
      const list = buildDisplayList(model, state, options);
      const centres = list.records.filter((r) => r[0] === "N");
      centres.forEach((n, i) => expect([stored.nodes[i]!.cx, stored.nodes[i]!.cy]).toEqual([fmt(n[4] as number), fmt(n[5] as number)]));
    }
  });
});
