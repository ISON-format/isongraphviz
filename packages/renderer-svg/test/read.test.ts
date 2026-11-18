// readSvg: the strict reader of the igr-svg/1 grammar (5.6), each rule W1-W10, the bounds, the witness (12.4).
import { describe, expect, it } from "vitest";
import { initialState, reduce } from "isongraph-visualize-renderer-core";
import { readSvg, renderSvg, svgWitness } from "../src/index.js";
import { MIXED20, O4, SIZE, errOf, loadModel, o1 } from "./helpers.js";

const base = async (): Promise<string> => { const { model, state } = await o1(); return renderSvg(model, state); };
const rep = (doc: string, from: string, to: string): string => { if (!doc.includes(from)) throw new Error(`test setup: ${from} not found`); return doc.replace(from, to); };
const bad = (doc: string, limits?: { maxBytes?: number; maxLineUnits?: number }): string => errOf(() => readSvg(doc, limits));
const SCHEMA = "INVALID_INPUT/SCHEMA";

describe("accepts what the writer writes", () => {
  it("G01, the declaration form, an odd prefix, no style, no labels", async () => {
    const { model, state } = await o1();
    for (const o of [{}, { xmlDeclaration: true }, { idPrefix: "g-1" }, { style: false }, { labels: false }, { edgeLabels: false }, { idPrefix: "a" }]) expect(errOf(() => readSvg(renderSvg(model, state, o))), JSON.stringify(o)).toBe("none");
  });
  it("mixed20 with selection and focus; undirected O4 with a self-loop", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    let s = initialState(m, SIZE);
    s = reduce(m, s, { type: "select", mode: "replace", targets: [{ edge: m.edges[7]!.ref }, { node: m.nodes[3]!.ref }] }).state;
    s = reduce(m, s, { type: "focus", target: { edge: m.edges[26]!.ref } }).state;
    const r = readSvg(renderSvg(m, s));
    expect(r.nodes).toHaveLength(20);
    expect(r.edges).toHaveLength(37);
    expect(r.edges.filter((e) => e.selected)).toHaveLength(1);
    expect(r.edges.filter((e) => e.focused)).toHaveLength(1);
    const o = await loadModel(O4.scene, O4.layout);
    expect(readSvg(renderSvg(o, initialState(o, SIZE))).directed).toBe(false);
  });
  it("the readout: prefix derived from aria-labelledby, wire addresses, printed number strings, decoded text", async () => {
    const r = readSvg(await base());
    expect(r.idPrefix).toBe("igr");
    expect(r).toMatchObject({ width: 900, height: 600, styled: true, directed: true });
    expect(r.nodes[0]).toMatchObject({ address: { id: "i:1", type: "person" }, category_class: "igr-k0", tabindex: "0", name: "person 1", label: "1", cx: "32.072", cy: "193.6", selected: false, focused: false });
    expect(r.edges[0]).toMatchObject({ address: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } }, name: "KNOWS", description: "1 KNOWS ann", marker: true, label: "KNOWS", label_x: "450", label_y: "296", d: "M 43.701 196.561 L 856.299 403.439" });
    expect(readSvg(rep(await base(), 'aria-labelledby="igr-title"', 'aria-labelledby="igr-title"')).title).toBe("Directed graph with 2 nodes and 1 edge. Node categories: person (2).");
    expect(r.artifact_sha256).toBe("1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a");
  });
  it("entities are decoded; names after xs equal the model's (D-XML)", async () => {
    const m = await loadModel("scenes/hostile-svg.scene.json", "layouts/hostile-svg.layout.json");
    const r = readSvg(renderSvg(m, initialState(m, SIZE)));
    expect(r.nodes.some((n) => n.name.includes("<script>"))).toBe(true);
  });
});

