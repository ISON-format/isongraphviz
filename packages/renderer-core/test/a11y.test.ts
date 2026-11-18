// Accessibility data model (design section 10, Appendix A.5; vectors A*): names, descriptions, summary, status, announcements.
import { describe, expect, it } from "vitest";
import { accessibleDescription, accessibleName, announcementFor, buildAccessibleModel, graphSummary, statusText, summaryText } from "../src/a11y.js";
import { buildRenderModel } from "../src/model.js";
import { reduce } from "../src/reduce.js";
import { initialState } from "../src/state.js";
import type { RenderModel, SemanticState } from "../src/types.js";
import { errOf, handModel, igl, o1Scene } from "./helpers.js";

const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };
const E0 = { ord: "0", rel: "KNOWS", src: I1, tgt: ANN };
const o1 = () => buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
const size = { width: 900, height: 600 };

describe("A.5 text (A01, A02, A12)", () => {
  it("A01 names and descriptions of O1", async () => {
    const m = await o1();
    expect(accessibleName(m, { node: I1 })).toBe("person 1");
    expect(accessibleName(m, { node: ANN })).toBe("person ann");
    expect(accessibleName(m, { edge: E0 })).toBe("KNOWS");
    expect(accessibleDescription(m, { edge: E0 })).toBe("1 KNOWS ann");
    expect(accessibleDescription(m, { node: I1 })).toBeUndefined();
  });
  it("A02 the summary of O1", async () => {
    const m = await o1();
    expect(summaryText(graphSummary(m))).toBe("Directed graph with 2 nodes and 1 edge. Node categories: person (2).");
    expect(graphSummary(m)).toEqual({ directed: true, nodes: 2, edges: 1, categories: [{ category: "person", count: 2 }] });
  });
  it("A12 status in the A.2 state with the edge selected and i:1 focused", async () => {
    const m = await o1();
    let s = initialState(m, size);
    s = reduce(m, s, { type: "select", mode: "replace", targets: [{ edge: E0 }] }).state;
    s = reduce(m, s, { type: "focus", target: { node: I1 } }).state;
    expect(statusText(m, s)).toBe("1 selected, 0 hidden. Focus: person 1.");
    expect(statusText(m, initialState(m, size))).toBe("0 selected, 0 hidden.");
    const onEdge = reduce(m, s, { type: "focus", target: { edge: E0 } }).state;
    expect(statusText(m, onEdge)).toBe("1 selected, 0 hidden. Focus: 1 KNOWS ann.");
  });
  it("status counts effectively hidden elements: a hidden node hides its incident edges", async () => {
    const m = await o1();
    const s = reduce(m, initialState(m, size), { type: "set-hidden", targets: [{ node: ANN }], hidden: true }).state;
    expect(statusText(m, s)).toBe("0 selected, 2 hidden.");
  });
});

