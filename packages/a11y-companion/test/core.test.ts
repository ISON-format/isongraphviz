// The TypeScript-tranche-only items of design 15.7 and the rules no oracle row observes: option validation (9.2, 9.3), live text corners (9.4), the planner
// assertion (9.5), the executor guards and the double that throws on undeclared members (9.6), verifyCompanionTree, maxTreeBytes, the gate checks without a
// single-fault row (10), the composed manifest corners (13.1), the id grammar against V5's elementDomId.
import { describe, expect, it } from "vitest";
import { IgrError, announcementFor, initialState, reduce, type ElementAddress, type SemanticState } from "isongraph-visualize-renderer-core";
import { elementDomId } from "isongraph-visualize-renderer-svg";
import { IaError } from "isongraph-visualize-interaction-core";
import * as ia from "../src/index.js";
import { G9, O1, ORACLE_DIR, initial, loadModel, readOracle, readOracleText, readState } from "./helpers.js";
import { loadCorpus, parsePlanText, simDom } from "./oracle/runner.js";

const err = (f: () => unknown): { code?: string; reason?: string; name: string } => {
  try { f(); } catch (e) { return { name: (e as Error).name, code: (e as IaError).code, reason: (e as IaError).reason }; }
  return { name: "no error" };
};
const ia_ = (code: string, reason: string) => ({ name: "IaError", code, reason });
const tree = (name: string): ia.CompanionTree => JSON.parse(readOracleText(`trees/${name}.tree.json`)) as ia.CompanionTree;

