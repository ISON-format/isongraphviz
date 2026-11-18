// Design 4.4, 4.5: buildDisplayList and dryLabelPass beyond the oracle rows: derivations, validation order, purity, snapshots.
import { describe, expect, it } from "vitest";
import { IgrError, effectiveVisibility, reduce } from "isongraph-visualize-renderer-core";
import { buildDisplayList, dryLabelPass, parseDisplayList, serializeDisplayList } from "../src/index.js";
import { arrowhead } from "../src/geometry.js";
import { LOOPS2, O1, O4, errOf, initial, loadModel, o1, readState } from "./helpers.js";

const text = (b: Uint8Array): string => new TextDecoder().decode(b);

describe("the arrowhead rule (4.4(e))", () => {
  it("the worked example of A.1", () => {
    expect(arrowhead(856299n, 403439n, 43701n, 196561n)).toEqual([856299n, 403439n, 845374n, 405817n, 847842n, 396127n]);
  });
  it("a zero-length direction points along +x", () => {
    expect(arrowhead(10n, 10n, 10n, 10n)).toEqual([10n, 10n, -9990n, 5010n, -9990n, -4990n]);
  });
  it("b2 is computed on its own, not mirrored from b1 (a half-way fraction rounds up on both sides: the offsets differ by one)", () => {
    // direction (3, 4) of length 5: 5000*4/5 = 4000 exactly; use (1, 2): lam = 2, 5000*2/2 = 5000 exact; use (2, 3): lam = 3, 5000*3/3 exact;
    // (1, 3): lam = 3, -dy*5000/3 = -5000 (exact) and dx*5000/3 = 1666.67 -> 1667 for b1y, -1666.67 -> -1667 for b2y; a half case: (1, 1): lam = 1
    const t = arrowhead(0n, 0n, -1n, -1n); // dx = dy = 1, lam = isqrt(2) = 1
    expect(t[2]! - t[4]!).toBe(-10000n); // b1x = bcx - 5000, b2x = bcx + 5000
    const u = arrowhead(0n, 0n, -3n, -4n); // dx = 3, dy = 4, lam = 5
    expect([u[2], u[3], u[4], u[5]]).toEqual([-6000n + -4000n, -8000n + 3000n, -6000n + 4000n, -8000n - 3000n]);
  });
  it("the tip is the last point and the base centre is 10 px behind it (form 1 and 2 use the point before the end)", async () => {
    const { model, state } = await initial(O1);
    const list = buildDisplayList(model, state);
    const e = list.records.find((r) => r[0] === "E")!, a = list.records.find((r) => r[0] === "A")!;
    expect([a[2], a[3]]).toEqual([e[6], e[7]]);
  });
});