describe("summary template (A04, A05, A06)", () => {
  it("A04 empty graph has no categories clause", async () => {
    const m = await buildRenderModel(igl("scenes/empty.scene.json"), igl("layouts/F07.layout.json"));
    expect(summaryText(graphSummary(m))).toBe("Directed graph with 0 nodes and 0 edges.");
  });
  it("A05 singular exactly at 1, plural at 0 and 2", async () => {
    const one = await handModel([{ id: "s:a", label: "a" }]);
    expect(summaryText(graphSummary(one))).toBe("Directed graph with 1 node and 0 edges. Node categories: p (1).");
    const two = await handModel([{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b" }], { directed: false });
    expect(summaryText(graphSummary(two))).toBe("Undirected graph with 2 nodes and 1 edge. Node categories: p (2).");
    const e2 = await handModel([{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b", ord: "0", rel: "X" }, { src: "s:a", tgt: "s:b", ord: "0", rel: "Y" }]);
    expect(summaryText(graphSummary(e2))).toContain("and 2 edges.");
  });
  const cats = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
  const manyCats = (n: number) => handModel(cats(n).map((c) => ({ id: "s:" + c, type: c, category: c, label: c })));
  it("A06 ten categories: the first eight, then ', and 2 more'", async () => {
    expect(summaryText(graphSummary(await manyCats(10)))).toBe("Directed graph with 10 nodes and 0 edges. Node categories: a (1), b (1), c (1), d (1), e (1), f (1), g (1), h (1), and 2 more.");
  });
  it("nine categories: ', and 1 more'; eight: no tail", async () => {
    expect(summaryText(graphSummary(await manyCats(9)))).toBe("Directed graph with 9 nodes and 0 edges. Node categories: a (1), b (1), c (1), d (1), e (1), f (1), g (1), h (1), and 1 more.");
    expect(summaryText(graphSummary(await manyCats(8)))).toBe("Directed graph with 8 nodes and 0 edges. Node categories: a (1), b (1), c (1), d (1), e (1), f (1), g (1), h (1).");
    expect(graphSummary(await manyCats(10)).categories).toHaveLength(10); // the structured form lists all categories
  });
  it("counts per category in model.categories order (UTF-8 byte order)", async () => {
    const m = await handModel([{ id: "s:a", type: "b", category: "b", label: "1" }, { id: "s:b", type: "a", category: "a", label: "2" }, { id: "s:c", type: "b", category: "b", label: "3" }]);
    expect(summaryText(graphSummary(m))).toBe("Directed graph with 3 nodes and 0 edges. Node categories: a (1), b (2).");
  });
});

describe("verbatim texts (A07, A08, A09, A14, A17)", () => {
  it("A07 NFC and NFD stay distinct and nothing is normalized", async () => {
    const nfc = "é", nfd = "é";
    const m = await handModel([{ id: "s:" + nfc, label: nfc }, { id: "s:" + nfd, label: nfd }]);
    const names = m.nodes.map((n) => accessibleName(m, { node: n.ref }));
    expect(new Set(names).size).toBe(2);
    expect(names).toContain("p " + nfc);
    expect(names).toContain("p " + nfd);
  });
  it("A08 hostile labels are verbatim: markup, bidi, quotes, NUL, DEL, U+2028, no trimming", async () => {
    const hostile = ["<script>alert(1)</script>", "‮evil", "a\"b'c", "x\u0000y", "d\u007fe", "l s", "  padded  ", "&amp;"];
    const m = await handModel(hostile.map((h) => ({ id: "s:" + h, label: h })));
    expect(m.nodes).toHaveLength(hostile.length);
    for (const n of m.nodes) { expect(hostile).toContain(n.label); expect(accessibleName(m, { node: n.ref })).toBe(`p ${n.label}`); }
  });
  it("A09 a 1,022-unit label is in full", async () => {
    const m = await buildRenderModel(igl("scenes/keybound.scene.json"), igl("layouts/F13.layout.json"));
    const long = m.nodes.reduce((a, n) => (n.label.length > a.length ? n.label : a), "");
    expect(long.length).toBeGreaterThanOrEqual(1000);
    const n = m.nodes.find((x) => x.label === long)!;
    expect(accessibleName(m, { node: n.ref })).toBe(`${n.category} ${long}`);
  });
  it("A14 i:1 and s:1 have equal names and different addresses", async () => {
    const m = await handModel([{ id: "i:1", label: "1" }, { id: "s:1", label: "1" }]);
    const items = buildAccessibleModel(m, initialState(m, size)).items;
    expect(items[0]!.name).toBe(items[1]!.name);
    expect(items[0]!.address).not.toEqual(items[1]!.address);
  });
  it("A17 an empty label is real: the name has a trailing space and descriptions keep the empty field", async () => {
    const m = await handModel([{ id: "s:", label: "" }, { id: "s:x", label: "x" }], [{ src: "s:", tgt: "s:x", rel: "R" }]);
    expect(accessibleName(m, { node: { id: "s:", type: "p" } })).toBe("p ");
    expect(accessibleDescription(m, { edge: m.edges[0]!.ref })).toBe(" R x");
    const m2 = await handModel([{ id: "s:", label: "" }, { id: "s:x", label: "x" }], [{ src: "s:x", tgt: "s:", rel: "R" }]);
    expect(accessibleDescription(m2, { edge: m2.edges[0]!.ref })).toBe("x R ");
  });
  it("unresolved or malformed addresses are INVALID_INPUT, not a crash", async () => {
    const m = await o1();
    expect(errOf(() => accessibleName(m, { node: { id: "i:9", type: "person" } }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => accessibleName(m, { bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => accessibleName({} as never, { node: I1 }))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
  });
});

describe("AccessibleModel (A03, A10, A11, A13)", () => {
  it("A10 nodes then edges in scene order with 1-based position and set_size", async () => {
    const m = await o1();
    const am = buildAccessibleModel(m, initialState(m, size));
    expect(am.items.map((i) => [i.role, i.position, i.set_size, i.name])).toEqual([["node", 1, 3, "person 1"], ["node", 2, 3, "person ann"], ["edge", 3, 3, "KNOWS"]]);
    expect(am.items[2]!.description).toBe("1 KNOWS ann");
    expect("description" in am.items[0]!).toBe(false);
    expect(am.summary).toBe("Directed graph with 2 nodes and 1 edge. Node categories: person (2).");
    expect(am.status).toBe("0 selected, 0 hidden.");
  });
  it("A11/A13 hidden elements are absent; selected and focused flags; positions renumbered", async () => {
    const m = await o1();
    let s = initialState(m, size);
    s = reduce(m, s, { type: "select", mode: "replace", targets: [{ node: I1 }] }).state;
    s = reduce(m, s, { type: "focus", target: { node: I1 } }).state;
    s = reduce(m, s, { type: "set-hidden", targets: [{ node: ANN }], hidden: true }).state;
    const am = buildAccessibleModel(m, s);
    expect(am.items).toHaveLength(1);
    expect(am.items[0]).toMatchObject({ role: "node", selected: true, focused: true, position: 1, set_size: 1, address: { node: I1 } });
    expect(am.status).toBe("1 selected, 2 hidden. Focus: person 1.");
  });
  it("A03 undirected scene with a self-loop description uses stored endpoint order", async () => {
    const m = await handModel([{ id: "s:a", label: "A" }, { id: "s:b", label: "B" }], [{ src: "s:a", tgt: "s:a", rel: "LOOP" }, { src: "s:a", tgt: "s:b", rel: "TO" }], { directed: false });
    const d = m.edges.map((e) => accessibleDescription(m, { edge: e.ref })).sort();
    expect(d).toEqual(["a LOOP a", "a TO b"]);
    expect(buildAccessibleModel(m, initialState(m, size)).summary.startsWith("Undirected graph")).toBe(true);
  });
  it("is pure: the same inputs give equal output and the input state is not changed", async () => {
    const m = await o1();
    const s = initialState(m, size);
    const before = JSON.stringify(s);
    expect(JSON.stringify(buildAccessibleModel(m, s))).toBe(JSON.stringify(buildAccessibleModel(m, s)));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("announcements (A15)", () => {
  const run = (s: SemanticState, m: RenderModel, intent: unknown) => { const r = reduce(m, s, intent); return { r, text: r.events.map((e) => announcementFor(e, m, r.state)) }; };
  it("selection, focus, visibility, boundary and viewport events", async () => {
    const m = await o1();
    let s = initialState(m, size);
    let x = run(s, m, { type: "select", mode: "replace", targets: [{ node: I1 }, { edge: E0 }] }); s = x.r.state;
    expect(x.text).toEqual(["2 selected."]);
    x = run(s, m, { type: "focus", target: { node: ANN } }); s = x.r.state;
    expect(x.text).toEqual(["person ann"]);
    x = run(s, m, { type: "focus", target: { edge: E0 } }); s = x.r.state;
    expect(x.text).toEqual(["1 KNOWS ann"]);
    x = run(s, m, { type: "focus" }); s = x.r.state;
    expect(x.text).toEqual(["Focus cleared."]);
    x = run(s, m, { type: "set-hidden", targets: [{ node: ANN }], hidden: true }); s = x.r.state;
    expect(x.r.events.map((e) => e.type)).toEqual(["visibility-changed", "selection-changed"]);
    expect(x.text).toEqual(["2 hidden.", "1 selected."]); // the effective count (node and its edge), not the explicit set
    x = run(s, m, { type: "pan", dx: 5, dy: 5 });
    expect(x.text).toEqual([undefined]);
    const last = run(reduce(m, initialState(m, size), { type: "focus-last" }).state, m, { type: "focus-step", delta: 1 });
    expect(last.text).toEqual(["End of graph."]);
    const first = run(reduce(m, initialState(m, size), { type: "focus-first" }).state, m, { type: "focus-step", delta: -1 });
    expect(first.text).toEqual(["Start of graph."]);
  });
  it("uses the post-commit state for counts", async () => {
    const m = await o1();
    const s0 = initialState(m, size);
    const r = reduce(m, s0, { type: "select", mode: "add", targets: [{ node: I1 }] });
    expect(announcementFor(r.events[0]!, m, r.state)).toBe("1 selected.");
    expect(announcementFor(r.events[0]!, m, s0)).toBe("0 selected."); // the state argument, not the event, supplies the count
  });
});
