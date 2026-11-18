// Design 2, 3.1, 3.5, 4.6, 4.9: the constants and the theme table are exactly the written values.
import { describe, expect, it } from "vitest";
import {
  ARROW_HALF, ARROW_LEN, CV_FORMAT, DEFAULT_CV_READ_LIMITS, DEFAULT_DL_LIMITS, DEFAULT_DL_READ_LIMITS, DEGENERATE, DL_COORD_MAX, DL_FORMAT, ELABEL_DY,
  GUARD_MARGIN, LABEL_DY, LOOP_END, PAR_STEP, PICK_FORMAT, PICK_SEG, EDGE_PICK_TOLERANCE, THEME_FORMAT, TRIM, XR_FORMAT,
} from "../src/constants.js";
import { PALETTE, THEME } from "../src/theme.js";

describe("constants", () => {
  it("format tokens", () => {
    expect([DL_FORMAT, THEME_FORMAT, PICK_FORMAT, CV_FORMAT, XR_FORMAT]).toEqual(["igr-dl/1", "igr-theme/1", "igr-pick/1", "igr-cv/1", "igr-xr/1"]);
  });
  it("limits", () => {
    expect(DEFAULT_DL_LIMITS).toEqual({ maxDlBytes: 67_108_864, maxDrawnLabelUnits: 1_048_576 });
    expect(DEFAULT_DL_READ_LIMITS).toEqual({ maxBytes: 67_108_864, maxLineUnits: 16_777_216 });
    expect(DEFAULT_CV_READ_LIMITS).toEqual({ maxBytes: 268_435_456, maxLineUnits: 16_777_216 });
    expect(Object.isFrozen(DEFAULT_DL_LIMITS) && Object.isFrozen(DEFAULT_DL_READ_LIMITS) && Object.isFrozen(DEFAULT_CV_READ_LIMITS)).toBe(true);
  });
  it("coordinate limit, guard margin and the V5 geometry constants", () => {
    expect(DL_COORD_MAX).toBe(2 ** 40);
    expect(GUARD_MARGIN).toBe(256_000);
    expect([TRIM, DEGENERATE, LABEL_DY, ELABEL_DY, PAR_STEP, LOOP_END]).toEqual([12, 24, 24, 4, 16, 7]);
    expect([ARROW_LEN, ARROW_HALF, PICK_SEG, EDGE_PICK_TOLERANCE]).toEqual([10000, 5000, 16, 6000]);
  });
});

describe("theme igr-theme/1 (4.9)", () => {
  it("the palette", () => {
    expect(PALETTE).toEqual([[42, 120, 214], [235, 104, 52], [27, 175, 122], [237, 161, 0], [232, 123, 164], [0, 131, 0], [74, 58, 167], [227, 73, 72], [122, 121, 117]]);
  });
  it("the slots", () => {
    const s = THEME.slots;
    expect(s["halo-sel"]).toEqual({ width: 6, alpha: 0.35, dash: [] });
    expect(s["halo-foc"]).toEqual({ width: 10, alpha: 0.25, dash: [6, 4] });
    expect(s["line"]).toEqual({ width: 2, alpha: 0.6, dash: [] });
    expect(s["arrow"]).toEqual({ alpha: 0.6 });
    expect(s["ring-sel"]).toEqual({ width: 3, alpha: 1, dash: [], radius: 14 });
    expect(s["ring-foc"]).toEqual({ width: 2, alpha: 1, dash: [4, 3], radius: 18 });
    expect(s["disc"]).toEqual({ width: 2, alpha: 1, dash: [], radius: 10 });
    expect(s["label"]).toEqual({ alpha: 1 });
    expect(THEME.ink).toEqual([34, 34, 34]);
    expect(THEME.white).toEqual([255, 255, 255]);
    expect([THEME.font, THEME.textAlign, THEME.textBaseline, THEME.direction]).toEqual(["12px sans-serif", "center", "alphabetic", "ltr"]);
    expect(THEME.format).toBe("igr-theme/1");
  });
  it("is deeply frozen", () => {
    expect(Object.isFrozen(THEME) && Object.isFrozen(THEME.slots) && Object.isFrozen(THEME.slots["halo-foc"]) && Object.isFrozen(THEME.slots["halo-foc"]!.dash)).toBe(true);
    expect(Object.isFrozen(PALETTE) && Object.isFrozen(PALETTE[0])).toBe(true);
  });
});
