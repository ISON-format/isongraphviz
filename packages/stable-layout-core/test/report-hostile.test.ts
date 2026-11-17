import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { describe, expect, it } from "vitest";
import { verifyDisplacementReport } from "../src/index.js";

const R = 1000;
/** A canonical, self-consistent incremental report with K kept records and S seed records (audit I-3). Positions: kept i at (i, 0); every seed at (K + 2R, 0). */
function hostile(K: number, S: number): Uint8Array {
  const ref = (i: number) => ({ id: `i:${i}`, type: "n" });
  const nodes: unknown[] = [];
  for (let i = 1; i <= K; i++) nodes.push({ dist: 0, dx: 0, dy: 0, ref: ref(i), status: "kept", x: i, x_prev: i, y: 0, y_prev: 0 });
  for (let j = 1; j <= S; j++) nodes.push({ anchor_kind: "seed", anchor_x: K + R, anchor_y: 0, direction: 0, offset: R, ref: ref(K + j), ring: 0, status: "added", wave: 0, x: K + 2 * R, y: 0 });
  const hex = "a".repeat(64);
  return canonicalBytesSigned({
    address_scheme: "igs-addr/1",
    aggregate: { added: S, common: K, max_dist: 0, max_offset: R, mean_dist: 0, moved: 0, moved_ppm: 0, removed: 0, rms_dist: 0, sum_dist: "0", sum_dist_sq: "0" },
    edges: { added: [], common: 0, removed: [] },
    extent: { next: { present: true, min_x: 1, min_y: 0, max_x: K + 2 * R, max_y: 0 }, previous: { present: true, min_x: 1, min_y: 0, max_x: K, max_y: 0 } },
    igls: "IGLS/1", mode: "incremental",
    next: { directed: true, layout_sha256: hex, scene_sha256: hex },
    nodes,
    placement: { algorithm: "igl-stable-place/1", max_rings: 4, min_separation: 800, present: true, radius: R },
    previous: { directed: true, layout_sha256: hex, present: true, scene_sha256: hex },
    scale: 1000, transform_hint: { present: true, dx: 0, dy: 0 },
  } as unknown as CJValue);
}
const best = async (b: Uint8Array, runs = 3): Promise<number> => {
  let m = Infinity;
  for (let i = 0; i < runs; i++) { const t = process.hrtime.bigint(); await verifyDisplacementReport(b); m = Math.min(m, Number(process.hrtime.bigint() - t) / 1e6); }
  return m;
};

describe("a large hostile report is verified in linear time (audit I-3: kept records were re-walked for every seed record)", () => {
  it("the hostile report is accepted (it is canonical and self-consistent)", async () => {
    const v = await verifyDisplacementReport(hostile(50, 50));
    expect(v.report.aggregate).toMatchObject({ added: 50, common: 50 });
  });
  it("4x the records takes about 4x the time, not 16x (K = S: 3,000 against 12,000 each)", { timeout: 120_000 }, async () => {
    const small = hostile(3000, 3000), large = hostile(12000, 12000);
    await best(hostile(300, 300), 1); // warm up
    const t1 = await best(small), t2 = await best(large);
    // quadratic work would give a ratio near 16; linear work near 4. The bound leaves a wide margin for scheduler noise.
    expect(t2 / Math.max(t1, 1)).toBeLessThan(9);
    expect(t2).toBeLessThan(3000);
  });
  it("the work charged is unchanged: V1 = 3 * records", async () => {
    const b = hostile(10, 10);
    await expect(verifyDisplacementReport(b, { budget: { maxWork: 60 } })).resolves.toBeDefined();
    await expect(verifyDisplacementReport(b, { budget: { maxWork: 59 } })).rejects.toMatchObject({ reason: "WORK_LIMIT" });
  });
});