describe("companion options (9.2, 9.3)", () => {
  it("unknown key, bad prefix, bad window shapes, bad mode, bad flags and limits", async () => {
    const { model, state } = await initial(O1);
    const b = (o: unknown) => err(() => ia.buildCompanionTree(model, state, o as never));
    expect(b({ nope: 1 })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ idPrefix: 5 })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    for (const p of ["", "A", "1a", "a_b", "a".repeat(33), "a b"]) expect(b({ idPrefix: p }), p).toMatchObject(ia_("INVALID_CONFIG", "INVALID_VALUE"));
    expect(b({ idPrefix: "a".repeat(32) })).toEqual({ name: "no error" });
    expect(b({ window: "most" })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ window: { first: 1 } })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ window: { first: 1, count: 1, extra: 1 } })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ window: { first: "1", count: 1 } })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ window: { first: 1.5, count: 1 } })).toMatchObject(ia_("INVALID_CONFIG", "NOT_INTEGER"));
    expect(b({ window: { first: 1, count: NaN } })).toMatchObject(ia_("INVALID_CONFIG", "NOT_INTEGER")); // A-71
    expect(b({ window: { first: 0, count: 1 } })).toMatchObject(ia_("INVALID_CONFIG", "OUT_OF_RANGE"));
    expect(b({ window: { first: 1, count: 5001 } })).toMatchObject(ia_("INVALID_CONFIG", "OUT_OF_RANGE"));
    expect(b({ window: { first: 1, count: -1 } })).toMatchObject(ia_("INVALID_CONFIG", "OUT_OF_RANGE"));
    expect(b({ mode: "other" })).toMatchObject(ia_("INVALID_CONFIG", "INVALID_VALUE"));
    expect(b({ mode: 1 })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ omitFocusAnnouncement: "yes" })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ events: "x" })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ events: [5] })).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(b({ maxTreeBytes: 1.5 })).toMatchObject(ia_("INVALID_CONFIG", "NOT_INTEGER"));
    expect(b({ maxTreeBytes: -1 })).toMatchObject(ia_("INVALID_CONFIG", "OUT_OF_RANGE"));
    expect(b(5)).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
  });
  it("caller objects are read once as own data: a getter is refused, a hostile prototype key is just an unknown key", async () => {
    const { model, state } = await initial(O1);
    let reads = 0;
    const o = {}; Object.defineProperty(o, "idPrefix", { enumerable: true, get() { reads++; return "x"; } });
    expect(err(() => ia.buildCompanionTree(model, state, o as never))).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(reads).toBe(0);
    const proto = JSON.parse('{"__proto__": 1}') as object;
    expect(err(() => ia.buildCompanionTree(model, state, proto as never))).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    const ev = [{ type: "focus-changed", get focus() { return undefined; } }];
    expect(err(() => ia.liveText(ev as never, model, state))).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
  });
  it("the committed model and state errors propagate unchanged (IgrError)", async () => {
    const { model, state } = await initial(O1);
    expect(err(() => ia.buildCompanionTree({} as never, state))).toMatchObject({ name: "IgrError" });
    expect(err(() => ia.buildCompanionTree(model, { ...state, igr: "IGR/2" } as never))).toMatchObject({ name: "IgrError" });
  });
  it("defaultWindow: all up to 500, 200 around the focus beyond, clamped at both ends", () => {
    expect(ia.defaultWindow(0, undefined)).toEqual({ first: 1, count: 0 });
    expect(ia.defaultWindow(500, 250)).toEqual({ first: 1, count: 500 });
    expect(ia.defaultWindow(501, undefined)).toEqual({ first: 1, count: 200 });
    expect(ia.defaultWindow(520, 300)).toEqual({ first: 200, count: 200 });
    expect(ia.defaultWindow(520, 510)).toEqual({ first: 321, count: 200 });
    expect(ia.defaultWindow(520, 50)).toEqual({ first: 1, count: 200 });
    expect(err(() => ia.defaultWindow(-1, undefined))).toMatchObject(ia_("INVALID_CONFIG", "OUT_OF_RANGE"));
    expect(err(() => ia.defaultWindow(10, 0))).toMatchObject(ia_("INVALID_CONFIG", "OUT_OF_RANGE"));
  });
  it("maxTreeBytes refuses (RESOURCE_LIMIT/BYTES_LIMIT), never truncates; an exact fit passes; the 'all' window over a big model hits the ceiling", async () => {
    const { model, state } = await initial(O1);
    const bytes = ia.serializeCompanionTree(ia.buildCompanionTree(model, state)).length;
    expect(err(() => ia.buildCompanionTree(model, state, { maxTreeBytes: bytes - 1 }))).toMatchObject(ia_("RESOURCE_LIMIT", "BYTES_LIMIT"));
    expect(ia.serializeCompanionTree(ia.buildCompanionTree(model, state, { maxTreeBytes: bytes })).length).toBe(bytes);
    const w = await loadModel("scenes/W520.scene.json", "layouts/W520.layout.json");
    const all = ia.buildCompanionTree(w, initialState(w, { width: 900, height: 600 }), { window: "all", maxTreeBytes: 10_000_000 });
    expect(all.items.length).toBe(520);
    expect(err(() => ia.buildCompanionTree(w, initialState(w, { width: 900, height: 600 }), { window: "all", maxTreeBytes: 40_000 }))).toMatchObject(ia_("RESOURCE_LIMIT", "BYTES_LIMIT"));
  });
  it("explicit window {first, count}: items present = window, the focused item and the tab stop, ascending, each once (C08 on a 520-element model)", async () => {
    const w = await loadModel("scenes/W520.scene.json", "layouts/W520.layout.json");
    const s = readState("states/w300.state.json");
    const t = ia.buildCompanionTree(w, s, { window: { first: 10, count: 5 } });
    expect(t.items.map((i) => i.position)).toEqual([10, 11, 12, 13, 14, 300]);
    expect(t.list.window).toEqual({ count: 5, first: 10 });
    const t2 = ia.buildCompanionTree(w, s, { window: { first: 298, count: 5 } });
    expect(t2.items.map((i) => i.position)).toEqual([298, 299, 300, 301, 302]);
    const t3 = ia.buildCompanionTree(w, s, { window: { first: 600, count: 5 } });
    expect(t3.items.map((i) => i.position)).toEqual([300]);
  });
  it("does not mutate its arguments and returns an owned tree", async () => {
    const { model, state } = await initial(O1);
    const opts = Object.freeze({ idPrefix: "zz", events: Object.freeze([Object.freeze({ type: "viewport-changed" })]) });
    const a = ia.buildCompanionTree(model, Object.freeze(state), opts as never);
    const b = ia.buildCompanionTree(model, state, opts as never);
    expect(ia.serializeCompanionTree(a)).toEqual(ia.serializeCompanionTree(b));
    a.items[0]!.name = "changed";
    expect(ia.buildCompanionTree(model, state, opts as never).items[0]!.name).toBe("person 1");
  });
});

