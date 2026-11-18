// The extra rows (ext:) of this implementation, parameterized by the implementation under test like the oracle rows (design 13.5, 14 (3)). They pin behaviour
// that no corpus row separates, found by the independent audit of step 2 with its own mutants (audit M-11): the harness runs them against the scratch copies
// (scripts/mutate.mjs, with scripts/mutants-extra.mjs) and test/extra.test.ts runs them against src. They are never reported as oracle rows.
import type { DisplayList } from "isongraph-visualize-display-list";
import { canon, createFakeCanvas, createFakeGl, sha16 } from "../fake-gl.js";
import { eq, fail } from "./corpus.js";
import type { GlImpl, RowResult } from "./runner.js";

const A = (id: string) => ({ id, type: "t" });
const EDGE = (src: string, tgt: string) => ({ ord: "0", rel: "r", src: A(src), tgt: A(tgt) });
const HASH = { artifactSha256: "1".repeat(64), sceneSha256: "2".repeat(64), layoutSha256: "3".repeat(64) };

/** A list at 900 x 600 with two nodes inside the view and one edge record (any coordinates: the list need not be geometrically consistent). */
function edgeList(e: number[], flags = 0): DisplayList {
  return {
    format: "igr-dl/1", width: 900, height: 600, directed: false, ...HASH, nodes: [A("s:a"), A("s:b")], edges: [EDGE("s:a", "s:b")],
    records: [["E", 3, flags, 0, ...e], ["N", 1, 0, 0, 100000, 100000], ["N", 2, 0, 0, 800000, 500000]],
  } as unknown as DisplayList;
}
function farNodes(flags: [number, number]): DisplayList {
  return { format: "igr-dl/1", width: 900, height: 600, directed: false, ...HASH, nodes: [A("s:a"), A("s:b")], edges: [], records: [["N", 1, 0, flags[0], -2_000_000_000, 300000], ["N", 2, 0, flags[1], 2_000_000_000, 300000]] } as unknown as DisplayList;
}
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/** The header of a plan edited (read with every rule disabled, written again): the way to a plan with exactly one fault. */
function withHeader(impl: GlImpl, bytes: Uint8Array, edit: (h: Record<string, unknown>) => void): Uint8Array {
  const p = impl.readGlPlan(bytes, { lenient: true });
  const h = JSON.parse(JSON.stringify(p.header)) as Record<string, unknown>;
  edit(h);
  return impl.serializePlan({ ...p, header: h as never });
}
const rejectedBy = (impl: GlImpl, bytes: Uint8Array, rule: string): void => {
  let msg = "";
  try { impl.parseGlPlan(bytes); } catch (e) { msg = (e as Error).message; }
  if (!msg.includes(`${rule}:`)) fail(`expected a rejection by ${rule}, got ${JSON.stringify(msg)}`);
  try { impl.readGlPlan(bytes, { skip: [rule] }); } catch (e) { fail(`with ${rule} skipped the plan must be accepted (a single fault): ${(e as Error).message}`); }
};

