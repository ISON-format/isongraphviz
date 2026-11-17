import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeStableLayout, diffScenes, measureDisplacement, snapshotLayout, verifyDisplacementReport, verifyStable, verifyStableReproducible } from "../src/index.js";
import { PLACE_56, SPEC_A, SPEC_C, cr, prevDrawing, sceneBytes, text } from "./helpers.js";

const FIX = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const o1 = (): Uint8Array => new Uint8Array(readFileSync(FIX + "oracles/o1-basic.scene.json"));
const CFG = { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 };

describe("C-1: every caller-supplied input is snapshotted before the first await (design 2.2)", () => {
  it("coldStart mutated after the call does not change the layout bytes", async () => {
    const ref = await computeStableLayout(null, o1(), { coldStart: { ...CFG } });
    const mine = { ...CFG };
    const pending = computeStableLayout(null, o1(), { coldStart: mine }); // not awaited
    mine.seed = 999; mine.iterations = 3; mine.width = 5000;
    const raced = await pending;
    expect(text(raced.layout.layoutBytes)).toBe(text(ref.layout.layoutBytes));
    expect(raced.layout.layout.policy.config).toEqual(CFG);
  });
  it("forceBudget mutated after the call does not change the verdict (computeStableLayout)", async () => {
    const fb = { maxNodes: 1 };
    const pending = computeStableLayout(null, o1(), { coldStart: { ...CFG }, forceBudget: fb });
    fb.maxNodes = 1_000_000;
    await expect(pending).rejects.toMatchObject({ code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" });
  });
  it("forceBudget mutated after the call does not change the verdict (verifyStableReproducible)", async () => {
    const cold = await computeStableLayout(null, o1(), { coldStart: { ...CFG } });
    const fb = { maxNodes: 1 };
    const pending = verifyStableReproducible(null, o1(), cold.layout.layoutBytes, cold.reportBytes, { forceBudget: fb });
    fb.maxNodes = 1_000_000;
    await expect(pending).rejects.toMatchObject({ code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" });
  });
  it("a getter-backed coldStart is read once, synchronously", async () => {
    let reads = 0;
    const cfg = { get width(): number { reads++; return 900; }, height: 600, iterations: 170, margin: 60, seed: 42 };
    const pending = computeStableLayout(null, o1(), { coldStart: cfg });
    expect(reads).toBe(1);
    await pending;
    expect(reads).toBe(1);
  });
});

const revoked = (): object => { const r = Proxy.revocable({}, {}); r.revoke(); return r.proxy; };
const badProto = (): object => new Proxy({}, { getPrototypeOf() { throw new Error("gp"); } });
const badTag = (): object => ({ get [Symbol.toStringTag](): string { throw new Error("tag"); } });
const R = "INVALID_REQUEST/UNREADABLE";

describe("I-1: a revoked Proxy, a throwing trap or a throwing Symbol.toStringTag never escapes as a raw error", () => {
  // `cr` rethrows anything that is not a StableLayoutError, so every call below also proves "no raw TypeError/Error".
  it("a revoked Proxy is INVALID_REQUEST/UNREADABLE in every argument position", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_C);
    const rep = (await computeStableLayout(prev, c, { placement: PLACE_56 })).reportBytes;
    const h = revoked() as never;
    const calls: [string, () => Promise<unknown>][] = [
      ["compute previous", () => computeStableLayout(h, c, { placement: PLACE_56 })],
      ["compute scene", () => computeStableLayout(prev, h, { placement: PLACE_56 })],
      ["compute options", () => computeStableLayout(prev, c, h)],
      ["compute budget", () => computeStableLayout(prev, c, { placement: PLACE_56, budget: h })],
      ["compute placement", () => computeStableLayout(prev, c, { placement: h })],
      ["compute coldStart", () => computeStableLayout(prev, c, { placement: PLACE_56, coldStart: h })],
      ["compute prev.scene", () => computeStableLayout({ sceneBytes: h, layoutBytes: prev.layoutBytes }, c, { placement: PLACE_56 })],
      ["compute prev.layout", () => computeStableLayout({ sceneBytes: prev.sceneBytes, layoutBytes: h }, c, { placement: PLACE_56 })],
      ["diff", () => diffScenes(h, c)], ["diff options", () => diffScenes(c, c, h)],
      ["measure", () => measureDisplacement(h, prev)], ["measure next", () => measureDisplacement(prev, h)], ["measure options", () => measureDisplacement(prev, prev, h)],
      ["snapshot", () => snapshotLayout(h)], ["snapshot options", () => snapshotLayout(prev, h)],
      ["report", () => verifyDisplacementReport(h)], ["report options", () => verifyDisplacementReport(rep, h)],
      ["verifyStable prev", () => verifyStable(h, c, c, rep)], ["verifyStable layout", () => verifyStable(prev, c, h, rep)], ["verifyStable options", () => verifyStable(prev, c, c, rep, h)],
      ["reproducible report", () => verifyStableReproducible(prev, c, c, h)], ["reproducible options", () => verifyStableReproducible(prev, c, c, rep, h)],
      ["reproducible forceBudget", () => verifyStableReproducible(prev, c, c, rep, { forceBudget: h })],
    ];
    for (const [name, f] of calls) expect(await cr(f), name).toBe(R);
  });
  it("a throwing Symbol.toStringTag where bytes are expected, and a throwing getPrototypeOf trap where a budget is expected, are UNREADABLE", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_A);
    const rep = (await computeStableLayout(prev, c, { placement: PLACE_56 })).reportBytes;
    expect(await cr(() => computeStableLayout(prev, badTag() as never, { placement: PLACE_56 }))).toBe(R);
    expect(await cr(() => diffScenes(badTag() as never, c))).toBe(R);
    expect(await cr(() => verifyDisplacementReport(badTag() as never))).toBe(R);
    expect(await cr(() => verifyStable(prev, c, badTag() as never, rep))).toBe(R);
    expect(await cr(() => computeStableLayout(prev, c, { placement: PLACE_56, budget: badProto() } as never))).toBe(R);
    expect(await cr(() => snapshotLayout(prev, { budget: badProto() } as never))).toBe(R);
    expect(await cr(() => verifyDisplacementReport(rep, { budget: badProto() } as never))).toBe(R);
  });
  it("the other hostile shapes in every position are always a StableLayoutError or a success, never a raw error", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_A);
    const out = await computeStableLayout(prev, c, { placement: PLACE_56 });
    const rep = out.reportBytes, lay = out.layout.layoutBytes;
    for (const h of [badProto(), badTag()] as never[]) {
      for (const f of [
        () => computeStableLayout(h, c, { placement: PLACE_56 }), () => computeStableLayout(prev, c, h), () => computeStableLayout(prev, c, { placement: h }),
        () => computeStableLayout(prev, c, { placement: PLACE_56, coldStart: h }), () => measureDisplacement(h, prev), () => snapshotLayout(h),
        () => verifyStable(h, c, lay, rep), () => verifyStableReproducible(prev, c, lay, rep, { forceBudget: h }),
      ]) await cr(f);
    }
  });
});