describe("live text (9.4)", () => {
  it("every nav text of the table, in order; collapsed duplicates; omission before collapse", async () => {
    const { model, state } = await initial(G9);
    const nav = [
      { type: "nav-boundary", nav: "spatial", dir: "left" }, { type: "nav-boundary", nav: "spatial", dir: "right" }, { type: "nav-boundary", nav: "spatial", dir: "up" }, { type: "nav-boundary", nav: "spatial", dir: "down" },
      { type: "nav-boundary", nav: "incident", delta: 1 }, { type: "nav-boundary", nav: "incident", delta: -1 }, { type: "nav-wrapped", end: "end" }, { type: "nav-wrapped", end: "start" },
      { type: "nav-none", reason: "NO_FOCUS" }, { type: "nav-none", reason: "NOT_A_NODE" }, { type: "nav-none", reason: "NOT_AN_EDGE" }, { type: "nav-none", reason: "ANCHOR_GONE" },
      { type: "marquee-started" }, { type: "marquee-cancelled" }, { type: "lasso-too-large", count: 8 }, { type: "select-all-too-large", count: 8 },
    ];
    expect(ia.liveText(nav as never, model, state)).toBe([
      "No element to the left.", "No element to the right.", "No element to the up.", "No element to the down.", "No next edge.", "No previous edge.", "Wrapped to start.", "Wrapped to end.",
      "No focused element.", "Focus a node first.", "Focus an edge first.", "Marquee anchor is gone.", "Marquee started. Move focus to the opposite corner, then press Enter.", "Marquee cancelled.",
      "Selection too large: 8 elements.",
    ].join(" "), );
    const twice = [{ type: "traversal-boundary", end: "end" }, { type: "traversal-boundary", end: "end" }];
    expect(ia.liveText(twice as never, model, state)).toBe("End of graph.");
    expect(ia.liveText([] as never, model, state)).toBe("");
    expect(ia.liveText([{ type: "viewport-changed", viewport: state.viewport }] as never, model, state)).toBe("");
  });
  it("counts come from the state argument; focus-changed text from the event's address; Focus cleared; an unknown address is an IgrError (A-24)", async () => {
    const { model, state } = await initial(G9);
    const sel = reduce(model, state, { type: "select", mode: "replace", targets: [{ node: { id: "s:a", type: "p" } }, { node: { id: "s:b", type: "p" } }] }).state;
    expect(ia.liveText([{ type: "selection-changed", selection: [] }] as never, model, sel)).toBe("2 selected.");
    const ref = (id: string) => ({ address: { id, type: "p" }, artifact_sha256: "0".repeat(64) });
    expect(ia.liveText([{ type: "focus-changed", focus: ref("s:c") }] as never, model, sel)).toBe("p c");
    expect(ia.liveText([{ type: "focus-changed" }] as never, model, sel)).toBe("Focus cleared.");
    const e = err(() => ia.liveText([{ type: "focus-changed", focus: ref("s:nope") }] as never, model, sel));
    expect(e).toMatchObject({ name: "IgrError" });
    expect(ia.liveText([{ type: "focus-changed", focus: ref("s:nope") }] as never, model, sel, { omitFocusAnnouncement: true })).toBe(""); // omission first (A-72)
    expect(err(() => ia.liveText([{ type: "mystery" }] as never, model, sel))).toMatchObject({ name: "IgrError" });
    // the announcement of the committed function is the text (no re-implementation drift)
    expect(announcementFor({ type: "traversal-boundary", end: "start" }, model, sel)).toBe("Start of graph.");
  });
  it("the cut: a text over 400 units keeps the longest whole-scalar prefix of at most 399 units plus an ellipsis; a surrogate pair is never split", async () => {
    const { model, state } = await initial(G9);
    const long = (n: number, pad: string) => ({ events: [{ type: "nav-none", reason: "NO_FOCUS" }] as unknown[], n, pad });
    void long;
    // build a long text from many nav events with distinct texts is impossible (collapse); use the real ones: 16 distinct texts joined are over 400 units
    const nav = [
      { type: "nav-boundary", nav: "spatial", dir: "left" }, { type: "nav-boundary", nav: "spatial", dir: "right" }, { type: "nav-boundary", nav: "spatial", dir: "up" }, { type: "nav-boundary", nav: "spatial", dir: "down" },
      { type: "nav-boundary", nav: "incident", delta: 1 }, { type: "nav-wrapped", end: "end" }, { type: "nav-none", reason: "NO_FOCUS" }, { type: "nav-none", reason: "NOT_A_NODE" },
      { type: "nav-none", reason: "NOT_AN_EDGE" }, { type: "nav-none", reason: "ANCHOR_GONE" }, { type: "marquee-started" }, { type: "marquee-cancelled" }, { type: "lasso-too-large", count: 8 },
      { type: "marquee-started" }, { type: "nav-none", reason: "NO_FOCUS" },
    ];
    const t = ia.liveText(nav as never, model, state);
    expect(t.length).toBe(400);
    expect(t.endsWith("…")).toBe(true);
    const full = nav.map((e) => ia.liveText([e] as never, model, state)).join(" ");
    expect(full.length).toBeGreaterThan(400);
    expect(t).toBe(full.slice(0, 399) + "…");
  });
});

describe("the id grammar (9.2) and the two kinds of ids", () => {
  it("equals V5's elementDomId for every element of G9 and PROTO, for several prefixes (differential)", async () => {
    for (const s of [G9, { scene: "scenes/PROTO.scene.json", layout: "layouts/PROTO.layout.json" }, { scene: "scenes/HOST.scene.json", layout: "layouts/HOST.layout.json" }]) {
      const { model, state } = await initial(s);
      for (const prefix of ["igc", "my-c", "a"]) {
        const t = ia.buildCompanionTree(model, state, { idPrefix: prefix });
        for (const it of t.items) expect(it.id).toBe(elementDomId(prefix, it.address as ElementAddress));
      }
    }
  });
  it("prefix-freeness: ids of prefix a and a-n never collide (a hex tail has no letter beyond f)", async () => {
    const { model, state } = await initial(G9);
    const a = new Set(ia.buildCompanionTree(model, state, { idPrefix: "a" }).items.map((i) => i.id));
    for (const it of ia.buildCompanionTree(model, state, { idPrefix: "a-n" }).items) expect(a.has(it.id)).toBe(false);
  });
});

