// Design 6.1-6.3, 6.6, 9.3: the replay against a strict double, the style cache, the recorder, the stream reader, the witness and the stream readout.
import { describe, expect, it } from "vitest";
import { buildDisplayList, serializeReadout, readoutFromList, type DisplayList } from "../src/index.js";
import { canvasStreamWitness, createRecordingContext, readoutFromCanvasStream, recordCanvasCalls, replayCanvas, type Canvas2DLike } from "../src/canvas2d/index.js";
import { LOOPS2, MIXED20, O1, O4, bytesOf, errOf, initial, readOracleText, textOf } from "./helpers.js";

const METHODS = ["beginPath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "arc", "closePath", "fill", "stroke", "fillText", "clearRect", "setTransform", "setLineDash"];
const PROPS = ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign", "textBaseline", "direction"];

/** A double that throws on every member of a real 2D context that 6.1 does not list: a replay must not touch one. */
function strictDouble(log: string[]): Canvas2DLike {
  const target: Record<string, unknown> = {};
  for (const m of METHODS) target[m] = (...a: unknown[]) => { log.push(`${m}(${a.map((x) => JSON.stringify(x)).join(",")})`); };
  for (const p of PROPS) Object.defineProperty(target, p, { get: () => undefined, set: (v: unknown) => { log.push(`${p}=${JSON.stringify(v)}`); } });
  return new Proxy(target, {
    get(t, k) { if (typeof k === "string" && !(k in t)) throw new Error(`forbidden read of ${k}`); return t[k as string]; },
    set(t, k, v) { if (typeof k === "string" && !PROPS.includes(k)) throw new Error(`forbidden assignment to ${k}`); (t as Record<string, unknown>)[k as string] = v; return true; },
  }) as unknown as Canvas2DLike;
}

async function list(m: { scene: string; layout: string }, state?: Parameters<typeof buildDisplayList>[1]): Promise<DisplayList> {
  const i = await initial(m);
  return buildDisplayList(i.model, state ?? i.state);
}

describe("the replay touches only the members of 6.1", () => {
  it("a strict double replays a full list (no save, restore, translate, scale, clip, measureText, ...)", async () => {
    for (const m of [O1, O4, LOOPS2, MIXED20]) {
      const log: string[] = [];
      replayCanvas(await list(m), strictDouble(log));
      expect(log[0]).toBe("setTransform(1,0,0,1,0,0)");
      expect(log.some((l) => l.startsWith("fillText"))).toBe(true);
    }
  });
  it("coordinates are m / 1000 (one correctly rounded division) and arcs end at 2 pi", async () => {
    const log: string[] = [];
    replayCanvas(await list(O1), strictDouble(log));
    expect(log).toContain("moveTo(43.701,196.561)");
    expect(log).toContain(`arc(32.072,193.6,10,0,${JSON.stringify(2 * Math.PI)})`);
    expect(log).toContain("fillText(\"KNOWS\",450,296)");
  });
});

describe("the style cache (6.2)", () => {
  it("is empty at the start of every replay: two replays into one context issue the same assignments", async () => {
    const l = await list(O1);
    const log: string[] = [];
    const ctx = strictDouble(log);
    replayCanvas(l, ctx);
    const first = log.splice(0);
    replayCanvas(l, ctx);
    expect(log).toEqual(first);
  });
  it("assigns a property only when its value differs from the last assigned one", async () => {
    const log: string[] = [];
    replayCanvas(await list(MIXED20), strictDouble(log));
    const fills = log.filter((l) => l.startsWith("fillStyle="));
    for (let i = 1; i < fills.length; i++) expect(fills[i]).not.toBe(fills[i - 1]);
  });
  it("the dash is part of the cache: setLineDash is issued on a change only", async () => {
    const { model, state } = await initial(O1);
    const s = JSON.parse(JSON.stringify(state)) as typeof state;
    s.focus = { node: { id: "s:ann", type: "person" } };
    const log: string[] = [];
    replayCanvas(buildDisplayList(model, s), strictDouble(log));
    expect(log.filter((l) => l.startsWith("setLineDash"))).toEqual(["setLineDash([])", "setLineDash([4,3])", "setLineDash([])"]);
  });
});

describe("options (6.2)", () => {
  it("the layers option selects and orders; [] replays the prologue only; layer 1..8 elements follow the list order", async () => {
    const l = await list(O1);
    expect(textOf(recordCanvasCalls(l, { layers: [] }))).toBe('["m","setTransform",1000,0,0,1000,0,0]\n["m","clearRect",0,0,900000,600000]\n');
    const t = textOf(recordCanvasCalls(l, { layers: [8, ] }));
    expect(t).not.toContain('"stroke"');
  });
  it("the validation is alphabetical: dprMilli, ink, layers, onElement; an unknown key is SCHEMA", async () => {
    const l = await list(O1);
    const run = (o: unknown): string => errOf(() => recordCanvasCalls(l, o as never));
    expect(run({ ink: "red", dprMilli: 1.5 })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ layers: [3, 1], ink: [1, 2] })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ onElement: 1, layers: [9] })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ font: "x" })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ dprMilli: "1000" })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ dprMilli: NaN })).toBe("INVALID_INPUT/NOT_FINITE");
    expect(run({ ink: ["1", 2, 3] })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ ink: [1.5, 2, 3] })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ layers: ["a"] })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ layers: "8" })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ onElement: null })).toBe("INVALID_INPUT/SCHEMA");
    expect(run(7)).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ dprMilli: 250 })).toBe("none");
    expect(run({ dprMilli: 8000 })).toBe("none");
  });
  it("caller-owned options: an accessor and a __proto__ key are refused, each property is read once", async () => {
    const l = await list(O1);
    expect(errOf(() => recordCanvasCalls(l, { get dprMilli() { return 1000; } } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => recordCanvasCalls(l, JSON.parse('{"__proto__": 1}') as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("onElement is called with (pid, layer) before the element's style assignments, in layer then record order", async () => {
    const l = await list(O1);
    const order: string[] = [];
    const log: string[] = [];
    const ctx = strictDouble(log);
    replayCanvas(l, ctx, { onElement: (pid, layer) => { order.push(`${pid}/${layer}`); log.push(`#${pid}/${layer}`); } });
    expect(order).toEqual(["3/3", "3/4", "1/7", "2/7", "1/8", "2/8", "3/8"]);
    expect(log.indexOf("#3/3")).toBeLessThan(log.indexOf("strokeStyle=\"rgb(34,34,34)\""));
  });
  it("the text of a label reaches fillText unmodified (no isolation characters, no normalisation, no trimming)", async () => {
    const i = await initial({ scene: "scenes/hostile.scene.json".replace(/^/, "../oracles-dl/"), layout: "layouts/hostile.layout.json".replace(/^/, "../oracles-dl/") });
    const l = buildDisplayList(i.model, i.state);
    const log: string[] = [];
    replayCanvas(l, strictDouble(log));
    const drawn = log.filter((x) => x.startsWith("fillText")).map((x) => JSON.parse(/^fillText\(("[\s\S]*"),-?\d/.exec(x)![1]!) as string);
    expect(drawn).toEqual(l.records.filter((r) => r[0] === "T").map((r) => r[5]));
  });
});

describe("the recorder (6.3)", () => {
  it("writes a number as round(a x 1000) and refuses one that is not a whole number of milli-units", () => {
    const r = createRecordingContext();
    r.ctx.moveTo(1.5, -2.25);
    r.ctx.lineWidth = 0.35;
    r.ctx.setLineDash([6, 4]);
    expect(textOf(r.bytes())).toBe('["m","moveTo",1500,-2250]\n["s","lineWidth",350]\n["m","setLineDash",[6000,4000]]\n');
    expect(() => r.ctx.moveTo(0.0004, 0)).toThrow();
    expect(() => r.ctx.arc(0, 0, 1, 0, Math.PI)).toThrow();
    expect(() => r.ctx.arc(0, 0, 1, 1, 2 * Math.PI)).toThrow();
  });
  it("arc angles are the tokens 0 and TAU; reset() empties the stream", () => {
    const r = createRecordingContext();
    r.ctx.arc(1, 2, 10, 0, 2 * Math.PI);
    expect(textOf(r.bytes())).toBe('["m","arc",1000,2000,10000,0,"TAU"]\n');
    r.reset();
    expect(r.bytes().length).toBe(0);
  });
  it("records string property values as they are and a marker through the hook", () => {
    const r = createRecordingContext();
    r.ctx.font = "12px sans-serif";
    r.onElement(4, 7);
    expect(textOf(r.bytes())).toBe('["s","font","12px sans-serif"]\n["#",4,7]\n');
  });
  it("recordCanvasCalls is a pure function of (list, dprMilli, ink, layers)", async () => {
    const l = await list(MIXED20);
    expect(textOf(recordCanvasCalls(l))).toBe(textOf(recordCanvasCalls(l, { dprMilli: 1000, ink: [34, 34, 34], layers: [1, 2, 3, 4, 5, 6, 7, 8] })));
    expect(textOf(recordCanvasCalls(l, { ink: [255, 0, 128] }))).toContain("rgb(255,0,128)");
    expect(textOf(recordCanvasCalls(l, { dprMilli: 1500 }))).toContain('["m","setTransform",1500,0,0,1500,0,0]');
  });
});

describe("the stream reader, the witness and the readout (6.6, 9.3)", () => {
  const C01 = readOracleText("calls/C01.calls");
  it("a stream read back gives the readout of the list", async () => {
    for (const m of [O1, O4, LOOPS2, MIXED20]) {
      const l = await list(m);
      expect(textOf(serializeReadout(readoutFromCanvasStream(recordCanvasCalls(l), l)))).toBe(textOf(serializeReadout(readoutFromList(l))));
    }
  });
  it("is strict: a non-canonical line, an unknown method or property, markers out of order or outside the table are refused", async () => {
    const l = await list(O1);
    const run = (s: string): string => errOf(() => readoutFromCanvasStream(bytesOf(s), l));
    expect(run(C01)).toBe("none");
    expect(run(C01.replace('["m","beginPath"]', '["m", "beginPath"]'))).toBe("INVALID_INPUT/SCHEMA");
    expect(run(C01.replace('"beginPath"', '"save"'))).toBe("INVALID_INPUT/SCHEMA");
    expect(run(C01.replace('"strokeStyle"', '"shadowBlur"'))).toBe("INVALID_INPUT/SCHEMA");
    expect(run(C01.replace('["#",3,4]', '["#",3,2]'))).toBe("INVALID_INPUT/SCHEMA"); // a layer going down
    expect(run(C01.replace('["#",3,4]', '["#",9,4]'))).toBe("INVALID_INPUT/SCHEMA"); // a pid outside the table
    expect(run(C01.replace('["#",2,7]', '["#",1,7]'))).toBe("INVALID_INPUT/SCHEMA"); // a pid repeated within a layer
    expect(run(C01.replace('["#",3,4]', '["#",1,4]'))).toBe("INVALID_INPUT/SCHEMA"); // a node pid in an edge layer
    expect(run(C01.replace('["#",1,7]', '["#",3,7]'))).toBe("INVALID_INPUT/SCHEMA"); // an edge pid in a node layer
    expect(run(C01.replace('["#",3,3]', '["#",3,3]\n["x"]'))).toBe("INVALID_INPUT/SCHEMA");
    expect(run(C01.slice(0, -1))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("the witness lists the elements painted in their mandatory layer, in table order, and has no texts", async () => {
    const l = await list(O1);
    const w = canvasStreamWitness(recordCanvasCalls(l), l);
    expect(w.backend).toBe("igr-cv/1");
    expect(w.elements.nodes.map((n) => n.id)).toEqual(["i:1", "s:ann"]);
    expect(w.elements.edges.map((e) => e.rel)).toEqual(["KNOWS"]);
    expect(w.texts).toEqual([]);
    const dropped = C01.replace(/\["#",1,7\]\n(?:\["[ms]",.*\]\n)*?(?=\["#",2,7\])/, '["#",1,7]\n');
    const w2 = canvasStreamWitness(bytesOf(dropped), l);
    expect(w2.elements.nodes.map((n) => n.id)).toEqual(["s:ann"]);
  });
  it("an edge needs a stroke in layer 3 and a node a fill and a stroke in layer 7; one without the other is not drawn", async () => {
    const l = await list(O1);
    const noFill = C01.replace(/\["#",1,7\][\s\S]*?\["m","arc",32072,193600,10000,0,"TAU"\]\n\["m","fill"\]\n/, '["#",1,7]\n["m","beginPath"]\n["m","arc",32072,193600,10000,0,"TAU"]\n');
    expect(canvasStreamWitness(bytesOf(noFill), l).elements.nodes.map((n) => n.id)).toEqual(["s:ann"]);
  });
  it("the readout takes node centres from the arc of layer 7, never from the label anchors", async () => {
    const l = await list(O1);
    const moved = C01.replace('["m","arc",32072,193600,10000,0,"TAU"]', '["m","arc",32073,193600,10000,0,"TAU"]');
    expect(readoutFromCanvasStream(bytesOf(moved), l).nodes_at[0]).toMatchObject({ x: 32073, y: 193600 });
  });
});
