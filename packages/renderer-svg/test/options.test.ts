// Design 2.1 steps 2 and 3: option validation, its codes and its (alphabetical) order.
import { describe, expect, it } from "vitest";
import { renderSvg } from "../src/index.js";
import { errOf, o1 } from "./helpers.js";

const run = async (options: unknown): Promise<string> => { const { model, state } = await o1(); return errOf(() => renderSvg(model, state, options as never)); };

describe("2.1 options", () => {
  it("undefined and {} are the defaults and equal", async () => {
    const { model, state } = await o1();
    expect(renderSvg(model, state)).toBe(renderSvg(model, state, {}));
    expect(renderSvg(model, state, undefined)).toBe(renderSvg(model, state, {}));
  });
  it("an own property whose value is undefined is absent (O20's undefined case)", async () => {
    const { model, state } = await o1();
    expect(renderSvg(model, state, { style: undefined, idPrefix: undefined, maxSvgBytes: undefined })).toBe(renderSvg(model, state));
  });
  it("not a plain object: SCHEMA", async () => {
    for (const o of [[], null, 5, "x", true, new Map(), Object.create({ style: true })]) expect(await run(o), String(o)).toBe("INVALID_INPUT/SCHEMA");
  });
  it("unknown key: SCHEMA, also with valid options beside it", async () => {
    expect(await run({ bogus: 1 })).toBe("INVALID_INPUT/SCHEMA");
    expect(await run({ style: false, Style: false })).toBe("INVALID_INPUT/SCHEMA");
  });
  it("wrong JSON type, null included: SCHEMA", async () => {
    for (const o of [{ style: "yes" }, { style: null }, { labels: 1 }, { edgeLabels: "no" }, { xmlDeclaration: 0 }, { idPrefix: 5 }, { idPrefix: null }, { maxSvgBytes: "5" }, { maxDrawnLabelUnits: null }, { maxSvgBytes: true }])
      expect(await run(o), JSON.stringify(o)).toBe("INVALID_INPUT/SCHEMA");
  });
  it("idPrefix pattern: INVALID_VALUE; 1..32 characters", async () => {
    for (const p of ["", "1a", "A", "a_b", "a b", "é", "-a", "a".repeat(33)]) expect(await run({ idPrefix: p }), p).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(await run({ idPrefix: "a" })).toBe("none");
    expect(await run({ idPrefix: "a" + "-9".repeat(15) + "z" })).toBe("none");
  });
  it("numbers: NaN and infinities NOT_FINITE; fractions INVALID_VALUE; outside 0..2^31 OUT_OF_RANGE; the bounds are accepted", async () => {
    for (const k of ["maxSvgBytes", "maxDrawnLabelUnits"]) {
      expect(await run({ [k]: NaN })).toBe("INVALID_INPUT/NOT_FINITE");
      expect(await run({ [k]: Infinity })).toBe("INVALID_INPUT/NOT_FINITE");
      expect(await run({ [k]: -Infinity })).toBe("INVALID_INPUT/NOT_FINITE");
      expect(await run({ [k]: 1.5 })).toBe("INVALID_INPUT/INVALID_VALUE");
      expect(await run({ [k]: -1 })).toBe("INVALID_INPUT/OUT_OF_RANGE");
      expect(await run({ [k]: 2 ** 31 + 1 })).toBe("INVALID_INPUT/OUT_OF_RANGE");
      expect(await run({ [k]: 2 ** 31 })).toBe("none");
      expect(await run({ [k]: -0 })).not.toBe("INVALID_INPUT/OUT_OF_RANGE");
    }
  });
  it("order of checks: alphabetical by option name, after the key set (A-13)", async () => {
    expect(await run({ xmlDeclaration: 1, style: 1, idPrefix: "1", edgeLabels: 1 })).toBe("INVALID_INPUT/SCHEMA"); // edgeLabels first
    expect(await run({ style: 1, idPrefix: "1" })).toBe("INVALID_INPUT/INVALID_VALUE"); // idPrefix before style
    expect(await run({ maxSvgBytes: -1, maxDrawnLabelUnits: 1.5 })).toBe("INVALID_INPUT/INVALID_VALUE"); // maxDrawnLabelUnits before maxSvgBytes
    expect(await run({ style: 1, bogus: 1 })).toBe("INVALID_INPUT/SCHEMA");
    expect(await run({ idPrefix: "1a", bogus: true })).toBe("INVALID_INPUT/SCHEMA"); // the key set is judged first: both SCHEMA
  });
  it("the model is judged before the options, the options before the state (2.1 order)", async () => {
    const { model, state } = await o1();
    expect(errOf(() => renderSvg({ ...model } as never, state, { bogus: 1 } as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    const badState = { ...state, scene_sha256: "0".repeat(64) };
    expect(errOf(() => renderSvg(model, badState, { bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => renderSvg(model, badState))).toBe("INVALID_STATE/SCENE_MISMATCH");
  });
  it("every option changes the document in its documented way", async () => {
    const { model, state } = await o1();
    expect(renderSvg(model, state, { style: false })).not.toContain("<style>");
    expect(renderSvg(model, state, { labels: false })).not.toContain("<text");
    expect(renderSvg(model, state, { edgeLabels: false })).not.toContain('<text class="igr-elabel"');
    expect(renderSvg(model, state, { labels: false, edgeLabels: true })).not.toContain("<text");
    expect(renderSvg(model, state, { xmlDeclaration: true }).startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(renderSvg(model, state)).not.toContain("<?xml");
  });
});