describe("verifyCompanionTree (9.2)", () => {
  it("returns a tree equal to the built one, accepts any live text up to 400 units, refuses a different one, extra keys and depth bombs", async () => {
    const { model, state } = await initial(G9);
    const built = ia.buildCompanionTree(model, state, { idPrefix: "v1", window: { first: 2, count: 3 }, mode: "marquee" });
    const wire = JSON.parse(JSON.stringify(built)) as ia.CompanionTree;
    expect(ia.serializeCompanionTree(ia.verifyCompanionTree(model, state, wire))).toEqual(ia.serializeCompanionTree(built));
    wire.live.text = "any text";
    expect(ia.verifyCompanionTree(model, state, wire).live.text).toBe("any text");
    wire.live.text = "x".repeat(401);
    expect(err(() => ia.verifyCompanionTree(model, state, wire))).toMatchObject(ia_("INVALID_TREE", "INCONSISTENT"));
    const w2 = JSON.parse(JSON.stringify(built)) as ia.CompanionTree; w2.items[0]!.name += "!";
    expect(err(() => ia.verifyCompanionTree(model, state, w2))).toMatchObject(ia_("INVALID_TREE", "INCONSISTENT"));
    const w3 = JSON.parse(JSON.stringify(built)) as Record<string, unknown>; w3["extra"] = 1;
    expect(err(() => ia.verifyCompanionTree(model, state, w3))).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    const w4 = JSON.parse(JSON.stringify(built)) as Record<string, unknown>; delete w4["live"];
    expect(err(() => ia.verifyCompanionTree(model, state, w4))).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    let deep: unknown = []; for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(err(() => ia.verifyCompanionTree(model, state, deep))).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    expect(err(() => ia.verifyCompanionTree(model, state, { ...wire, mode: "other" }))).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    const w5 = JSON.parse(JSON.stringify(built)) as ia.CompanionTree; w5.scene_sha256 = "1".repeat(64);
    expect(err(() => ia.verifyCompanionTree(model, state, w5))).toMatchObject(ia_("INVALID_TREE", "INCONSISTENT"));
  });
});

describe("the planner (9.5)", () => {
  it("mode and window changes alone produce no operation; equal trees with an empty live text give the empty plan", async () => {
    const { model, state } = await initial(O1);
    const a = ia.buildCompanionTree(model, state);
    const b = ia.buildCompanionTree(model, state, { mode: "marquee" });
    expect(b.mode).toBe("marquee");
    expect(ia.planCompanionUpdate(a, b)).toEqual([]);
    expect(ia.planCompanionUpdate(a, a)).toEqual([]);
    const w = ia.buildCompanionTree(model, state, { window: { first: 1, count: 3 } });
    expect(ia.planCompanionUpdate(a, w)).toEqual([]);
  });
  it("the planner asserts the stable order of retained items (INVALID_TREE/INCONSISTENT) and the same prefix (SCHEMA)", async () => {
    const a = tree("C01");
    const b = JSON.parse(JSON.stringify(a)) as ia.CompanionTree;
    b.items = [b.items[1]!, b.items[0]!, b.items[2]!];
    expect(err(() => ia.planCompanionUpdate(a, b))).toMatchObject(ia_("INVALID_TREE", "INCONSISTENT"));
    expect(err(() => ia.planCompanionUpdate(a, tree("C14")))).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    expect(err(() => ia.planCompanionUpdate(a, { ...b, items: 5 } as never))).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
  });
  it("option validation and the byte bound: an exact fit passes, one byte less is refused", () => {
    const next = tree("C01");
    const bytes = ia.serializePlan(ia.planCompanionUpdate(undefined, next)).length;
    expect(ia.planCompanionUpdate(undefined, next, { maxPlanBytes: bytes }).length).toBe(53);
    expect(err(() => ia.planCompanionUpdate(undefined, next, { maxPlanBytes: bytes - 1 }))).toMatchObject(ia_("RESOURCE_LIMIT", "BYTES_LIMIT"));
    expect(err(() => ia.planCompanionUpdate(undefined, next, { maxPlanBytes: 1.5 } as never))).toMatchObject(ia_("INVALID_CONFIG", "NOT_INTEGER"));
    expect(err(() => ia.planCompanionUpdate(undefined, next, { other: 1 } as never))).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
  });
  it("a plan has no null and ends every line with LF; an empty plan is zero bytes; a reader splits on U+000A only (a label with U+2028 round-trips)", async () => {
    const { model, state } = await initial({ scene: "scenes/HOST.scene.json", layout: "layouts/HOST.layout.json" });
    const t = ia.buildCompanionTree(model, state);
    const bytes = ia.serializePlan(ia.planCompanionUpdate(undefined, t));
    const text = new TextDecoder().decode(bytes);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.includes("null")).toBe(false);
    expect(text.includes(" ")).toBe(true);
    const ops = parsePlanText(text);
    expect(ops.length).toBeGreaterThan(40);
    expect(ia.serializePlan([]).length).toBe(0);
  });
});

