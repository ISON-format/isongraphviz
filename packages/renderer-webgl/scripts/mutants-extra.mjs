// Seven extra mutants (not in the corpus K table) for the behaviour that the independent audit of step 2 found unpinned by every oracle row (audit M-11). Each is
// an exact-text patch of a scratch copy like the K table, and each must be killed by an ext: row of test/oracle/ext.ts, never by a corpus row alone.
const G = (file, find, replace, count = 1) => ({ pkg: "gl", file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });

export const EXTRA_MUTANTS = [
  m("A01", "the edge box test is open in x (a touching box does not meet)", [G("plan.ts", "a.x0 <= b.x1 && a.x1 >= b.x0 &&", "a.x0 < b.x1 && a.x1 > b.x0 &&")]),
  m("A06", "clip rejects a parallel segment exactly on the side (`q = 0`)", [G("clip.ts", "if (q < 0n) return undefined;", "if (q <= 0n) return undefined;")]),
  m("A15", "G13 does not refuse a repeated table address", [G("read.ts", 'if (seen.has(key)) throw fail("G13"', 'if (false) throw fail("G13"')]),
  m("A16", "G15 accepts a repeated cn/ce entry", [G("read.ts", "if (pid <= prev) throw fail(\"G15\"", "if (pid < prev) throw fail(\"G15\"")]),
  m("A17", "G16 does not account for edges", [G("read.ts", 'if (!e3.has(pid)) throw fail("G16"', 'if (false) throw fail("G16"')]),
  m("A22", "a commit in `failed` does not store the plan", [G("control.ts", "      plan = next;\n      if (phase === \"ready\") draw();", "      if (phase !== \"failed\") plan = next;\n      if (phase === \"ready\") draw();")]),
  m("A33", "readoutFromGl ignores the focus flag of an omitted edge", [G("readout.ts", "    if (flags & 2) a.focusedEdges.add(pid);\n", "")]),
  // design rev 5 rules that no corpus row reaches (oracle A-39/A-40): the single-focus clause of G12, the readout without an arbitrary focus, the controller outcomes
  m("F1", "G12 does not refuse two focused elements", [G("read.ts", 'if (focused.size > 1) throw fail("G12"', 'if (false) throw fail("G12"')]),
  m("F2", "the focus clause ignores the flags of omitted elements (cn/ce)", [G("read.ts", "...[...cn, ...ce].filter((e) => (e[1] & 2) !== 0).map((e) => e[0])", "...[]")]),
  m("F3", "readoutFromGl reports a focus when a plan names two", [G("readout.ts", "if (a.focusedEdges.size + a.focusedNodes.size === 1) {", "if (a.focusedEdges.size + a.focusedNodes.size >= 1) {")]),
  m("C1", "(failed, R) lost again keeps the failure token", [G("control.ts", '      } else if (was === "failed") {\n        failure = undefined;\n        phase = "lost";', '      } else if (was === "failed") {\n        phase = "lost";')]),
  m("C2", "(failed, R) with a second usable failure emits onStatus", [G("control.ts", 'if (was !== "failed") notify();', "notify();", 2)]),
  m("C3", "dispose releases a lost context", [G("control.ts", "&& gl !== undefined && !lost()) releaseGlContext(gl);", "&& gl !== undefined) releaseGlContext(gl);")]),
];