describe("grammar: everything outside the language is INVALID_INPUT/SCHEMA", () => {
  it("not a string; empty; no final LF; blank line; CR; indentation", async () => {
    const d = await base();
    expect(errOf(() => readSvg(5 as never))).toBe(SCHEMA);
    expect(bad("")).toBe(SCHEMA);
    expect(bad(d.slice(0, -1))).toBe(SCHEMA);
    expect(bad(d + "\n")).toBe(SCHEMA);
    expect(bad(rep(d, "<title id", "\n<title id"))).toBe(SCHEMA);
    expect(bad(d.replace(/\n/g, "\r\n"))).toBe(SCHEMA);
    expect(bad(rep(d, "<circle", " <circle"))).toBe(SCHEMA);
    expect(bad(rep(d, "<circle", "\t<circle"))).toBe(SCHEMA);
  });
  it("unknown elements and attributes; reordered attributes; a second svg; trailing content", async () => {
    const d = await base();
    expect(bad(rep(d, "<g class=\"igr-nodes\">", "<script>alert(1)</script>\n<g class=\"igr-nodes\">"))).toBe(SCHEMA);
    expect(bad(rep(d, '<circle class="igr-shape"', '<circle onclick="x()" class="igr-shape"'))).toBe(SCHEMA);
    expect(bad(rep(d, '<circle class="igr-shape" cx="32.072"', '<circle cx="32.072" class="igr-shape"'))).toBe(SCHEMA);
    expect(bad(rep(d, 'r="10"/>', 'r="10" xlink:href="#a"/>'))).toBe(SCHEMA);
    expect(bad(d + d)).toBe(SCHEMA);
    expect(bad(d + "<g/>\n")).toBe(SCHEMA);
    expect(bad(rep(d, "<style>", '<!DOCTYPE svg>\n<style>'))).toBe(SCHEMA);
    expect(bad('<?xml version="1.1"?>\n' + d)).toBe(SCHEMA);
    expect(bad("<svg/>\n")).toBe(SCHEMA);
  });
  it("entities: only the seven; the TEXT set differs from the ATTR set", async () => {
    const d = await base();
    expect(bad(rep(d, "<title>KNOWS</title>", "<title>&foo;</title>"))).toBe(SCHEMA);
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1 &#x41; ann</desc>"))).toBe(SCHEMA);
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1 < ann</desc>"))).toBe(SCHEMA);
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1 > ann</desc>"))).toBe(SCHEMA);
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1 & ann</desc>"))).toBe(SCHEMA);
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1 &quot; ann</desc>"))).toBe(SCHEMA); // not in the TEXT set
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", '<desc>1 " ann</desc>'))).toBe("none"); // a literal quote is fine in text
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1\tann</desc>"))).toBe("none"); // TAB literal in text
    expect(bad(rep(d, 'aria-label="person 1"', 'aria-label="person&#9;1"'))).toBe(SCHEMA); // W6: the title differs
    expect(bad(rep(d, 'aria-label="person 1"', 'aria-label="pe\trson 1"'))).toBe(SCHEMA); // raw TAB in an attribute
    expect(bad(rep(d, 'aria-label="person 1"', 'aria-label="pe"rson 1"'))).toBe(SCHEMA);
  });
  it("XML-illegal scalars are outside the language", async () => {
    const d = await base();
    for (const c of ["\u0000", "\u0001", "\u000b", "￾", "￿"]) expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", `<desc>1${c}ann</desc>`)), JSON.stringify(c)).toBe(SCHEMA);
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1\ud800ann</desc>"))).toBe(SCHEMA);
  });
  it("U+2028, U+2029 and U+0085 in text are not line breaks", async () => {
    const d = await base();
    expect(bad(rep(d, "<desc>1 KNOWS ann</desc>", "<desc>1  \u0085ann</desc>"))).toBe("none");
  });
  it("NUM: no exponent, plus, leading zero, trailing zero, trailing dot or -0", async () => {
    const d = await base();
    for (const n of ["1e3", "+5", "007", "5.50", "5.", "-0", "-0.0", ".5", "", "-", "1.2.3", "--1"]) expect(bad(rep(d, 'cx="32.072" cy="193.6" r="10"', `cx="${n}" cy="193.6" r="10"`)), JSON.stringify(n)).toBe(SCHEMA);
    for (const n of ["0", "-1", "0.001", "-0.001", "45035996720.739", "10"]) expect(bad(rep(d, 'cx="32.072" cy="193.6" r="10"', `cx="${n}" cy="193.6" r="10"`)), n).toBe("none");
  });
  it("path data: M x y L/Q/C with exactly 2/4/6 numbers", async () => {
    const d = await base();
    const L = "M 43.701 196.561 L 856.299 403.439";
    for (const p of ["M 1 2", "M 1 2 L 3", "M 1 2 L 3 4 5", "M 1 2 Q 3 4 5", "M 1 2 C 3 4 5 6 7", "L 1 2 L 3 4", "M 1 2 Z 3 4", "M 1  2 L 3 4"]) expect(bad(d.split(L).join(p)), p).toBe(SCHEMA);
    for (const p of ["M 1 2 Q 3 4 5 6", "M 1 2 C 3 4 5 6 7 8"]) expect(bad(d.split(L).join(p)), p).toBe("none");
  });
  it("the style body must be the 19 lines of the theme", async () => {
    const d = await base();
    expect(bad(rep(d, ".igr-svg{font:12px sans-serif}", ".igr-svg{font:13px sans-serif}"))).toBe(SCHEMA);
    expect(bad(rep(d, ".igr-arrow{fill:currentColor;fill-opacity:.6}\n", ""))).toBe(SCHEMA);
    expect(bad(rep(d, "</style>", "@import url(x);\n</style>"))).toBe(SCHEMA);
  });
  it("an unknown data-igr-svg is rejected", async () => { expect(bad(rep(await base(), 'data-igr-svg="igr-svg/1"', 'data-igr-svg="igr-svg/2"'))).toBe(SCHEMA); });
  it("hashes must be 64 lowercase hex digits", async () => {
    const d = await base();
    expect(bad(rep(d, 'data-igr-scene="e8a4', 'data-igr-scene="E8A4'))).toBe(SCHEMA);
    expect(bad(rep(d, 'data-igr-layout="2f37', 'data-igr-layout="2f3'))).toBe(SCHEMA);
  });
});