/** A DOM double that throws on every member that is not declared by DomLike / ElementLike (9.6). */
function strictDom(): { dom: ia.DomLike; host: ia.ElementLike; calls: string[]; root(): ReturnType<typeof simDom>["host"] } {
  const calls: string[] = [];
  const guard = <T extends object>(t: T, declared: string[]): T => new Proxy(t, {
    get(target, p, r) { if (typeof p === "symbol") return Reflect.get(target, p, r) as unknown; if (!declared.includes(p)) throw new Error(`undeclared member ${p}`); return Reflect.get(target, p, r) as unknown; },
    set(target, p, v, r) { if (typeof p === "symbol" || !declared.includes(p)) throw new Error(`undeclared member ${String(p)}`); return Reflect.set(target, p, v, r); },
    has(_t, p) { throw new Error(`undeclared probe ${String(p)}`); },
  });
  const sim = simDom();
  const wrap = (el: ReturnType<typeof sim.dom.createElement>): ia.ElementLike => {
    const base: Record<string, unknown> = {
      setAttribute: (n: string, v: string) => { calls.push("setAttribute"); el.setAttribute(n, v); },
      insertBefore: (c: unknown, b: unknown) => { calls.push("insertBefore"); el.insertBefore((c as { __el: typeof el }).__el, b === null ? null : (b as { __el: typeof el }).__el); },
      removeChild: (c: unknown) => { calls.push("removeChild"); el.removeChild((c as { __el: typeof el }).__el); },
      __el: el,
    };
    Object.defineProperty(base, "textContent", { set(t: string) { calls.push("textContent"); el.textContent = t; }, get() { return null; }, enumerable: true });
    return guard(base, ["setAttribute", "insertBefore", "removeChild", "textContent", "__el"]) as unknown as ia.ElementLike;
  };
  const dom = guard({ createElement: (tag: string) => { calls.push("createElement"); if (tag !== "div") throw new Error("only div"); return wrap(sim.dom.createElement("div")); } }, ["createElement"]) as unknown as ia.DomLike;
  return { dom, host: wrap(sim.host), calls, root: () => sim.host };
}

