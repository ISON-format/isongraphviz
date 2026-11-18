// mountCompanion (design 9.6) against a FAKE DOM with the listed members only (design 16 (8)): ownership of one child, update, focus restoration when the active
// element is inside the companion, omitFocusAnnouncement then, error routing with the previous DOM kept, itemAddress, dispose. No browser here; the real
// browser smoke is part of export-core's demo (scripts/browser-smoke.mjs there).
import { describe, expect, it } from "vitest";
import { reduce } from "isongraph-visualize-renderer-core";
import { mountCompanion } from "../src/dom/index.js";
import { G9, initial } from "./helpers.js";

class Doc { activeElement: El | null = null; createElement(tag: string): El { if (tag !== "div") throw new Error("only div"); return new El(this); } }
class El {
  id = ""; attrs = new Map<string, string>(); children: El[] = []; parentNode: El | null = null; text = ""; focusCalls: unknown[] = [];
  constructor(readonly ownerDocument: Doc) {}
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); if (n === "id") this.id = v; }
  set textContent(t: string) { this.text = t; }
  insertBefore(c: El, b: El | null): void {
    if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c);
    c.parentNode = this;
    if (b === null) this.children.push(c); else this.children.splice(this.children.indexOf(b), 0, c);
  }
  removeChild(c: El): void { this.children = this.children.filter((x) => x !== c); c.parentNode = null; }
  contains(o: El | null): boolean { for (let e = o; e; e = e.parentNode) if (e === this) return true; return false; }
  focus(o: unknown): void { this.focusCalls.push(o); this.ownerDocument.activeElement = this; }
  find(id: string): El | undefined { if (this.id === id) return this; for (const c of this.children) { const r = c.find(id); if (r) return r; } return undefined; }
}

describe("mountCompanion", () => {
  it("owns one child of the host, updates in place, answers itemAddress, and removes the root at dispose", async () => {
    const { model, state } = await initial(G9);
    const doc = new Doc(); const host = new El(doc);
    const m = mountCompanion(host as never);
    m.update(model, state);
    expect(host.children.length).toBe(1);
    const root = host.children[0]!;
    expect(root.id).toBe("igc-root");
    const live = root.find("igc-live")!;
    const s2 = reduce(model, state, { type: "select", mode: "replace", targets: [{ node: { id: "s:a", type: "p" } }] }).state;
    const ev = reduce(model, state, { type: "select", mode: "replace", targets: [{ node: { id: "s:a", type: "p" } }] }).events;
    m.update(model, s2, ev);
    expect(host.children[0]).toBe(root);
    expect(live.text).toBe("1 selected.");
    const item = root.find("igc-list")!.children[0]!;
    expect(m.itemAddress(item as never)).toEqual({ node: { id: "s:a", type: "p" } });
    expect(m.itemAddress(root as never)).toBeUndefined();
    m.dispose(); m.dispose();
    expect(host.children.length).toBe(0);
    m.update(model, state);
    expect(host.children.length).toBe(0);
  });
  it("when the active element is inside the companion, DOM focus follows the semantic focus (preventScroll) and the focus announcement is omitted", async () => {
    const { model, state } = await initial(G9);
    const doc = new Doc(); const host = new El(doc);
    const m = mountCompanion(host as never);
    m.update(model, state);
    const root = host.children[0]!;
    const first = root.find("igc-list")!.children[0]!;
    const r0 = reduce(model, state, { type: "focus-step", delta: 1 }); // focus lands on position 1 (the tab stop already)
    m.update(model, r0.state, r0.events);
    doc.activeElement = first;
    const r = reduce(model, r0.state, { type: "focus-step", delta: 1 });
    m.update(model, r.state, r.events);
    const stop = root.find("igc-list")!.children.find((c) => c.attrs.get("tabindex") === "0")!;
    expect(stop).not.toBe(first);
    expect(doc.activeElement).toBe(stop);
    expect(stop.focusCalls).toEqual([{ preventScroll: true }]);
    expect(root.find("igc-live")!.text).toBe("");
    // outside the companion: nothing is focused, the focus text is announced
    doc.activeElement = null;
    const r2 = reduce(model, r.state, { type: "focus-step", delta: 1 });
    m.update(model, r2.state, r2.events);
    expect(doc.activeElement).toBeNull();
    expect(root.find("igc-live")!.text).toBe("p c");
  });
  it("a refused tree keeps the previous DOM and calls onError; it never throws into the caller; a getter-bearing event is refused", async () => {
    const { model, state } = await initial(G9);
    const doc = new Doc(); const host = new El(doc);
    const errors: unknown[] = [];
    const m = mountCompanion(host as never, { idPrefix: "zz", onError: (e) => errors.push(e) });
    m.update(model, state);
    const before = host.children[0]!.find("zz-status")!.text;
    expect(() => m.update(model, { ...state, igr: "IGR/9" } as never)).not.toThrow();
    expect(() => m.update(model, state, [{ type: "x", get focus() { return 1; } }] as never)).not.toThrow();
    expect(errors.length).toBe(2);
    expect(host.children[0]!.find("zz-status")!.text).toBe(before);
    expect(() => mountCompanion(host as never, { onError: () => { throw new Error("x"); } }).update({} as never, state)).not.toThrow();
  });
});