describe("consistency rules W1-W10, each by itself (5.6)", () => {
  it("W1 duplicate id, id that does not decode, wrong kind prefix", async () => {
    const d = await base();
    const nid = /<g id="(igr-n-[0-9a-f]+)"/.exec(d)![1]!;
    const eid = /<g id="(igr-e-[0-9a-f]+)"/.exec(d)![1]!;
    expect(bad(d.replace(/<g id="igr-n-[0-9a-f]+" class="igr-node igr-k0" role="graphics-symbol" aria-roledescription="node" aria-label="person ann"/, `<g id="${nid}" class="igr-node igr-k0" role="graphics-symbol" aria-roledescription="node" aria-label="person ann"`))).toBe(SCHEMA);
    expect(bad(rep(d, nid, "igr-n-zz"))).toBe(SCHEMA);
    expect(bad(rep(d, nid, nid.toUpperCase().replace("IGR-N-", "igr-n-")))).toBe(SCHEMA);
    expect(bad(rep(d, eid, "igr-n-" + eid.slice(6)))).toBe(SCHEMA);
    expect(bad(rep(d, nid, "xyz-n-" + nid.slice(6)))).toBe(SCHEMA);
  });
  it("W2 the title, desc and marker ids agree with the references", async () => {
    const d = await base();
    expect(bad(rep(d, '<title id="igr-title">', '<title id="igr-titel">'))).toBe(SCHEMA);
    expect(bad(rep(d, '<desc id="igr-desc">', '<desc id="igr-dxsc">'))).toBe(SCHEMA);
    expect(bad(rep(d, 'aria-describedby="igr-desc"', 'aria-describedby="igr-title"'))).toBe(SCHEMA);
    expect(bad(rep(d, '<marker id="igr-arrow"', '<marker id="igr-arrowx"'))).toBe(SCHEMA);
    expect(bad(rep(d, 'marker-end="url(#igr-arrow)"', 'marker-end="url(#other)"'))).toBe(SCHEMA);
  });
  it("W3 marker-end on some edges only; marker-end without defs; defs alone is legal", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const d = renderSvg(m, initialState(m, SIZE));
    expect(bad(rep(d, ' marker-end="url(#igr-arrow)"', ""))).toBe(SCHEMA); // only the first edge loses it
    const one = await base();
    expect(bad(rep(one, "<defs>", "<defsx>"))).toBe(SCHEMA);
    expect(errOf(() => { const { model, state } = { model: m, state: reduce(m, initialState(m, SIZE), { type: "set-hidden", targets: m.nodes.map((n) => ({ node: n.ref })), hidden: true }).state }; readSvg(renderSvg(model, state)); })).toBe("none");
  });
  it("W4 ring and halo against the class; circles of one node share a centre", async () => {
    const { model, state } = await o1();
    const s = reduce(model, state, { type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] }).state;
    const d = renderSvg(model, s);
    expect(bad(rep(d, '<circle class="igr-ring-sel" cx="32.072" cy="193.6" r="14"/>\n', ""))).toBe(SCHEMA);
    expect(bad(rep(d, '<circle class="igr-ring-sel" cx="32.072"', '<circle class="igr-ring-sel" cx="33"'))).toBe(SCHEMA);
    expect(bad(rep(await base(), '<circle class="igr-shape" cx="32.072" cy="193.6" r="10"/>', '<circle class="igr-ring-foc" cx="32.072" cy="193.6" r="18"/>\n<circle class="igr-shape" cx="32.072" cy="193.6" r="10"/>'))).toBe(SCHEMA);
    const e = renderSvg(model, reduce(model, state, { type: "select", mode: "replace", targets: [{ edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } }] }).state);
    expect(bad(rep(e, /<path class="igr-halo-sel"[^\n]*\n/.exec(e)![0], ""))).toBe(SCHEMA);
  });
  it("W5 exactly one tabindex 0", async () => {
    const d = await base();
    expect(bad(rep(d, 'aria-label="person ann" tabindex="-1"', 'aria-label="person ann" tabindex="0"'))).toBe(SCHEMA);
    expect(bad(rep(d, 'aria-label="person 1" tabindex="0"', 'aria-label="person 1" tabindex="-1"'))).toBe(SCHEMA);
    expect(bad(rep(d, 'tabindex="-1"', 'tabindex="1"'))).toBe(SCHEMA);
  });
  it("W6 the title text equals the aria-label after decoding", async () => {
    const d = await base();
    expect(bad(rep(d, "<title>person 1</title>", "<title>person 2</title>"))).toBe(SCHEMA);
    expect(bad(rep(d, "<title>KNOWS</title>", "<title>KNOWS </title>"))).toBe(SCHEMA);
  });
  it("W7 all nodes precede all edges, one group of each", async () => {
    const d = await base();
    const nodes = d.slice(d.indexOf('<g class="igr-nodes">'), d.indexOf('<g class="igr-edges">'));
    const edges = d.slice(d.indexOf('<g class="igr-edges">'), d.indexOf("</svg>"));
    expect(bad(d.replace(nodes + edges, edges + nodes))).toBe(SCHEMA);
    expect(bad(d.replace(edges, nodes + edges))).toBe(SCHEMA);
  });
  it("W8 the root desc and title texts (raw)", async () => {
    const d = await base();
    for (const t of ["0 selected, 0 hidden", "x selected, 0 hidden.", "0 selected, 0 hidden. Focus: ", "0 selected, 0 hidden. Focus: x", "0 selected, 0 hidden. Focus: .", "0 selected,0 hidden.", " 0 selected, 0 hidden."])
      expect(bad(rep(d, "0 selected, 0 hidden.", t)), t).toBe(SCHEMA);
    expect(bad(rep(d, "0 selected, 0 hidden.", "12 selected, 345 hidden. Focus: person ann."))).toBe("none");
    expect(bad(rep(d, "<title id=\"igr-title\">Directed graph", "<title id=\"igr-title\">Cyclic graph"))).toBe(SCHEMA);
    expect(bad(rep(d, "<title id=\"igr-title\">Directed graph", "<title id=\"igr-title\">Undirected graph"))).toBe("none");
  });
  it("W9 width and height equal the viewBox and lie in 1..16384", async () => {
    const d = await base();
    expect(bad(rep(d, 'viewBox="0 0 900 600"', 'viewBox="0 0 900 601"'))).toBe(SCHEMA);
    expect(bad(rep(d, 'width="900"', 'width="0"').replace('viewBox="0 0 900', 'viewBox="0 0 0'))).toBe(SCHEMA);
    expect(bad(rep(d, 'width="900" height="600" viewBox="0 0 900 600"', 'width="16385" height="600" viewBox="0 0 16385 600"'))).toBe(SCHEMA);
    expect(bad(rep(d, 'width="900" height="600" viewBox="0 0 900 600"', 'width="16384" height="600" viewBox="0 0 16384 600"'))).toBe("none");
    expect(bad(rep(d, 'width="900"', 'width="0900"'))).toBe(SCHEMA);
  });
  it("W10 the halo, line and pick paths of one edge have the same d", async () => {
    const d = await base();
    expect(bad(rep(d, '<path class="igr-pick" d="M 43.701', '<path class="igr-pick" d="M 43.702'))).toBe(SCHEMA);
  });
});