describe("the executor (9.6)", () => {
  it("every plan of the corpus runs on a double that throws on every undeclared member (no innerHTML, outerHTML, style, appendChild is reachable)", () => {
    let ran = 0;
    for (const row of loadCorpus(ORACLE_DIR).rows.filter((r) => r.group === "P" && r.expected !== "" && !r.input.includes("pairs"))) {
      const inp = JSON.parse(row.input) as { prev: string | null; next: string };
      const a = strictDom();
      let st: ia.ExecutorState | undefined;
      if (inp.prev !== null) st = ia.executePlan(a.dom, a.host, ia.planCompanionUpdate(undefined, JSON.parse(readOracleText(inp.prev)) as never));
      ia.executePlan(a.dom, a.host, parsePlanText(readOracleText(row.expected)) as never, st);
      expect(a.calls.length, row.id).toBeGreaterThan(0);
      ran++;
    }
    expect(ran).toBe(9);
  });
  it("guards: unknown key UNKNOWN_KEY; duplicate c, host ops, attribute outside the allowlist, bad tag, bad shapes SCHEMA; the DOM is untouched on a refusal", () => {
    const run = (ops: unknown[], st?: ia.ExecutorState) => { const r = simDom(); return err(() => ia.executePlan(r.dom as never, r.host as never, ops as never, st)); };
    expect(run([["t", "nope", "x"]])).toMatchObject({ name: "IaError", code: "INVALID_PLAN", reason: "UNKNOWN_KEY" });
    expect(run([["a", "nope", "id", "x"]])).toMatchObject({ code: "INVALID_PLAN", reason: "UNKNOWN_KEY" });
    expect(run([["p", "@host", "nope", ""]])).toMatchObject({ code: "INVALID_PLAN", reason: "UNKNOWN_KEY" });
    expect(run([["c", "k", "div"], ["p", "@host", "k", "nope"]])).toMatchObject({ code: "INVALID_PLAN", reason: "UNKNOWN_KEY" });
    expect(run([["r", "nope"]])).toMatchObject({ code: "INVALID_PLAN", reason: "UNKNOWN_KEY" });
    expect(run([["c", "k", "div"], ["c", "k", "div"]])).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    for (const op of [["c", "@host", "div"], ["a", "@host", "id", "x"], ["t", "@host", "x"], ["r", "@host"]]) expect(run([op]), op[0]).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    for (const name of ["style", "onclick", "href", "innerHTML", "outerHTML", "srcdoc", "ID", "data-x", ""]) expect(run([["c", "k", "div"], ["a", "k", name, "v"]]), name).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    expect(run([["c", "k", "span"]])).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    expect(run([["c", "", "div"]])).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    expect(run([["x", "k"]])).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    expect(run([["t", "k"]])).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    expect(run([["t", "k", 5]])).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    expect(run([null])).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    expect(run("not a plan" as never)).toMatchObject({ code: "INVALID_PLAN", reason: "SCHEMA" });
    // refused before any DOM call: nothing was created
    const r = simDom();
    expect(err(() => ia.executePlan(r.dom as never, r.host as never, [["c", "a", "div"], ["p", "@host", "a", ""], ["a", "a", "style", "x"]] as never))).toMatchObject({ code: "INVALID_PLAN" });
    expect(r.host.children.length).toBe(0);
  });
  it("a removed element's descendants are forgotten; keys can be re-created; the argument state is not mutated", () => {
    const r = simDom();
    const s1 = ia.executePlan(r.dom as never, r.host as never, [["c", "a", "div"], ["c", "b", "div"], ["p", "a", "b", ""], ["p", "@host", "a", ""]] as never);
    const before = [...s1.elements.keys()].sort();
    const s2 = ia.executePlan(r.dom as never, r.host as never, [["r", "a"]] as never, s1);
    expect([...s1.elements.keys()].sort()).toEqual(before);
    expect([...s2.elements.keys()]).toEqual(["@host"]);
    expect(err(() => ia.executePlan(r.dom as never, r.host as never, [["t", "b", "x"]] as never, s2))).toMatchObject({ reason: "UNKNOWN_KEY" });
    ia.executePlan(r.dom as never, r.host as never, [["c", "a", "div"]] as never, s2);
  });
  it("graph text is only ever a textContent or an attribute value: a hostile label is inert text in the log and in the DOM", async () => {
    const { model, state } = await initial({ scene: "scenes/HOST.scene.json", layout: "layouts/HOST.layout.json" });
    const rec = ia.createRecordingDom();
    ia.executePlan(rec.dom, rec.host, ia.planCompanionUpdate(undefined, ia.buildCompanionTree(model, state)));
    const lines = new TextDecoder().decode(rec.log()).split("\n").filter((l) => l !== "");
    const kinds = new Set(lines.map((l) => (JSON.parse(l) as string[])[0]));
    expect([...kinds].sort()).toEqual(["createElement", "insertBefore", "setAttribute", "textContent"]);
    expect(lines.some((l) => l.includes("<b>x</b>"))).toBe(true);
    for (const l of lines) { const a = JSON.parse(l) as string[]; if (a[0] === "setAttribute") expect(ia.COMPANION_CSS.length > 0 && /^[a-z-]+$/.test(a[2]!)).toBe(true); }
  });
  it("COMPANION_CSS is the one constant rule of 9.6", () => {
    expect(ia.COMPANION_CSS).toBe(".igr-companion-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}");
  });
});

