// pickElement (9.3): validation order and codes, the rule, and the invariants RT-A, RT-B, RT-C (9.2).
import { describe, expect, it } from "vitest";
import { hitTest, initialState, reduce, resolveSelection, selectionReference, type ElementAddress } from "isongraph-visualize-renderer-core";
import { decodeElementId, elementDomId, pickElement, readSvg, renderSvg } from "../src/index.js";
import { MIXED20, O1, O4, SIZE, errOf, loadModel, o1, readOracle } from "./helpers.js";

const P = "igr";
const I1: ElementAddress = { node: { id: "i:1", type: "person" } };
const ANN: ElementAddress = { node: { id: "s:ann", type: "person" } };
const KNOWS: ElementAddress = { edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } };

describe("validation order and codes (9.3)", () => {
  it("(1) model, (2) state, (3) prefix, (4) input shape, (5) targetId type, (6) point", async () => {
    const { model, state } = await o1();
    const bad = { ...state, scene_sha256: "0".repeat(64) };
    expect(errOf(() => pickElement({ ...model } as never, bad, "1", 5 as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    expect(errOf(() => pickElement(model, bad, "1", 5 as never))).toBe("INVALID_STATE/SCENE_MISMATCH");
    expect(errOf(() => pickElement(model, state, "1", 5 as never))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => pickElement(model, state, P, 5 as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => pickElement(model, state, P, null as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => pickElement(model, state, P, [] as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => pickElement(model, state, P, { bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => pickElement(model, state, P, { targetId: 5 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => pickElement(model, state, P, { targetId: null } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => pickElement(model, state, P, { targetId: 5, point: { x: NaN, y: 0 } } as never))).toBe("INVALID_INPUT/SCHEMA"); // (5) before (6)
  });
  it("point: exactly x and y numbers; NOT_FINITE; |v| <= 2^31", async () => {
    const { model, state } = await o1();
    const f = (point: unknown) => errOf(() => pickElement(model, state, P, { point } as never));
    expect(f(5)).toBe("INVALID_INPUT/SCHEMA");
    expect(f(null)).toBe("INVALID_INPUT/SCHEMA");
    expect(f({ x: 1 })).toBe("INVALID_INPUT/SCHEMA");
    expect(f({ x: 1, y: 2, z: 3 })).toBe("INVALID_INPUT/SCHEMA");
    expect(f({ x: "1", y: 2 })).toBe("INVALID_INPUT/SCHEMA");
    expect(f({ x: NaN, y: 2 })).toBe("INVALID_INPUT/NOT_FINITE");
    expect(f({ x: 1, y: Infinity })).toBe("INVALID_INPUT/NOT_FINITE");
    expect(f({ x: 2 ** 31 + 1, y: 0 })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(f({ x: 0, y: -(2 ** 31) - 1 })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(f({ x: 2 ** 31, y: -(2 ** 31) })).toBe("none");
  });
  it("the point is checked even when the id alone would decide (the verdict never depends on the branch)", async () => {
    const { model, state } = await o1();
    expect(errOf(() => pickElement(model, state, P, { targetId: elementDomId(P, I1), point: { x: NaN, y: 0 } }))).toBe("INVALID_INPUT/NOT_FINITE");
  });
  it("an undefined property is absent; an empty input picks nothing", async () => {
    const { model, state } = await o1();
    expect(pickElement(model, state, P, {})).toBeUndefined();
    expect(pickElement(model, state, P, { targetId: undefined, point: undefined })).toBeUndefined();
  });
});

describe("the rule (9.3)", () => {
  it("a node id returns the node whatever the point", async () => {
    const { model, state } = await o1();
    expect(pickElement(model, state, P, { targetId: elementDomId(P, I1), point: { x: 867.9, y: 406.4 } })).toEqual(I1);
  });
  it("an edge id with a point near a node returns the node; away from nodes returns the edge", async () => {
    const { model, state } = await o1();
    const id = elementDomId(P, KNOWS);
    expect(pickElement(model, state, P, { targetId: id, point: { x: 32, y: 193.6 } })).toEqual(I1);
    expect(pickElement(model, state, P, { targetId: id, point: { x: 867.9, y: 406.4 } })).toEqual(ANN);
    expect(pickElement(model, state, P, { targetId: id, point: { x: 500, y: 100 } })).toEqual(KNOWS);
    expect(pickElement(model, state, P, { targetId: id })).toEqual(KNOWS);
  });
  it("a hidden or unknown or undecodable target falls back to hitTest, else undefined; never an element that is not drawn", async () => {
    const { model, state } = await o1();
    const h = reduce(model, state, { type: "set-hidden", targets: [ANN], hidden: true }).state;
    expect(pickElement(model, h, P, { targetId: elementDomId(P, ANN) })).toBeUndefined();
    expect(pickElement(model, h, P, { targetId: elementDomId(P, KNOWS) })).toBeUndefined();
    expect(pickElement(model, h, P, { targetId: elementDomId(P, ANN), point: { x: 867.9, y: 406.4 } })).toBeUndefined();
    expect(pickElement(model, h, P, { targetId: elementDomId(P, { node: { id: "i:99", type: "person" } }) })).toBeUndefined();
    expect(pickElement(model, h, P, { targetId: "garbage", point: { x: 32, y: 193.5 } })).toEqual(I1);
    expect(pickElement(model, state, P, { targetId: elementDomId("other", I1) })).toBeUndefined(); // another prefix
  });
  it("the id decides among edges: a conflicting edge midpoint never changes the answer (K100)", async () => {
    const m = await loadModel(MIXED20.scene, MIXED20.layout);
    const st = initialState(m, SIZE);
    const e7 = { edge: m.edges[7]!.ref }, e26 = { edge: m.edges[26]!.ref };
    expect(hitTest(m, st, { x: 184.517, y: 216.904 })).toEqual(e7);
    expect(pickElement(m, st, P, { targetId: elementDomId(P, e26), point: { x: 184.517, y: 216.904 } })).toEqual(e26);
    expect(pickElement(m, st, P, { targetId: elementDomId(P, e7), point: { x: 184.517, y: 216.904 } })).toEqual(e7);
  });
});

describe("RT-A, RT-B, RT-C over whole documents (9.2)", () => {
  const cases = [
    ["O1", O1, async (m: Awaited<ReturnType<typeof loadModel>>) => initialState(m, SIZE)],
    ["mixed20", MIXED20, async (m: Awaited<ReturnType<typeof loadModel>>) => initialState(m, SIZE)],
    ["O4 (self-loop)", O4, async (m: Awaited<ReturnType<typeof loadModel>>) => initialState(m, SIZE)],
  ] as const;
  for (const [name, fx, mk] of cases) {
    it(`${name}: ids decode to the drawn set; every drawn element round-trips by id; the chain reaches the ObjectRef and the source identity`, async () => {
      const m = await loadModel(fx.scene, fx.layout);
      const st = await mk(m);
      const doc = renderSvg(m, st);
      const ro = readSvg(doc);
      const decoded = [...ro.nodes.map((n) => decodeElementId(P, n.id)!), ...ro.edges.map((e) => decodeElementId(P, e.id)!)];
      // RT-A: equals the effectively visible set, nodes then edges in scene order
      expect(decoded).toEqual([...m.nodes.map((n) => ({ node: n.ref })), ...m.edges.map((e) => ({ edge: e.ref }))]);
      const source = readOracle(fx.source);
      for (const a of decoded) {
        expect(pickElement(m, st, P, { targetId: elementDomId(P, a) })).toEqual(a); // RT-B
        const ref = selectionReference(m, a);
        expect(ref.artifact_sha256).toBe(ro.artifact_sha256);
        const idn = await resolveSelection(m, a, source);
        expect(idn.artifact_sha256).toBe(ro.artifact_sha256);
        expect(idn.kind).toBe("node" in a ? "node" : "edge");
      }
      // RT-C(a): a geometric hit is always drawn
      for (let k = 0; k < 400; k++) {
        const p = { x: (k * 37) % 900 + 0.25, y: (k * 91) % 600 + 0.5 };
        const h = hitTest(m, st, p);
        if (h !== undefined) expect(decoded).toContainEqual(h);
      }
    });
  }
});