describe("bounds (5.6, 14.5): checked first, with the exact UTF-8 length", () => {
  it("maxBytes is inclusive; maxLineUnits counts UTF-16 units per line", async () => {
    const d = await base();
    expect(bad(d, { maxBytes: 3193 })).toBe("none");
    expect(bad(d, { maxBytes: 3192 })).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(bad(d, { maxLineUnits: 100 })).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    const root = d.split("\n")[0]!.length;
    expect(bad(d, { maxLineUnits: root })).toBe("none");
    expect(bad(d, { maxLineUnits: root - 1 })).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("the bound is checked before the grammar: a huge non-document is refused by size, not parsed", () => {
    expect(bad("x".repeat(1000), { maxBytes: 10 })).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("bad limits are SCHEMA", async () => {
    const d = await base();
    for (const l of [null, 5, [], { maxBytes: -1 }, { maxBytes: 1.5 }, { maxBytes: "9" }, { bogus: 1 }]) expect(errOf(() => readSvg(d, l as never)), JSON.stringify(l)).toBe(SCHEMA);
  });
  it("cost is linear: a 2 MB label line is read in well under a second", async () => {
    const d = await base();
    const big = d.replace("<desc>1 KNOWS ann</desc>", `<desc>${"a".repeat(2_000_000)}</desc>`);
    const t0 = Date.now();
    readSvg(big);
    expect(Date.now() - t0).toBeLessThan(2000);
    const amp = d.replace("<desc>1 KNOWS ann</desc>", `<desc>${"&amp;".repeat(200_000)}</desc>`);
    const t1 = Date.now();
    readSvg(amp);
    expect(Date.now() - t1).toBeLessThan(2000);
  });
});

describe("svgWitness (12.4)", () => {
  it("elements in document order, texts are the decoded aria-labels", async () => {
    const w = svgWitness(await base());
    expect(w.backend).toBe("igr-svg/1");
    expect(w.elements.nodes.map((n) => n.id)).toEqual(["i:1", "s:ann"]);
    expect(w.elements.edges).toHaveLength(1);
    expect(w.texts.map((t) => t.text)).toEqual(["person 1", "person ann", "KNOWS"]);
    expect(w.texts[2]!.address).toEqual({ edge: w.elements.edges[0] });
  });
  it("an invalid document is SCHEMA", () => { expect(errOf(() => svgWitness("nope"))).toBe(SCHEMA); });
});

describe("audit M-4: the TEXT entity set (7.2) has no &#9; and no &quot;", () => {
  it("a TAB written as &#9; (or any other unlisted reference) inside a title, desc or text body is rejected; literal TAB is fine", async () => {
    const d = await base();
    for (const [from, tag] of [["<title>KNOWS</title>", "title"], ["<desc>1 KNOWS ann</desc>", "desc"], ['text-anchor="middle">KNOWS</text>', "text"]] as const) {
      const body = (b: string): string => (tag === "text" ? `text-anchor="middle">${b}</text>` : `<${tag}>${b}</${tag}>`);
      expect(bad(rep(d, from, body("a&#9;b"))), tag).toBe(SCHEMA);
      expect(bad(rep(d, from, body("a&apos;b"))), tag).toBe(SCHEMA);
      expect(bad(rep(d, from, body("a&#x41;b"))), tag).toBe(SCHEMA);
    }
  });
});
