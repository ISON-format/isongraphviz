import { bindLayout } from "isongraph-visualize-layout-core";
import { describe, expect, it } from "vitest";
import { SPEC_A, SPEC_B, SPEC_C, WORKED, prevDrawing, sceneBytes, sha } from "./helpers.js";

describe("test helpers reproduce the section 5.6 inputs (scene and previous layout hashes)", () => {
  it("previous drawing", async () => {
    const d = await prevDrawing();
    expect(await sha(d.sceneBytes)).toBe(WORKED.prevScene);
    expect(await sha(d.layoutBytes)).toBe(WORKED.prevLayout);
    const b = await bindLayout(d.sceneBytes, d.layoutBytes);
    expect(b.sceneSha256).toBe(WORKED.prevScene);
  });
  it("scenes A, B, C", async () => {
    expect(await sha(await sceneBytes(SPEC_A))).toBe(WORKED.A.scene);
    expect(await sha(await sceneBytes(SPEC_B))).toBe(WORKED.B.scene);
    expect(await sha(await sceneBytes(SPEC_C))).toBe(WORKED.C.scene);
  });
});
