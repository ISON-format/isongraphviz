// The K table of design 15.6 and 15.6a, restricted to the mutants whose named killer rows belong to a11y-companion (rows C, P, Q, G, M), as source patches:
//   K45-K62, K82, K83, K99-K108, K121, K125, K128 (33 mutants). K84 (TypeScript-only plain-object lookup) names C16 and I51: it is a mutant of
//   interaction-core's table; this package keys no object by a graph-derived string (ids are hex with a prefix), so there is nothing to mutate here.
// Every mutant is a list of exact-text patches applied to a SCRATCH COPY of packages/a11y-companion/src; production code has no switchable variants and src/
// is never modified. A patch whose `find` text does not occur exactly `count` times is a harness error, so a refactoring of src/ cannot silently turn a
// mutant into a no-op. The mutations are this implementation's own realization of the one-line texts of 15.6a.
const P = (file, find, replace, count = 1) => ({ file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });

export const MUTANTS = [
  m("K45", "the tab stop is position 1 whatever the focus", [P("tree.ts", "const stop = n === 0 ? undefined : fpos ?? 1;", "const stop = n === 0 ? undefined : 1;")]),
  m("K46", "selected is focused", [P("tree.ts", "selected: it.selected, set_size: n", "selected: it.focused, set_size: n")]),
  m("K47", "first = max(1, min(p - 100, N - 200))", [P("tree.ts", "setSize - COMPANION_WINDOW + 1", "setSize - COMPANION_WINDOW")]),
  m("K48", "items are only the window positions", [P("tree.ts", "for (const p of [fpos, stop]) {", "for (const p of [] as (number | undefined)[]) {")]),
  m("K49", "the live text is not cut", [P("live.ts", "if (s.length <= LIVE_MAX_UNITS) return s;", "return s;")]),
  m("K50", "the cut condition is > 399 units", [P("live.ts", "if (s.length <= LIVE_MAX_UNITS) return s;", "if (s.length <= LIVE_MAX_UNITS - 1) return s;")]),
  m("K51", "consecutive duplicate announcements are kept", [P("live.ts", "if (texts.length > 0 && texts[texts.length - 1] === t) continue;", "void 0;")]),
  m("K52", "the edge description is omitted", [P("tree.ts", "if (it.description !== undefined) item.description = it.description;", "void it.description;")]),
  m("K53", "the node name is its label", [P("tree.ts", "kind: it.role, name: it.name, position", "kind: it.role, name: it.name.slice(it.name.indexOf(\" \") + 1), position")]),
  m("K54", "position is 0-based", [P("tree.ts", "name: it.name, position: it.position,", "name: it.name, position: it.position - 1,")]),
  m("K55", "the update plan re-emits every attribute of every retained item", [
    P("plan.ts", "if (p.tabindex !== i.tabindex) out.push", "out.push"), P("plan.ts", "if (p.selected !== i.selected) out.push", "out.push"),
    P("plan.ts", "if (p.position !== i.position) out.push", "out.push"), P("plan.ts", "if (p.set_size !== i.set_size) out.push", "out.push"),
  ]),
  m("K56", "new items are inserted with before = the empty string", [P("plan.ts", "return { before: x + 1 < items.length ? items[x + 1]!.id : \"\", bd: nextEdgeDesc };", "return { before: \"\", bd: nextEdgeDesc };")]),
  m("K57", "Tab is not looked for in the gate", [P("gate.ts", "if (table.some((r) => r.key === \"Tab\")) f.push({ code: \"TAB_BOUND\" });", "void 0;")]),
  m("K58", "the number of tabindex 0 items is not checked", [P("gate.ts", "const countOk = n > 0 ? zeros.length === 1 : zeros.length === 0;", "const countOk = true;")]),
  m("K59", "the missing forward step binding is not reported", [P("gate.ts", "if (!hasStep(1)) f.push({ code: \"NO_STEP_FORWARD_BINDING\" });", "void 0;")]),
  m("K60", "the backend marker is not compared", [P("gate.ts", "checks.push(checkOf(\"G10-MARKER\", equal ? [] : [{ code: \"NO_BACKEND_MARKER\" }]));", "checks.push(checkOf(\"G10-MARKER\", []));")]),
  m("K61", "the edge description is not required", [P("gate.ts", "if (it.description === undefined) f.push({ code: \"DESCRIPTION_MISSING\", position: p });", "if (it.description === undefined) void 0;")]),
  m("K62", "an info finding makes the report fail", [P("gate.ts", "const fail = checks.some((c) => c.verdict === \"fail\");", "const fail = checks.some((c) => c.verdict === \"fail\" || c.verdict === \"info\");")]),
  m("K82", "the composed manifest does not set a11y.companion-dom", [P("manifest.ts", "if (on(\"companion\")) caps[\"a11y.companion-dom\"] = { status: \"supported\" };", "void 0;")]),
  m("K83", "the composed manifest also sets a11y.native-dom", [P("manifest.ts", "if (on(\"companion\")) caps[\"a11y.companion-dom\"] = { status: \"supported\" };", "if (on(\"companion\")) caps[\"a11y.companion-dom\"] = { status: \"supported\" };\n  caps[\"a11y.native-dom\"] = { status: \"supported\" };")]),
  m("K99", "omitFocusAnnouncement is ignored", [P("live.ts", "if (omitFocus && e.type === \"focus-changed\") continue;", "if (false && e.type === \"focus-changed\") continue;")]),
  m("K100", "an equal non-empty live text is not rewritten", [P("plan.ts", "else if (nt !== \"\") out.push([\"t\", k.live, \"\"], [\"t\", k.live, nt]);", "")]),
  m("K101", "description elements are appended to the listbox", [P("plan.ts", "[\"p\", k.desc, `${id}-d`, bd]", "[\"p\", k.list, `${id}-d`, bd]")]),
  m("K102", "the gate does not compare the window", [P("gate.ts", "if (tree.list.window.first !== ew.first || tree.list.window.count !== ew.count) f.push({ code: \"WINDOW_MISMATCH\" });", "void ew;")]),
  m("K103", "the gate does not compare selected", [P("gate.ts", "if (it.selected !== k.selected) f.push(", "if (false) f.push(")]),
  m("K104", "the gate accepts a single tab stop at the wrong position", [P("gate.ts", "else if (zeros.length === 1 && zeros[0]!.position !== stop)", "else if (false)")]),
  m("K105", "the gate ignores an off-screen focus", [P("gate.ts", "if (X < 0n || X > BigInt(vp.width) * 1_000_000n || Y < 0n || Y > BigInt(vp.height) * 1_000_000n) f.push", "if (false) f.push")]),
  m("K106", "the gate ignores the page tab-stop count", [P("gate.ts", "tabStops === (n > 0 ? 1 : 0) ? [] :", "true ? [] :")]),
  m("K107", "the gate accepts a step binding with any modifier mask", [P("gate.ts", "r.mode === \"normal\" && r.mods === 0 && r.step === d", "r.mode === \"normal\" && r.step === d")]),
  m("K108", "the gate ignores the SVG tab stop", [P("svgmap.ts", "if (!tabOk) out.push({ code: \"SVG_TABSTOP\" });", "void tabOk;")]),
  m("K121", "adjacent duplicates are judged before events without text are omitted", [
    P("live.ts", "if (texts.length > 0 && texts[texts.length - 1] === t) continue;", "void 0;"),
    P("live.ts", "const texts: string[] = [];", "const texts: string[] = [];\n  let last: string | undefined = \"\\u0000\";"),
    P("live.ts", "if (t === undefined) continue; // events with no announcement are omitted FIRST", "if (last === t && t !== undefined) continue;\n    last = t;\n    if (t === undefined) continue;"),
  ]),
  m("K125", "the gate reports an off-screen focus only for the right and bottom edges", [P("gate.ts", "if (X < 0n || X > BigInt(vp.width) * 1_000_000n || Y < 0n || Y > BigInt(vp.height) * 1_000_000n) f.push", "if (X > BigInt(vp.width) * 1_000_000n || Y > BigInt(vp.height) * 1_000_000n) f.push")]),
  m("K128", "the gate does not compare the tree mode with the input mode", [P("gate.ts", "else if (g(\"mode\") !== undefined && g(\"mode\") !== tree.mode)", "else if (false)")]),
];

/** Mutants beyond the corpus table (audit 32-code-audit-b.md): ids start with `ext:`, killed by the behaviour checks of test/oracle/extra.ts. See scripts/ext-mutants.mjs. */
export { EXTRA_MUTANTS } from "./ext-mutants.mjs";