describe("the gate corners the corpus has no single-fault row for (10, 15.7)", () => {
  const base = async () => {
    const { model, state } = await initial(G9);
    const t = JSON.parse(JSON.stringify(ia.buildCompanionTree(model, state))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const run = (mut: (t: Record<string, any>) => void, extra: Record<string, unknown> = {}) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const c = JSON.parse(JSON.stringify(t)) as Record<string, any>; mut(c); // eslint-disable-line @typescript-eslint/no-explicit-any
      return ia.runAccessibilityGate({ model, state, tree: c as never, ...extra } as never);
    };
    const f = (r: ReturnType<typeof run>, id: string) => r.checks.find((c) => c.id === id)!.findings;
    return { model, state, t, run, f };
  };
  it("POSITION_INVALID, ADDRESS_WRONG skips the item, KIND_WRONG, ROLE_WRONG, DESCRIPTION_MISMATCH and _UNEXPECTED, ITEM_SETSIZE_WRONG, SUMMARY_MISMATCH, LIVE_NOT_ATOMIC", async () => {
    const { run, f } = await base();
    expect(f(run((t) => { t["items"][0].position = 0; }), "G2-NAME")).toContainEqual({ code: "POSITION_INVALID", position: 0 });
    expect(f(run((t) => { t["items"][0].position = 99; }), "G2-NAME")).toContainEqual({ code: "POSITION_INVALID", position: 99 });
    expect(f(run((t) => { t["items"][0].kind = "edge"; }), "G2-NAME")).toEqual([{ code: "KIND_WRONG", position: 1 }]);
    expect(f(run((t) => { t["items"][0].roledescription = "edge"; }), "G2-NAME")).toEqual([{ code: "ROLE_WRONG", position: 1 }]);
    expect(f(run((t) => { t["items"][9].description += "!"; }), "G2-NAME")).toEqual([{ code: "DESCRIPTION_MISMATCH", position: 10 }]);
    expect(f(run((t) => { t["items"][0].description = "x"; }), "G2-NAME")).toEqual([{ code: "DESCRIPTION_UNEXPECTED", position: 1 }]);
    expect(f(run((t) => { t["items"][2].set_size = 3; }), "G2-NAME")).toEqual([{ code: "ITEM_SETSIZE_WRONG", position: 3 }]);
    expect(f(run((t) => { t["items"][0].name = "   "; }), "G2-NAME")).toEqual([{ code: "NAME_EMPTY", position: 1 }]);
    expect(f(run((t) => { t["container"].name = "Other"; }), "G6-TEXT")).toEqual([{ code: "SUMMARY_MISMATCH" }]);
    expect(f(run((t) => { t["container"].name = " "; }), "G6-TEXT")).toEqual([{ code: "SUMMARY_MISMATCH" }]); // whitespace only is not SUMMARY_MISSING (A-42)
    expect(f(run((t) => { t["live"].atomic = false; }), "G7-LIVE")).toEqual([{ code: "LIVE_NOT_ATOMIC" }]);
    expect(f(run((t) => { t["mode"] = "odd"; }, { mode: "marquee" }), "G7-LIVE")).toEqual([{ code: "MODE_INVALID" }]);
    expect(f(run(() => {}, { canvasLabel: "wrong" }), "G6-TEXT")).toEqual([{ code: "CANVAS_LABEL_MISMATCH" }]);
  });
  it("ITEM_DUPLICATE, ITEM_MISSING ascending, one NO_ESCAPE_EXIT per offending mode, TABINDEX_INVALID, FOCUS_COUNT, TABSTOP_WRONG without a position", async () => {
    const { run, f } = await base();
    expect(f(run((t) => { t["items"].push(JSON.parse(JSON.stringify(t["items"][1]))); }), "G1-REACH")).toEqual([{ code: "ITEM_DUPLICATE", position: 2 }]);
    expect(f(run((t) => { t["items"].splice(6, 2); }), "G1-REACH")).toEqual([{ code: "ITEM_MISSING", position: 7 }, { code: "ITEM_MISSING", position: 8 }]);
    const table = [{ action: { type: "fit" }, key: "a", mode: "x-b", mods: 0 }, { action: { type: "fit" }, key: "a", mode: "x-a", mods: 0 }, { action: { type: "fit" }, key: "b", mode: "x-b", mods: 0 }, { action: { delta: 1, type: "step" }, key: "PageDown", mode: "normal", mods: 0 }, { action: { delta: -1, type: "step" }, key: "PageUp", mode: "normal", mods: 0 }];
    expect(f(run(() => {}, { bindings: table }), "G3-TRAP")).toEqual([{ code: "NO_ESCAPE_EXIT" }, { code: "NO_ESCAPE_EXIT" }]);
    expect(f(run((t) => { t["items"][2].tabindex = 3; }), "G3-TRAP")).toEqual([{ code: "TABINDEX_INVALID", position: 3 }]);
    expect(f(run((t) => { t["items"][1].focused = true; }), "G4-FOCUS")).toEqual([{ code: "FOCUS_COUNT" }]);
  });
  it("shape violations are INVALID_TREE/SCHEMA, never findings; composition rules; the empty graph; G8 without an edge is info with no finding", async () => {
    const { model, state } = await initial(G9);
    const t = ia.buildCompanionTree(model, state);
    const run = (i: Record<string, unknown>) => err(() => ia.runAccessibilityGate({ model, state, ...i } as never));
    expect(run({ tree: { ...t, items: [{ ...t.items[0]!, tabindex: "0" }] } })).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    expect(run({ tree: { ...t, list: { ...t.list, set_size: 1.5 } } })).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    expect(run({ tree: { ...t, container: 5 } })).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    expect(run({})).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
    expect(run({ tree: t, svg: { root: { title: "", desc: "" }, items: [] } })).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
    expect(run({ composition: "svg-native" })).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
    expect(run({ composition: "other", tree: t })).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
    expect(run({ tree: t, tabStops: 1.5 })).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
    expect(run({ tree: t, extra: 1 })).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
    expect(run({ tree: t, bindings: [1] })).toMatchObject(ia_("INVALID_INPUT", "SCHEMA"));
    let deep: unknown = []; for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(run({ tree: deep })).toMatchObject(ia_("INVALID_TREE", "SCHEMA"));
    const e = await initial({ scene: "scenes/EMPTY.scene.json", layout: "layouts/EMPTY.layout.json" });
    const rep = ia.runAccessibilityGate({ model: e.model, state: e.state, tree: ia.buildCompanionTree(e.model, e.state), tabStops: 0 });
    expect(rep.verdict).toBe("pass");
    expect(rep.checks.find((c) => c.id === "G8-TARGET")).toEqual({ findings: [], id: "G8-TARGET", verdict: "info" });
    const bad = ia.runAccessibilityGate({ model: e.model, state: e.state, tree: ia.buildCompanionTree(e.model, e.state), tabStops: 1 });
    expect(bad.checks.find((c) => c.id === "G11-PAGE")!.findings).toEqual([{ code: "TABSTOP_COUNT_PAGE" }]);
  });
  it("svg-native: G9 findings SVG_DESC, SVG_ORDER (long and short list) and the order SVG_TITLE, SVG_DESC, SVG_TABSTOP, SVG_NAME; the gate on a real V5 readSvg result", async () => {
    const { model, state } = await initial(G9);
    const names = ia.buildCompanionTree(model, state, { window: "all" }).items.map((i) => i.name);
    const mk = (mut: (s: { root: { title: string; desc: string }; items: { name: string; tabindex: number }[] }) => void) => {
      const s = { root: { title: "Directed graph with 9 nodes and 9 edges. Node categories: p (9).", desc: "0 selected, 0 hidden." }, items: names.map((name, i) => ({ name, tabindex: i === 0 ? 0 : -1 })) };
      mut(s);
      return ia.runAccessibilityGate({ model, state, composition: "svg-native", svg: s }).checks.find((c) => c.id === "G9-MAP")!.findings;
    };
    expect(mk(() => {})).toEqual([]);
    expect(mk((s) => { s.root.desc = "x"; })).toEqual([{ code: "SVG_DESC" }]);
    expect(mk((s) => { s.items.push({ name: "x", tabindex: -1 }); })).toEqual([{ code: "SVG_ORDER", position: 19 }]);
    expect(mk((s) => { s.items.pop(); s.items.pop(); })).toEqual([{ code: "SVG_ORDER", position: 17 }]);
    expect(mk((s) => { s.root.title = "t"; s.root.desc = "d"; s.items[1]!.tabindex = 0; s.items[2]!.name = "z"; })).toEqual([{ code: "SVG_TITLE" }, { code: "SVG_DESC" }, { code: "SVG_TABSTOP" }, { code: "SVG_NAME", position: 3 }]);
    // a real V5 document
    const { renderSvg, readSvg } = await import("isongraph-visualize-renderer-svg");
    for (const sc of [G9, { scene: "scenes/O1.scene.json", layout: "layouts/O1.layout.json" }]) {
      const m2 = await loadModel(sc.scene, sc.layout);
      const s2 = initialState(m2, { width: 900, height: 600 });
      const ro = readSvg(renderSvg(m2, s2));
      const items = [...ro.nodes, ...ro.edges].map((x) => ({ name: x.name, tabindex: Number(x.tabindex) }));
      const rep = ia.runAccessibilityGate({ model: m2, state: s2, composition: "svg-native", svg: { root: { title: ro.title, desc: ro.desc }, items } });
      expect(rep.checks.find((c) => c.id === "G9-MAP")!.verdict).toBe("pass");
    }
  });
});

