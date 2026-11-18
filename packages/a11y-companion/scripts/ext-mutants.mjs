// Mutants beyond the corpus table (audit 32-code-audit-b.md): ids start with `ext:`; they are killed by the behaviour checks of test/oracle/extra.ts (ids U-*),
// which the harness runs next to the oracle rows. `B..` names the auditor's own mutant where one exists.
const P = (file, find, replace, count = 1) => ({ file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });

export const EXTRA_MUTANTS = [
  m("ext:B19", "screenMicro centres X with the viewport height", [P("util.ts", "BigInt(vp.width) * 500_000n, Y:", "BigInt(vp.height) * 500_000n, Y:")]),
  m("ext:B20", "screenMicro centres Y with the viewport width", [P("util.ts", "(BigInt(y) - BigInt(vp.center_y)) * z + BigInt(vp.height) * 500_000n", "(BigInt(y) - BigInt(vp.center_y)) * z + BigInt(vp.width) * 500_000n")]),
  m("ext:B18", "the edge midpoint rounds down instead of half up", [P("gate.ts", "const num = 2n * (p + q) + 2n;", "const num = 2n * (p + q);")]),
  m("ext:B15", "G12 right boundary is open (>=)", [P("gate.ts", "X > BigInt(vp.width) * 1_000_000n ||", "X >= BigInt(vp.width) * 1_000_000n ||")]),
  m("ext:G12b", "G12 bottom boundary is open (>=)", [P("gate.ts", "Y > BigInt(vp.height) * 1_000_000n)", "Y >= BigInt(vp.height) * 1_000_000n)")]),
  m("ext:G12l", "G12 left boundary is open (<=)", [P("gate.ts", "if (X < 0n ||", "if (X <= 0n ||")]),
  m("ext:B01", "the live-text cut may split a surrogate pair", [P("live.ts", "if (c >= 0xd800 && c <= 0xdbff) end -= 1; // the cut would split a pair", "void c;")]),
  m("ext:B07", "tree depth bound 9", [P("tree.ts", "const MAX_TREE_DEPTH = 8;", "const MAX_TREE_DEPTH = 9;")]),
  m("ext:B25", "tree depth bound 7", [P("tree.ts", "const MAX_TREE_DEPTH = 8;", "const MAX_TREE_DEPTH = 7;")]),
  m("ext:B13", "a plan may insert into itself or into a descendant", [P("executor.ts", "if (dry.under(op[1]!, op[2]!)) throw", "if (false) throw")]),
  m("ext:P3", "a plan may insert before a key that is not a child", [P("executor.ts", "if (dry.par.get(op[3]!) !== op[1]) throw", "if (false) throw")]),
  m("ext:B16", "ITEM_DUPLICATE once per extra occurrence", [P("gate.ts", "if (c === 2) dups.push(it.position);", "if (c >= 2) dups.push(it.position);")]),
  m("ext:M8", "liveText prints an unvalidated count", [P("live.ts", "if (typeof n !== \"number\" || !Number.isSafeInteger(n) || n < 0) throw", "if (typeof n !== \"number\") throw")]),
  m("ext:M13", "verifyCompanionTree lets a configuration error through", [P("tree.ts", "e.code === \"INVALID_CONFIG\"", "false")]),
  m("ext:M2a", "planCompanionUpdate reads options with Object.keys and property reads", [P("plan.ts", "const o = plainEntries(options); // each property read once; an accessor is refused", "const o = new Map(Object.keys(options as object).map((k) => [k, (options as Record<string, unknown>)[k]])); // mutant")]),
  m("ext:M2b", "the gate does not snapshot the state", [P("gate.ts", "if (stateCopy === undefined) throw bad(\"state\", \"plain data expected\");", "void 0;"), P("gate.ts", "const state = stateCopy as unknown as SemanticState;", "const state = g(\"state\") as SemanticState;")]),
  m("ext:I2a", "mountCompanion does not rebuild after a DOM exception", [P("dom/index.ts", "        discard();\n        try { apply(next, planCompanionUpdate(undefined, next)); } catch (e2) { fail(e2); discard(); return; }", "        return;")]),
  m("ext:I2b", "mountCompanion does not notice a removed root", [P("dom/index.ts", "if (r0 !== undefined && r0.parentNode !== host) discard();", "void r0;")]),
  m("ext:M17", "itemAddress returns the shared object", [P("dom/index.ts", "return a === undefined ? undefined : copyAddress(a);", "return a;")]),
];