export async function runExtra(impl: GlImpl, g01: Uint8Array): Promise<RowResult[]> {
  const out: RowResult[] = [];
  const run = async (id: string, f: () => Promise<void> | void): Promise<void> => {
    try { await f(); out.push({ id, ok: true }); } catch (e) { out.push({ id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  };
  const ce = (list: DisplayList): unknown => impl.planGl(list).header.ce;

  // A01: the box test is closed in x (a box that touches the guard box on its side meets it); B19 pins the y direction only
  await run("ext:A01", () => {
    // guard box right side 1000 * 900 + 256000 = 1156000; the edge box is the polygon expanded by 12000: its left side touches at x = 1168000
    eq("ext:A01 touching", ce(edgeList([1168000, 300000, 1268000, 300000])), []);
    eq("ext:A01 one m-px away", ce(edgeList([1168001, 300000, 1268000, 300000])), [[3, 0]]);
    eq("ext:A01 left side", ce(edgeList([-1268000, 300000, -268000, 300000])), []);
  });
  // A06: a clipped segment parallel to a side and exactly on it (p = 0, q = 0) is not rejected; B18 pins q < 0 only
  await run("ext:A06", () => {
    const plan = impl.planGl(edgeList([-256000, -20_000_000, -256000, 300000]));
    eq("ext:A06 emitted", plan.header.ce, []);
    eq("ext:A06 one instance", plan.header.sizes.edge, 40);
  });
  // A15: G13 "no repeats" in the element table
  await run("ext:A15", () => {
    const lines = dec(g01.slice(0, 836)).split("\n");
    const dup = [lines[0], lines[1], lines[1], ...lines.slice(3)].join("\n");
    const b = new Uint8Array(836 - lines[2]!.length + lines[1]!.length + g01.length - 836);
    b.set(enc(dup)); b.set(g01.slice(836), enc(dup).length);
    rejectedBy(impl, b, "G13");
  });
  // A16: G15 "ascending and unique": a repeated cn entry
  await run("ext:A16", () => {
    const base = impl.serializePlan(impl.planGl(farNodes([1, 0])));
    const b = withHeader(impl, base, (h) => { h["cn"] = [[1, 1], [2, 0], [2, 0]]; });
    rejectedBy(impl, b, "G15");
  });
  // A17: G16 coverage of EDGES: an edge that is neither drawn nor listed in ce
  await run("ext:A17", () => {
    const base = impl.serializePlan(impl.planGl(edgeList([20_000_000, 300000, 30_000_000, 300000])));
    eq("ext:A17 precondition", impl.parseGlPlan(base).header.ce, [[3, 0]]);
    rejectedBy(impl, withHeader(impl, base, (h) => { h["ce"] = []; }), "G16");
  });
  // A22: commit in `failed` stores the plan, and the next restore draws the latest one
  await run("ext:A22", () => {
    const planA = impl.parseGlPlan(g01);
    const planB = impl.planGl(edgeList([300000, 300000, 600000, 300000]));
    // the failed phase: a restore whose creation fails (compile) with the context usable
    const log2: string[] = [];
    const o2 = { log: log2, failCompile: undefined as string | undefined };
    const gl2 = createFakeGl(o2);
    const canvas2 = createFakeCanvas({ log: log2, webgl2: gl2, logGetContext: false });
    const ctl2 = impl.createGlController(canvas2, {});
    ctl2.initialize(); ctl2.commit(planA);
    gl2.lost = true; canvas2.fire("webglcontextlost");
    gl2.lost = false; o2.failCompile = "disc.fs"; canvas2.fire("webglcontextrestored");
    if (ctl2.status().phase !== "failed") fail(`setup: expected failed, got ${ctl2.status().phase}`);
    ctl2.commit(planB);
    gl2.lost = true; canvas2.fire("webglcontextlost");
    gl2.lost = false; o2.failCompile = undefined; log2.length = 0; canvas2.fire("webglcontextrestored");
    if (ctl2.status().phase !== "ready") fail(`expected ready, got ${ctl2.status().phase}`);
    const uploaded = log2.filter((l) => l.startsWith('["bufferData"')).map((l) => (JSON.parse(l) as unknown[])[3]);
    const want = (["arrow", "disc", "edge"] as const).filter((p) => planB.buffers[p].length > 0).map((p) => sha16(planB.buffers[p]));
    eq("ext:A22 the latest plan is drawn", uploaded, want);
  });
  // A33: the focus flag of an OMITTED edge (ce) reaches the readout
  await run("ext:A33", () => {
    const plan = impl.planGl(edgeList([20_000_000, 300000, 30_000_000, 300000], 2));
    eq("ext:A33 ce", plan.header.ce, [[3, 2]]);
    eq("ext:A33 focus", canon(impl.readoutFromGl(plan).marked.focus), canon({ edge: EDGE("s:a", "s:b") }));
  });

  // ---- design rev 5 rules that no corpus row reaches (oracle A-39/A-40) --------------------------------------------------------------------------------
  // F1: G12 "at most one element is focused": two focus flags in cn/ce entries, or in layers 2 and 6
  await run("ext:F1", () => {
    rejectedBy(impl, impl.serializePlan(impl.planGl(farNodes([2, 2]))), "G12");
    // a node focus (layer 6) together with a focused omitted edge (ce flag 2): two distinct elements
    const l = edgeList([20_000_000, 300000, 30_000_000, 300000], 2);
    (l.records as unknown as unknown[][])[1]![3] = 2; // node 1 focused too
    rejectedBy(impl, impl.serializePlan(impl.planGl(l)), "G12");
    // one focus is fine, and the same element named twice (a clipped edge repeats its pid in layer 2) is one element
    impl.parseGlPlan(impl.serializePlan(impl.planGl(farNodes([2, 0]))));
  });
  // F2: the focus clause counts the flags of OMITTED elements (cn/ce) together with layers 2 and 6
  await run("ext:F2", () => {
    // an edge drawn with focus (layer 2) and an OMITTED node with focus (cn flag 2): two distinct elements
    const l = {
      format: "igr-dl/1", width: 900, height: 600, directed: false, ...HASH, nodes: [A("s:a"), A("s:b"), A("s:c")], edges: [EDGE("s:a", "s:b")],
      records: [["E", 4, 2, 0, 100000, 100000, 700000, 400000], ["N", 1, 0, 0, 100000, 100000], ["N", 2, 0, 0, 700000, 400000], ["N", 3, 0, 2, 900_000_000, 300000]],
    } as unknown as DisplayList;
    rejectedBy(impl, impl.serializePlan(impl.planGl(l)), "G12");
  });
  // F3: a plan with two foci read without its rules reports NO focus (never an arbitrary one)
  await run("ext:F3", () => {
    const two = impl.readGlPlan(impl.serializePlan(impl.planGl(farNodes([2, 2]))), { lenient: true });
    eq("ext:F3 none", impl.readoutFromGl(two).marked.focus, undefined);
    eq("ext:F3 one", canon(impl.readoutFromGl(impl.planGl(farNodes([0, 2]))).marked.focus), canon({ node: A("s:b") }));
  });
  // C1/C2: (failed, R) outcomes
  const failedCtl = (): { gl: ReturnType<typeof createFakeGl>; o: { log: string[]; failCompile?: string; failLink?: string }; canvas: ReturnType<typeof createFakeCanvas>; ctl: ReturnType<GlImpl["createGlController"]>; statuses: string[]; errors: string[] } => {
    const log: string[] = [];
    const o: { log: string[]; failCompile?: string; failLink?: string } = { log };
    const gl = createFakeGl(o);
    const canvas = createFakeCanvas({ log, webgl2: gl, logGetContext: false });
    const statuses: string[] = [], errors: string[] = [];
    const ctl = impl.createGlController(canvas, {
      onStatus: (s: { phase: string; failure?: string }) => statuses.push(`${s.phase}:${s.failure ?? ""}`),
      onError: (e: { detail?: string }) => errors.push(String(e.detail)),
    } as never);
    ctl.initialize(); ctl.commit(impl.parseGlPlan(g01));
    gl.lost = true; canvas.fire("webglcontextlost");
    gl.lost = false; o.failCompile = "disc.fs"; canvas.fire("webglcontextrestored");
    if (ctl.status().phase !== "failed") fail(`setup: expected failed, got ${ctl.status().phase}`);
    statuses.length = 0; errors.length = 0;
    return { gl, o, canvas, ctl, statuses, errors };
  };
  await run("ext:C1", () => {
    const r = failedCtl();
    delete r.o.failCompile; r.gl.lost = false; r.gl.loseAfterArrowVs = true;
    r.canvas.fire("webglcontextrestored");
    eq("ext:C1 phase", r.ctl.status().phase, "lost");
    eq("ext:C1 failure cleared", r.ctl.status().failure, undefined);
    eq("ext:C1 onStatus once", r.statuses, ["lost:"]);
    eq("ext:C1 no onError", r.errors, []);
  });
  await run("ext:C2", () => {
    const r = failedCtl();
    delete r.o.failCompile; r.o.failLink = "edge"; r.gl.lost = false;
    r.canvas.fire("webglcontextrestored");
    eq("ext:C2 phase", r.ctl.status().phase, "failed");
    eq("ext:C2 new token", r.ctl.status().failure, "LINK_FAILED");
    eq("ext:C2 onError once", r.errors, ["LINK_FAILED"]);
    eq("ext:C2 no onStatus", r.statuses, []);
  });
  // C3: the release rule: loseContext() at dispose only on a context that was obtained and is not lost, in every phase
  await run("ext:C3", () => {
    const releases = (setup: (gl: ReturnType<typeof createFakeGl>, canvas: ReturnType<typeof createFakeCanvas>, ctl: ReturnType<GlImpl["createGlController"]>, o: { failCompile?: string }) => void): number => {
      const log: string[] = [];
      const o: { log: string[]; failCompile?: string } = { log };
      const gl = createFakeGl(o);
      const canvas = createFakeCanvas({ log, webgl2: gl, logGetContext: false });
      const ctl = impl.createGlController(canvas, {});
      setup(gl, canvas, ctl, o);
      log.length = 0;
      ctl.dispose();
      return log.filter((l) => l === '["loseContext"]').length;
    };
    eq("ext:C3 created, lost during creation", releases((gl, _c, ctl) => { gl.loseAfterArrowVs = true; try { ctl.initialize(); } catch { /* expected */ } }), 0);
    eq("ext:C3 ready", releases((_g, _c, ctl) => { ctl.initialize(); }), 1);
    eq("ext:C3 lost", releases((gl, c, ctl) => { ctl.initialize(); gl.lost = true; c.fire("webglcontextlost"); }), 0);
    eq("ext:C3 created after a failed initialize (usable context)", releases((_g, _c, ctl, o) => { o.failCompile = "disc.fs"; try { ctl.initialize(); } catch { /* expected */ } }), 1);
    eq("ext:C3 failed (usable context)", releases((gl, c, ctl, o) => { ctl.initialize(); gl.lost = true; c.fire("webglcontextlost"); gl.lost = false; o.failCompile = "disc.fs"; c.fire("webglcontextrestored"); }), 1);
  });
  return out;
}