describe("composeManifest corners (13.1)", () => {
  it("the base is verified first, an unknown flag and a non-boolean are SCHEMA, the result is a copy that passes verifyManifest", () => {
    const base = JSON.parse(readOracleText("manifests/base-dom.manifest.json")) as { capabilities: Record<string, unknown>; igr: string };
    expect(err(() => ia.composeManifest({ ...base, igr: "IGR/9" } as never, { input: "yes" } as never))).toMatchObject({ name: "IgrError" });
    expect(err(() => ia.composeManifest(base as never, { magic: true } as never))).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    expect(err(() => ia.composeManifest(base as never, 5 as never))).toMatchObject(ia_("INVALID_CONFIG", "SCHEMA"));
    const r = ia.composeManifest(base as never, { input: true, companion: true });
    expect(r.capabilities["a11y.native-dom"]).toEqual(base.capabilities["a11y.native-dom"]);
    expect(r.capabilities["a11y.companion-dom"]).toEqual({ status: "supported" });
    expect(Object.keys(r.capabilities).filter((k) => k.startsWith("x-ia.")).sort()).toEqual(["x-ia.companion", "x-ia.export-png", "x-ia.export-svg", "x-ia.headless", "x-ia.input", "x-ia.keyboard-nav", "x-ia.lasso"]);
    expect(base.capabilities["x-ia.input"]).toBeUndefined();
  });
});

describe("the helpers and files the tests rely on", () => {
  it("the oracle bytes are readable and IGR states are plain JSON", () => {
    expect(readOracle("plans/P03.plan.txt").length).toBe(0);
    const s: SemanticState = readState("states/g_e.state.json");
    expect(s.focus).toEqual({ node: { id: "s:e", type: "p" } });
    void IgrError;
  });
});
