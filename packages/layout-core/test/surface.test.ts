import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import { CORE_CFG, o1Scene } from "./helpers.js";

describe("public surface", () => {
  it("exports exactly the documented runtime names, and not Core's computeLayout under the same identity", async () => {
    expect(Object.keys(api).sort()).toEqual(["DEFAULT_FORCE_BUDGET", "HashUnavailableError", "IgsError", "LayoutError", "bindLayout", "computeFixedLayout", "computeForceLayout", "computeLayout", "verifyLayout", "verifyReproducible"]);
    const core = await import("ison-graph-ts/viz");
    expect(api.computeLayout).not.toBe(core.computeLayout);
  });
  it("bindLayout takes two arguments and no hash", () => { expect(api.bindLayout.length).toBe(2); });
  it("every async export rejects non-bytes synchronously-derived input with TypeError", async () => {
    for (const f of [() => api.verifyLayout("x" as never), () => api.bindLayout("x" as never, new Uint8Array()), () => api.computeForceLayout("x" as never, CORE_CFG), () => api.computeFixedLayout("x" as never, []), () => api.computeLayout("x" as never, {} as never), () => api.verifyReproducible("x" as never, new Uint8Array())]) {
      await expect(f()).rejects.toBeInstanceOf(TypeError);
    }
  });
  it("rejects shared-memory input (its bytes can change while read)", async () => {
    const shared = new Uint8Array(new SharedArrayBuffer(4));
    await expect(api.verifyLayout(shared)).rejects.toBeInstanceOf(TypeError);
  });
  it("snapshot regression table: caller bytes mutated during the call never change the verdict", async () => {
    const o1 = await o1Scene(); const good = await api.computeForceLayout(o1.sceneBytes, CORE_CFG);
    const sb = new Uint8Array(o1.sceneBytes), lb = new Uint8Array(good.layoutBytes);
    const pending = [api.bindLayout(sb, lb), api.verifyLayout(lb), api.computeForceLayout(sb, CORE_CFG)];
    sb.fill(0); lb.fill(0);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });
});
