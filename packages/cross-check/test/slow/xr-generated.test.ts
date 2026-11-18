// XR-1 over generated models (design 9.5: "and by the harness cross-check on the corpus models and on the differential tier's generated models using the real
// packages"): seeded random models with plain and hostile strings, random intents, the shared label options. Many seeds; the fast suite runs the corpus scenes.
import { describe, expect, it } from "vitest";
import { IgrError, type Intent, type RenderModel, type ElementAddress } from "isongraph-visualize-renderer-core";
import { compareReadouts } from "isongraph-visualize-display-list";
import { createCanvasRenderer } from "isongraph-visualize-renderer-canvas";
import { createSvgRenderer } from "isongraph-visualize-renderer-svg";
import { createWebglRenderer } from "isongraph-visualize-renderer-webgl";
import { lcg, randomModel, type Rng } from "../gen.js";
import { bytes, readouts } from "../helpers.js";

const SIZE = { width: 640, height: 480 };
function randomIntent(m: RenderModel, rng: Rng): Intent {
  const el = (): ElementAddress => (m.edges.length > 0 && rng.int(3) === 0 ? { edge: rng.pick(m.edges).ref } : { node: rng.pick(m.nodes).ref });
  const targets = (): ElementAddress[] => Array.from({ length: rng.int(4) }, () => el());
  switch (rng.int(8)) {
    case 0: return { type: "select", mode: rng.pick(["replace", "add", "remove", "toggle"] as const), targets: targets() };
    case 1: return { type: "clear-selection" };
    case 2: return { type: "focus", ...(rng.int(4) === 0 ? {} : { target: el() }) };
    case 3: return { type: "focus-step", delta: rng.pick([1, -1] as const) };
    case 4: return { type: "set-hidden", targets: targets(), hidden: rng.int(3) !== 0 };
    case 5: return { type: "pan", dx: rng.int(400) - 200, dy: rng.int(400) - 200 };
    case 6: return { type: "zoom", factor_milli: 100 + rng.int(3000) };
    default: return { type: "fit" };
  }
}

async function run(seed: number, intents: number, hostile: boolean): Promise<number> {
  const model = await randomModel(seed, { hostile, maxNodes: hostile ? 14 : 30 });
  const rng = lcg(seed * 31 + 7);
  const opts = { labels: rng.int(5) !== 0, edgeLabels: rng.int(3) !== 0, maxDrawnLabelUnits: rng.pick([1, 5, 24, 1_048_576]) };
  const svg = createSvgRenderer({ svg: opts } as never), cv = createCanvasRenderer({ dl: opts }), gl = createWebglRenderer({ dl: opts });
  const all = [svg, cv, gl];
  for (const r of all) { await r.initialize({ host: "headless", size: SIZE, reducedMotion: false }); await r.loadScene(model); }
  let checked = 0;
  for (let i = 0; i <= intents; i++) {
    if (i > 0) {
      const intent = randomIntent(model, rng);
      for (const r of all) { try { r.dispatch(intent); } catch (e) { if (!(e instanceof IgrError)) throw e; } }
    }
    const state = svg.getState();
    expect(JSON.stringify(cv.getState())).toBe(JSON.stringify(state));
    const four = readouts(model, state, opts);
    const ref = bytes(four.dl);
    expect(bytes(four.svg), `seed ${seed} step ${i} rho_svg`).toBe(ref);
    expect(bytes(four.canvas)).toBe(ref);
    expect(bytes(four.gl)).toBe(ref);
    expect(compareReadouts([{ renderer: "svg", readout: four.svg }, { renderer: "cv", readout: four.canvas }, { renderer: "gl", readout: four.gl }])).toEqual({ agree: true, differences: [] });
    for (const r of all) { const rep = r.probe(); expect(rep.drawn).toEqual(four.dl.drawn); expect(rep.marked).toEqual(four.dl.marked); }
    checked++;
  }
  return checked;
}

describe("XR-1 over generated models with plain strings, 30 seeds x 40 intents", () => {
  for (let seed = 1000; seed < 1030; seed++) it(`seed ${seed}`, async () => { expect(await run(seed, 40, false)).toBeGreaterThan(5); });
});
describe("XR-1 over generated models with hostile strings (all scalar classes), 30 seeds x 20 intents", () => {
  for (let seed = 2000; seed < 2030; seed++) it(`seed ${seed}`, async () => { expect(await run(seed, 20, true)).toBeGreaterThan(3); });
});
