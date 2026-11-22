// The K table of design 15.6 and 15.6a, restricted to the mutants whose named killer rows belong to a11y-companion (rows C, P, Q, G, M), as source patches:
//   K45-K62, K82, K83, K99-K108, K121, K125, K128, K312-K346 (68 mutants; K312-K346 are the rulings R32-14 and R32-15 of 2026-11-21, rows G45-G140). K84 (TypeScript-only plain-object lookup) names C16 and I51: it is a mutant of
//   interaction-core's table; this package keys no object by a graph-derived string (ids are hex with a prefix), so there is nothing to mutate here.
// Every mutant is a list of exact-text patches applied to a SCRATCH COPY of packages/a11y-companion/src; production code has no switchable variants and src/
// is never modified. A patch whose `find` text does not occur exactly `count` times is a harness error, so a refactoring of src/ cannot silently turn a
// mutant into a no-op. The mutations are this implementation's own realization of the one-line texts of 15.6a.
const P = (file, find, replace, count = 1) => ({ file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });
// The TypeScript tree reader refuses a tree that holds `null` anywhere as "not plain data" (util.ts copyPlain) before any field check, so a null-valued wrong field is
// SCHEMA whatever a field-level fault does; the Python reference reads `null` as a value. The mutants of the type rule whose named killers include rows with a null value
// carry this patch (null is a value) so that those rows can observe the field-level fault, as the corpus names them.
const NULLS = P("util.ts", "if (typeof v === \"string\" || typeof v === \"boolean\") return v;", "if (typeof v === \"string\" || typeof v === \"boolean\" || v === null) return v as unknown as Plain;");

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

  // ---- the rulings R32-14 and R32-15 of 2026-11-21 (corpus K312-K346, rows G45-G140; design 32 rev 4, section 10 "Shape versus finding" and G1-REACH). Each is this
  //      implementation's realization of the one-line text of MUTANTS.tsv, which describes the fault of the Python reference.
  // R32-14: ITEM_DUPLICATE once per repeated position value, at its second occurrence
  m("K312", "ITEM_DUPLICATE once per extra occurrence", [P("gate.ts", "if (c === 2) dups.push(it.position);", "if (c >= 2) dups.push(it.position);")]),
  m("K313", "only the first repeated position is reported", [P("gate.ts", "for (const p of dups) f.push({ code: \"ITEM_DUPLICATE\", position: p });", "for (const p of dups.slice(0, 1)) f.push({ code: \"ITEM_DUPLICATE\", position: p });")]),
  m("K314", "repeated positions ordered by their first occurrence", [P("gate.ts", "for (const p of dups) f.push({ code: \"ITEM_DUPLICATE\", position: p });", "for (const p of [...dups].sort((a, b) => tree.items.findIndex((x) => x.position === a) - tree.items.findIndex((x) => x.position === b))) f.push({ code: \"ITEM_DUPLICATE\", position: p });")]),
  m("K315", "repeated positions ordered by position number", [P("gate.ts", "for (const p of dups) f.push({ code: \"ITEM_DUPLICATE\", position: p });", "for (const p of [...dups].sort((a, b) => a - b)) f.push({ code: \"ITEM_DUPLICATE\", position: p });")]),
  m("K316", "repeated positions ordered by their last occurrence", [P("gate.ts", "for (const p of dups) f.push({ code: \"ITEM_DUPLICATE\", position: p });", "for (const p of [...dups].sort((a, b) => tree.items.map((x) => x.position).lastIndexOf(a) - tree.items.map((x) => x.position).lastIndexOf(b))) f.push({ code: \"ITEM_DUPLICATE\", position: p });")]),
  m("K317", "ITEM_DUPLICATE findings listed before the ITEM_MISSING findings", [
    P("gate.ts", "for (const p of [...need].sort((a, b) => a - b)) if (!seen.has(p))", "for (const p of dups) f.push({ code: \"ITEM_DUPLICATE\", position: p });\n      for (const p of [...need].sort((a, b) => a - b)) if (!seen.has(p))"),
    P("gate.ts", "for (const p of dups) f.push({ code: \"ITEM_DUPLICATE\", position: p });\n    }", "void 0;\n    }"),
  ]),
  m("K318", "a repeated position outside 1..n is not reported", [P("gate.ts", "if (c === 2) dups.push(it.position);", "if (c === 2 && it.position >= 1 && it.position <= n) dups.push(it.position);")]),
  m("K319", "a position counts as repeated only when the later item equals the earlier one entirely", [P("gate.ts", "if (c === 2) dups.push(it.position);", "if (c === 2 && JSON.stringify(tree.items.find((x) => x.position === it.position)) === JSON.stringify(it)) dups.push(it.position);")]),
  m("K320", "ITEM_DUPLICATE only for a position that occurs three or more times", [P("gate.ts", "if (c === 2) dups.push(it.position);", "if (c === 3) dups.push(it.position);")]),
  // R32-15: an ill-typed tree field is INVALID_TREE/SCHEMA before any check
  m("K321", "mode not type-checked", [NULLS, P("tree.ts", "mode: str(top.get(\"mode\"), \"tree.mode\"),", "mode: top.get(\"mode\") as string,")]),
  m("K322", "mode type-checked only when the input states a mode", [NULLS, P("gate.ts", "tree = readTree(g(\"tree\"), true);", "try { tree = readTree(g(\"tree\"), true); } catch (e) { if (g(\"mode\") !== undefined || !(e instanceof IaError) || e.path !== \"tree.mode\") throw e; tree = readTree({ ...(g(\"tree\") as object), mode: \"x-mutant\" }, true); (tree as { mode: unknown }).mode = (g(\"tree\") as { mode: unknown }).mode; }")]),
  m("K323", "a string mode outside normal and marquee is refused as INVALID_TREE/SCHEMA", [P("tree.ts", "mode: str(top.get(\"mode\"), \"tree.mode\"),", "mode: ((v: string) => { if (v !== \"normal\" && v !== \"marquee\") throw bad(\"tree.mode\", \"mutant\"); return v; })(str(top.get(\"mode\"), \"tree.mode\")),")]),
  m("K324", "live fields not type-checked", [NULLS, P("tree.ts", "out.live = { atomic: bool(lv.get(\"atomic\"), \"tree.live.atomic\"), politeness: str(lv.get(\"politeness\"), \"tree.live.politeness\"), role: str(lv.get(\"role\"), \"tree.live.role\"), text: str(lv.get(\"text\"), \"tree.live.text\") };", "out.live = { atomic: lv.get(\"atomic\") as boolean, politeness: lv.get(\"politeness\") as string, role: lv.get(\"role\") as string, text: lv.get(\"text\") as string };")]),
  m("K325", "live.text not type-checked", [NULLS, P("tree.ts", "text: str(lv.get(\"text\"), \"tree.live.text\") };", "text: lv.get(\"text\") as string };")]),
  m("K326", "live.atomic: the string true accepted", [P("tree.ts", "atomic: bool(lv.get(\"atomic\"), \"tree.live.atomic\"),", "atomic: lv.get(\"atomic\") === \"true\" ? true : bool(lv.get(\"atomic\"), \"tree.live.atomic\"),")]),
  m("K327", "live null treated as an absent live", [NULLS, P("tree.ts", "if (top.has(\"live\")) {", "if (top.has(\"live\") && top.get(\"live\") !== null) {")]),
  m("K328", "an absent live refused as INVALID_TREE/SCHEMA", [P("tree.ts", "...(loose ? [] : [\"live\"])", "\"live\"")]),
  m("K329", "a string politeness other than polite refused as INVALID_TREE/SCHEMA", [P("tree.ts", "politeness: str(lv.get(\"politeness\"), \"tree.live.politeness\"),", "politeness: ((v: string) => { if (v !== \"polite\") throw bad(\"tree.live.politeness\", \"mutant\"); return v; })(str(lv.get(\"politeness\"), \"tree.live.politeness\")),")]),
  m("K330", "live.atomic false refused as INVALID_TREE/SCHEMA", [P("tree.ts", "atomic: bool(lv.get(\"atomic\"), \"tree.live.atomic\"),", "atomic: ((v: boolean) => { if (!v) throw bad(\"tree.live.atomic\", \"mutant\"); return v; })(bool(lv.get(\"atomic\"), \"tree.live.atomic\")),")]),
  m("K331", "the type error is raised after the checks and only when no check failed", [NULLS, 
    P("gate.ts", "let tree: ReturnType<typeof readTree> | undefined;", "let tree: ReturnType<typeof readTree> | undefined;\n  let deferred: unknown;"),
    P("gate.ts", "tree = readTree(g(\"tree\"), true);", "try { tree = readTree(g(\"tree\"), true); } catch (e) { deferred = e; tree = copyPlain(g(\"tree\"), 8) as never; }"),
    P("gate.ts", "const fail = checks.some((c) => c.verdict === \"fail\");", "const fail = checks.some((c) => c.verdict === \"fail\");\n  if (deferred !== undefined && !fail) throw deferred;"),
    P("gate.ts", "if (tree.live.text.length > 400) f.push(", "if (typeof tree.live.text !== \"string\" || tree.live.text.length > 400) f.push("), // the gate tolerates an ill-typed text, as the reference of that reading does
  ]),
  m("K332", "only the first item is type-checked", [NULLS, P("tree.ts", "const items: ReadItem[] = rawItems.map((raw, i) => {", "const items: ReadItem[] = rawItems.map((raw, i) => {\n    if (i > 0) return raw as ReadItem;")]),
  m("K333", "a boolean accepted where an integer is required", [P("tree.ts", "const int = (v: unknown, path: string): number => { if (typeof v !== \"number\" ||", "const int = (v: unknown, path: string): number => { if (typeof v === \"boolean\") return v as unknown as number; if (typeof v !== \"number\" ||")]),
  m("K334", "the integers 0 and 1 accepted where a boolean is required", [P("tree.ts", "const bool = (v: unknown, path: string): boolean => { if (typeof v !== \"boolean\")", "const bool = (v: unknown, path: string): boolean => { if (v === 0 || v === 1) return v as unknown as boolean; if (typeof v !== \"boolean\")")]),
  m("K335", "a non-integer number accepted where an integer is required", [P("tree.ts", "!Number.isSafeInteger(v)) throw bad(path, \"integer expected\")", "!Number.isFinite(v)) throw bad(path, \"integer expected\")")]),
  m("K336", "list.role and list.multiselectable not type-checked", [P("tree.ts", "multiselectable: bool(l.get(\"multiselectable\"), \"tree.list.multiselectable\"), role: str(l.get(\"role\"), \"tree.list.role\"),", "multiselectable: l.get(\"multiselectable\") as boolean, role: l.get(\"role\") as string,")]),
  m("K337", "container description, name and role not type-checked", [NULLS, P("tree.ts", "container: { description: str(c.get(\"description\"), \"tree.container.description\"), name: str(c.get(\"name\"), \"tree.container.name\"), role: str(c.get(\"role\"), \"tree.container.role\") },", "container: { description: c.get(\"description\") as string, name: c.get(\"name\") as string, role: c.get(\"role\") as string },")]),
  m("K338", "companion, layout_sha256 and scene_sha256 not type-checked", [
    P("tree.ts", "companion: str(top.get(\"companion\"), \"tree.companion\"),", "companion: top.get(\"companion\") as string,"),
    P("tree.ts", "layout_sha256: str(top.get(\"layout_sha256\"), \"tree.layout_sha256\"),", "layout_sha256: top.get(\"layout_sha256\") as string,"),
    P("tree.ts", "scene_sha256: str(top.get(\"scene_sha256\"), \"tree.scene_sha256\"),", "scene_sha256: top.get(\"scene_sha256\") as string,"),
  ]),
  m("K339", "list.set_size not type-checked", [NULLS, P("tree.ts", "set_size: int(l.get(\"set_size\"), \"tree.list.set_size\"),", "set_size: l.get(\"set_size\") as number,")]),
  m("K340", "list.window.first and list.window.count not type-checked", [P("tree.ts", "window: { count: int(w.get(\"count\"), \"tree.list.window.count\"), first: int(w.get(\"first\"), \"tree.list.window.first\") } },", "window: { count: w.get(\"count\") as number, first: w.get(\"first\") as number } },")]),
  m("K341", "item id, kind, name and roledescription not type-checked", [NULLS, 
    P("tree.ts", "id: str(m.get(\"id\"), `${p}.id`),", "id: m.get(\"id\") as string,"),
    P("tree.ts", "kind: str(m.get(\"kind\"), `${p}.kind`),", "kind: m.get(\"kind\") as string,"),
    P("tree.ts", "name: str(m.get(\"name\"), `${p}.name`),", "name: m.get(\"name\") as string,"),
    P("tree.ts", "roledescription: str(m.get(\"roledescription\"), `${p}.roledescription`),", "roledescription: m.get(\"roledescription\") as string,"),
  ]),
  m("K342", "item focused and selected not type-checked", [NULLS, 
    P("tree.ts", "focused: bool(m.get(\"focused\"), `${p}.focused`),", "focused: m.get(\"focused\") as boolean,"),
    P("tree.ts", "selected: bool(m.get(\"selected\"), `${p}.selected`),", "selected: m.get(\"selected\") as boolean,"),
  ]),
  m("K343", "item set_size and tabindex not type-checked", [
    P("tree.ts", "set_size: int(m.get(\"set_size\"), `${p}.set_size`),", "set_size: m.get(\"set_size\") as number,"),
    P("tree.ts", "tabindex: int(m.get(\"tabindex\"), `${p}.tabindex`),", "tabindex: m.get(\"tabindex\") as number,"),
  ]),
  m("K344", "item position not type-checked", [NULLS, P("tree.ts", "position: int(m.get(\"position\"), `${p}.position`),", "position: m.get(\"position\") as number,")]),
  m("K345", "item address shape not checked", [P("tree.ts", "throw bad(`${p}.address`, \"ElementAddress expected\");", "void 0;")]),
  m("K346", "an ill-typed tree is checked in the svg-native composition", [P("gate.ts", "svg = readSvgInput(g(\"svg\"));", "svg = readSvgInput(g(\"svg\"));\n    if (g(\"tree\") !== undefined) readTree(g(\"tree\"), true);")]),
];

/** Mutants beyond the corpus table (audit 32-code-audit-b.md): ids start with `ext:`, killed by the behaviour checks of test/oracle/extra.ts. See scripts/ext-mutants.mjs. */
export { EXTRA_MUTANTS } from "./ext-mutants.mjs";