describe("buildDisplayList", () => {
  it("is pure: the same inputs give the same bytes and the caller's state and options are not modified", async () => {
    const { model, state } = await o1();
    const frozen = JSON.parse(JSON.stringify(state)) as typeof state;
    const opts = Object.freeze({ labels: true });
    expect(text(serializeDisplayList(buildDisplayList(model, state, opts)))).toBe(text(serializeDisplayList(buildDisplayList(model, state, opts))));
    expect(state).toEqual(frozen);
  });
  it("the list is the element table plus E A N T records in file order, pids are table positions", async () => {
    const { model, state } = await initial(LOOPS2);
    const list = buildDisplayList(model, state);
    expect(list.format).toBe("igr-dl/1");
    expect(list.nodes.length).toBe(2);
    const kinds = list.records.map((r) => r[0]).join("");
    expect(kinds).toMatch(/^(EA)+N+T+$/);
    for (const r of list.records) expect(r[1]).toBeGreaterThanOrEqual(1);
    expect(list.records.filter((r) => r[0] === "N").map((r) => r[1])).toEqual([1, 2]);
  });
  it("a hidden element is absent, not styled, and an edge whose endpoint is hidden is absent too", async () => {
    const { model, state } = await o1();
    const s = reduce(model, state, { type: "set-hidden", targets: [{ node: { id: "s:ann", type: "person" } }], hidden: true }).state;
    const list = buildDisplayList(model, s);
    expect(list.nodes.map((n) => n.id)).toEqual(["i:1"]);
    expect(list.edges).toEqual([]);
    expect(list.records.map((r) => r[0])).toEqual(["N", "T"]);
    expect(effectiveVisibility(model, s).edges).toEqual([false]);
  });
  it("the output survives the strict reader and re-serializes to itself", async () => {
    for (const m of [O1, O4, LOOPS2]) {
      const { model, state } = await initial(m);
      const b = serializeDisplayList(buildDisplayList(model, state));
      expect(text(serializeDisplayList(parseDisplayList(b)))).toBe(text(b));
    }
  });
  it("a coordinate beyond 2^40 refuses the whole list with path dl.coord", async () => {
    const model = await loadModel("../oracles-dl/scenes/far-u.scene.json", "../oracles-dl/layouts/far-u.layout.json");
    let err: unknown;
    try { buildDisplayList(model, readState("states/N14.state.json")); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(IgrError);
    expect((err as IgrError).path).toBe("dl.coord");
    expect(() => buildDisplayList(model, readState("states/N13.state.json"))).not.toThrow();
  });
});

describe("validation order (4.5): the model, the options, then the state", () => {
  it("a non-model wins over bad options and a bad state", async () => {
    const { state } = await o1();
    expect(errOf(() => buildDisplayList({} as never, state, { bogus: 1 } as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
  });
  it("a bad option wins over an invalid state", async () => {
    const { model } = await o1();
    expect(errOf(() => buildDisplayList(model, { bogus: true } as never, { labels: 3 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => buildDisplayList(model, { bogus: true } as never))).toMatch(/^INVALID_STATE\//);
  });
  it("INVALID_STATE of serializeState passes through unchanged (a click-order selection is NON_CANONICAL)", async () => {
    const { model } = await o1();
    expect(errOf(() => buildDisplayList(model, readState("states/Y15.state.json")))).toBe("INVALID_STATE/NON_CANONICAL");
    expect(errOf(() => buildDisplayList(model, readState("states/Y14.state.json")))).toBe("INVALID_STATE/SCENE_MISMATCH");
  });
  it("each caller property of the options is read once, before the first record", async () => {
    const { model, state } = await o1();
    let reads = 0;
    const o = { get labels(): boolean { reads++; return true; }, get edgeLabels(): boolean { reads++; return true; } };
    buildDisplayList(model, state, o);
    expect(reads).toBe(2);
  });
});

describe("dryLabelPass (4.4(g) alone)", () => {
  it("equals the fidelity of the build on the oracle options", async () => {
    const { model, state } = await o1();
    expect(dryLabelPass(model, state)).toEqual({ labels: "full", edge_labels: true, label_units: 9 });
    expect(dryLabelPass(model, state, { labels: false })).toEqual({ labels: "none", edge_labels: false, label_units: 0 });
    expect(dryLabelPass(model, state, { edgeLabels: false })).toEqual({ labels: "full", edge_labels: false, label_units: 4 });
    expect(dryLabelPass(model, state, { maxDrawnLabelUnits: 8 })).toEqual({ labels: "elided", edge_labels: true, label_units: 4 });
    expect(dryLabelPass(model, state, { maxDrawnLabelUnits: 0 })).toEqual({ labels: "elided", edge_labels: true, label_units: 0 });
  });
  it("never throws for coordinates and still validates the model, the options and the state", async () => {
    const far = await loadModel("../oracles-dl/scenes/far-u.scene.json", "../oracles-dl/layouts/far-u.layout.json");
    expect(dryLabelPass(far, readState("states/N14.state.json")).labels).toBe("full");
    expect(errOf(() => dryLabelPass({} as never, {} as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    expect(errOf(() => dryLabelPass(far, readState("states/N14.state.json"), { labels: "no" } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a label whose only change is the xs substitution is not elided (D-DRAW), one with a TAB is", async () => {
    const { model, state } = await initial({ scene: "../oracles-svg/scenes/illegal.scene.json", layout: "../oracles-svg/layouts/illegal.layout.json" });
    expect(dryLabelPass(model, state).labels).toBe("full");
    const ctl = await initial({ scene: "../oracles-svg/scenes/ctl.scene.json", layout: "../oracles-svg/layouts/ctl.layout.json" });
    expect(dryLabelPass(ctl.model, ctl.state).labels).toBe("full");
    const trunc = await initial({ scene: "../oracles-svg/scenes/trunc.scene.json", layout: "../oracles-svg/layouts/trunc.layout.json" });
    expect(dryLabelPass(trunc.model, trunc.state).labels).toBe("elided");
  });
});
