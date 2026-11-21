// The K table of design 15.6 and 15.6a, restricted to the mutants whose named killer rows belong to interaction-core (rows E, I, V, L, B), as source patches:
//   K01-K44, K72-K81, K84-K98, K122-K124, K126, K129-K153, K201-K232, K269-K310 (172 mutants; K129-K153 are the binding-table rows B14-B110 added with the gap rows, review 34; K201-K232 and K269-K310 are the rev 4 rows B111-B174 and E74-E102).
// The other 139 mutants of the corpus (K45-K71 companion, plan, gate, export; K82-K83 composed manifests; K99-K121, K125, K127, K128; K154-K200, K233-K268, K311 PNG, binding chunk
// and manifest) are the business of a11y-companion and export-core. Every mutant is a list of exact-text patches applied to a SCRATCH COPY of packages/interaction-core/src; production code
// has no switchable variants and src/ is never modified. A patch whose `find` text does not occur exactly `count` times is a harness error, so a refactoring
// of src/ cannot silently turn a mutant into a no-op. The mutations are this implementation's own realization of the one-line texts of 15.6a.
const P = (file, find, replace, count = 1) => ({ file, find, replace, count });
const m = (id, desc, patches) => ({ id, desc, patches });

const SEL = "const mode = selectMode(p.mods0);";
const DRAG = "if (dx * dx + dy * dy > BigInt(DRAG_THRESHOLD_MILLI) ** 2n) {";
const ACC = "const dx = noNegZero(divRoundN(bx, 1000)), dy = noNegZero(divRoundN(by, 1000));";
const NODE_PICK = "const t = cmd.delta === 1 ? list[0]! : list[list.length - 1]!;";
const KEYSPATIAL = "const key: [bigint, bigint, number] = [p * p + s * s, s, m.index];";

const DUPID = "const id = JSON.stringify([mode, key, shiftIgnored(key) ? mods & 14 : mods]);";
const TABROW = 'if (key === "Tab") throw bad("TAB_BOUND", p);';
const ROWS = "  rows.forEach((e, i) => {\n";
const MODS = '    if (!isInt(mods) || mods < 0 || mods > 15) throw bad("INVALID_VALUE", `${p}.mods`);\n';
const KEY = '    if (typeof key !== "string" || !isKeyToken(key)) throw bad("UNKNOWN_KEY", `${p}.key`);\n';
const MODSKEY = MODS + KEY, KEYMODS = KEY + MODS;
const ACT = '    const action = readAction(e.get("action"), `${p}.action`);\n';
const KEYACT = KEY + ACT;
const ACTTYPE_FIRST = '    { const at = plainEntries(e.get("action"))?.get("type"); if (!(typeof at === "string" && ACTIONS.has(at))) throw bad("UNKNOWN_ACTION", `${p}.action`); }\n';
const ACTTAB = ACT + "    " + TABROW;
const CLOSED = '    if (e === undefined || e.size !== 4 || !["action", "key", "mode", "mods"].every((k) => e.has(k))) throw bad("SCHEMA", `[${i}]`, "exactly action, key, mode, mods");';
// text shared by the rev 4 mutants K201-K232 and K269-K310
const PANOK = "return isInt(x) && isInt(y) && Math.abs(x) <= PIX_LIMIT && Math.abs(y) <= PIX_LIMIT;";
const ZOOMOK = "return isInt(x) && x >= 1 && x <= 1_000_000;";
const DIROK = 'DIRS.includes(f.get("dir")) && typeof f.get("extend") === "boolean"';
const ENDOK = 'ok: (f) => f.get("end") === "src" || f.get("end") === "tgt" }],';
const STEPOK = '["step", { fields: ["delta"], ok: (f) => isDelta(f.get("delta")) }],';
const INCOK = '["incident", { fields: ["delta"], ok: (f) => isDelta(f.get("delta")) }],';
const ISDELTA = "const isDelta = (v: unknown): v is 1 | -1 => v === 1 || v === -1;";
const MODECHK = '    if (typeof mode !== "string" || !(mode === "normal" || mode === "marquee" || MODE.test(mode))) throw bad("INVALID_VALUE", `${p}.mode`);\n';
const UNKACT = 'if (e === undefined || spec === undefined) throw bad("UNKNOWN_ACTION", path);';
const LASTT = "!isInt(last_t) || last_t < -1 || last_t > 2 ** 52";
const PINCHD = "d < 0 || d > 2 ** 41";

export const MUTANTS = [
  // ---- pointer, wheel, pinch, long press, lasso (rows I) ------------------------------------------------------------------------------------------
  m("K01", "drag threshold >= instead of >", [P("machine.ts", DRAG, "if (dx * dx + dy * dy >= BigInt(DRAG_THRESHOLD_MILLI) ** 2n) {")]),
  m("K02", "threshold by Chebyshev distance", [P("machine.ts", DRAG, "if (dx > 4000n || dx < -4000n || dy > 4000n || dy < -4000n) {")]),
  m("K03", "pan remainder dropped each event", [P("machine.ts", "const bx = m.rem_x + ax, by = m.rem_y + ay;", "const bx = ax, by = ay;")]),
  m("K04", "pan accumulation floorDiv instead of divRound", [
    P("machine.ts", "addressOf, divRound, divRoundN, drawnElement,", "addressOf, divRound, divRoundN, floorDivN, drawnElement,"),
    P("machine.ts", ACC, "const dx = noNegZero(floorDivN(bx, 1000)), dy = noNegZero(floorDivN(by, 1000));"),
  ]),
  m("K05", "pan accumulation truncates toward zero", [P("machine.ts", ACC, "const dx = noNegZero(Math.trunc(bx / 1000)), dy = noNegZero(Math.trunc(by / 1000));")]),
  m("K06", "first pan excludes the press-to-threshold segment", [P("machine.ts", "m.gesture = \"pan\"; accumulate(m, ev.x - p.x0, ev.y - p.y0, out); }", "m.gesture = \"pan\"; accumulate(m, 0, 0, out); }")]),
  m("K07", "click modifiers read at pointerup", [P("machine.ts", SEL, "const mode = selectMode(ev.mods);")]),
  m("K08", "shift before ctrl: ctrl+shift click adds", [P("machine.ts", "((mods0 & 10) !== 0 ? \"toggle\" : (mods0 & 1) !== 0 ? \"add\" : \"replace\")", "((mods0 & 1) !== 0 ? \"add\" : (mods0 & 10) !== 0 ? \"toggle\" : \"replace\")")]),
  m("K09", "meta is not a toggle modifier", [P("machine.ts", "((mods0 & 10) !== 0 ?", "((mods0 & 2) !== 0 ?")]),
  m("K10", "modified click on empty space clears", [P("machine.ts", "} else if ((p.mods0 & 11) === 0) out.push(intent({ type: \"clear-selection\" }));", "} else out.push(intent({ type: \"clear-selection\" }));")]),
  m("K11", "wheel accumulator kept across reversal", [P("machine.ts", "if (acc !== 0n && (acc < 0n) !== (d < 0n)) acc = 0n;", "")]),
  m("K12", "wheel notch cap 16 instead of 8", [P("machine.ts", "notches < WHEEL_MAX_NOTCHES", "notches < 16")]),
  m("K13", "wheel sign flipped", [P("machine.ts", "factor_milli: acc < 0n ? 1250 : 800", "factor_milli: acc < 0n ? 800 : 1250")]),
  m("K14", "line unit 10 px", [P("machine.ts", "ev.unit === 1 ? 16n", "ev.unit === 1 ? 10n")]),
  m("K15", "page unit uses viewport width", [P("machine.ts", "BigInt(viewOf(c).viewport.height)", "BigInt(viewOf(c).viewport.width)")]),
  m("K16", "zoom anchor floor instead of divRound", [P("machine.ts", "const anchor = { x: Number(divRound(BigInt(ev.x), 1000n)), y: Number(divRound(BigInt(ev.y), 1000n)) };", "const anchor = { x: Number(floorDiv(BigInt(ev.x), 1000n)), y: Number(floorDiv(BigInt(ev.y), 1000n)) };")]),
  m("K17", "pinch factor truncated", [P("machine.ts", "const f = divRound(d1 * 1000n, BigInt(pinch.d));", "const f = (d1 * 1000n) / BigInt(pinch.d);")]),
  m("K18", "pinch emits zoom before pan", [P("machine.ts", "} else if (pinch.d === 0 && d1 > 0n) pinch.d = Number(d1);\n      break;", "} else if (pinch.d === 0 && d1 > 0n) pinch.d = Number(d1);\n      out.reverse();\n      break;")]),
  m("K19", "pinch reference refreshed on every move", [P("machine.ts", "        if (factor !== 1000) {", "        pinch.d = Number(d1);\n        if (factor !== 1000) {")]),
  m("K20", "third pointer replaces the first", [P("machine.ts", "if (m.pointers.length >= 2) return true; // a third pointer is ignored", "if (m.pointers.length >= 2) m.pointers.shift();")]),
  m("K21", "long press needs more than 500 ms", [P("machine.ts", "m.last_t - p.t0 >= LONG_PRESS_MS", "m.last_t - p.t0 > LONG_PRESS_MS")]),
  m("K22", "movement does not cancel a long press", [P("machine.ts", "p.ptype === \"touch\" && !p.moved && !p.long && m.last_t", "p.ptype === \"touch\" && !p.long && m.last_t")]),
  m("K23", "a click follows a fired long press", [P("machine.ts", "if (g === \"press\" && !p.long) {", "if (g === \"press\") {")]),
  m("K24", "click on a target that is no longer drawn selects it", [
    P("machine.ts", "import { IgrError, isRenderModel } from \"isongraph-visualize-renderer-core\";", "import { IgrError, isRenderModel, lookupElement } from \"isongraph-visualize-renderer-core\";"),
    P("machine.ts", "const el = drawnElement(viewOf(c), p.target);", "const el = lookupElement(c.model, p.target);"),
  ]),
  m("K25", "pointercancel clicks", [P("machine.ts", "case \"pointercancel\": handled = pointerCancel(m, ev, out); break;", "case \"pointercancel\": handled = pointerUp(c, m, { ...ev, x: 0, y: 0, mods: 0 } as never, out); break;")]),
  m("K26", "context action drops the target", [P("machine.ts", "y: Number(divRound(BigInt(ev.y), 1000n)), ...(target === undefined ? {} : { target }) });", "y: Number(divRound(BigInt(ev.y), 1000n)) });")]),
  m("K27", "lasso ctrl adds, shift toggles", [P("machine.ts", "else out.push(intent({ type: \"select\", mode: selectMode(p.mods0), targets }));", "else out.push(intent({ type: \"select\", mode: (p.mods0 & 10) !== 0 ? \"add\" : (p.mods0 & 1) !== 0 ? \"toggle\" : \"replace\", targets }));")]),
  m("K28", "lasso rectangle not normalised", [
    P("machine.ts", "const X0 = BigInt(Math.min(p.x0, ev.x)) * 1000n, X1 = BigInt(Math.max(p.x0, ev.x)) * 1000n;", "const X0 = BigInt(p.x0) * 1000n, X1 = BigInt(ev.x) * 1000n;"),
    P("machine.ts", "const Y0 = BigInt(Math.min(p.y0, ev.y)) * 1000n, Y1 = BigInt(Math.max(p.y0, ev.y)) * 1000n;", "const Y0 = BigInt(p.y0) * 1000n, Y1 = BigInt(ev.y) * 1000n;"),
  ]),
  m("K29", "lasso rectangle open at its border", [P("lasso.ts", "if (X0 <= p.X && p.X <= X1 && Y0 <= p.Y && p.Y <= Y1)", "if (X0 < p.X && p.X < X1 && Y0 < p.Y && p.Y < Y1)")]),
  m("K30", "lasso edge needs one endpoint inside", [P("lasso.ts", "inside[e.src] && inside[e.tgt]", "(inside[e.src] || inside[e.tgt])")]),
  m("K31", "lasso includes hidden nodes", [
    P("lasso.ts", "    if (!v.nodes[n.index]) continue;\n", ""),
    P("lasso.ts", "if (v.edges[e.index] && inside[e.src] && inside[e.tgt])", "if (inside[e.src] && inside[e.tgt])"),
  ]),
  // ---- keyboard navigation (rows V) -------------------------------------------------------------------------------------------------------------
  m("K32", "spatial navigation without the half-plane tier", [P("navigation.ts", "const tier = s <= p ? 1 : 2;", "const tier = s <= p ? 1 : 2;\n    if (tier === 2) continue;")]),
  m("K33", "spatial tie to the highest index", [P("navigation.ts", "key[2] < best[2]", "key[2] > best[2]")]),
  m("K34", "spatial cone open at 45 degrees", [P("navigation.ts", "const tier = s <= p ? 1 : 2;", "const tier = s < p ? 1 : 2;")]),
  m("K35", "up and down swapped", [P("navigation.ts", "else if (dir === \"down\") { p = dy; s = abs(dx); } else { p = -dy; s = abs(dx); }", "else if (dir === \"down\") { p = -dy; s = abs(dx); } else { p = dy; s = abs(dx); }")]),
  m("K36", "spatial from an edge uses its source", [P("navigation.ts", "ox = divRound(BigInt(a.x) + BigInt(b.x), 2n); oy = divRound(BigInt(a.y) + BigInt(b.y), 2n);", "ox = BigInt(a.x); oy = BigInt(a.y);")]),
  m("K37", "incident +1 picks the last edge", [P("navigation.ts", NODE_PICK, "const t = cmd.delta === 1 ? list[list.length - 1]! : list[0]!;", 2)]),
  m("K38", "incident navigation includes hidden edges", [P("navigation.ts", "if (v.edges[e.index] && (e.src === n || e.tgt === n)) out.push(e);", "if (e.src === n || e.tgt === n) out.push(e);")]),
  m("K39", "a self-loop counted twice", [P("navigation.ts", "if (v.edges[e.index] && (e.src === n || e.tgt === n)) out.push(e);", "if (v.edges[e.index] && (e.src === n || e.tgt === n)) { out.push(e); if (e.src === e.tgt) out.push(e); }")]),
  m("K40", "incident wraps without the option", [P("navigation.ts", "if (!o.wrap) return [nav({ type: \"nav-boundary\", nav: \"incident\", delta: cmd.delta })];", "")]),
  m("K41", "wrap without nav-wrapped event", [P("navigation.ts", "[focusOn(t), nav({ type: \"nav-wrapped\", end: cmd.delta === 1 ? \"end\" : \"start\" })]", "[focusOn(t)]")]),
  m("K42", "no focus: left/up focus the first element", [
    P("navigation.ts", "case \"nav-step\": case \"nav-incident\": return cmd.delta === 1 ? \"first\" : \"last\";", "case \"nav-step\": case \"nav-incident\": return \"first\";"),
    P("navigation.ts", "return cmd.dir === \"right\" || cmd.dir === \"down\" ? \"first\" : \"last\";", "return \"first\";"),
  ]),
  m("K43", "extend emits select before focus", [P("navigation.ts", "const out: Output[] = [focusOn(w)];\n      if (cmd.extend === true) out.push(intent({ type: \"select\", mode: \"add\", targets: [addressOf(w)] }));", "const out: Output[] = [];\n      if (cmd.extend === true) out.push(intent({ type: \"select\", mode: \"add\", targets: [addressOf(w)] }));\n      out.push(focusOn(w));")]),
  m("K44", "select-all includes hidden elements", [P("machine.ts", "const all = traversal(v);", "const all = [...v.model.nodes, ...v.model.edges];")]),
  // ---- bindings, tokens and event validation (rows B, E) ------------------------------------------------------------------------------------------
  m("K72", "punctuation tokens compared with the shift bit", [P("bindings.ts", "const mask = shiftIgnored(key) ? 14 : 15;", "const mask = 15;")]),
  m("K73", "marquee mode does not fall back to the normal table", [P("bindings.ts", "  return find(\"normal\");", "  return undefined;")]),
  m("K74", "step ignores the wrap option", [P("navigation.ts", "o.wrap && cmd.delta === ", "false && cmd.delta === ", 2)]),
  m("K75", "uppercase letters not lowercased", [P("bindings.ts", "    if (domKey >= \"A\" && domKey <= \"Z\") return domKey.toLowerCase();\n", "")]),
  m("K76", "event field with a fraction accepted by rounding", [P("events.ts", "if (!Number.isInteger(v)) throw bad(\"NOT_INTEGER\", path);", "if (!Number.isInteger(v)) v = Math.round(v);")]),
  m("K77", "time going backwards accepted", [P("events.ts", "if (t < lastT) throw bad(", "if (false) throw bad(")]),
  m("K78", "key not checked against the token grammar", [P("events.ts", "if (!isKeyToken(v)) throw bad(\"UNKNOWN_KEY\", f);", "")]),
  m("K79", "extra event key accepted", [P("events.ts", "if (k !== \"type\" && !(shape as readonly string[]).includes(k)) throw bad(", "if (false) throw bad(")]),
  m("K80", "punctuation tokens compared with the shift bit in the duplicate check", [P("bindings.ts", "const id = JSON.stringify([mode, key, shiftIgnored(key) ? mods & 14 : mods]);", "const id = JSON.stringify([mode, key, mods]);")]),
  m("K81", "`Tab` forbidden only in the normal mode", [P("bindings.ts", "if (key === \"Tab\") throw bad(\"TAB_BOUND\", p);", "if (key === \"Tab\" && mode === \"normal\") throw bad(\"TAB_BOUND\", p);")]),
  m("K84", "TypeScript-only: element lookup through a plain object keyed by graph strings (the label), the `??=` index pattern", [P("geometry.ts", "  const e = lookupElement(v.model, wire);\n  return e !== undefined && isDrawn(v, e) ? e : undefined;", "  const byLabel: Record<string, Element> = {};\n  for (const n of v.model.nodes) byLabel[n.label] ??= n;\n  const id = (wire as { id?: string }).id;\n  const e = id === undefined ? lookupElement(v.model, wire) : byLabel[id.slice(2)];\n  return e !== undefined && isDrawn(v, e) ? e : undefined;")]),
  m("K85", "a double click on an element does nothing", [P("machine.ts", "case \"dblclick\": out.push(intent({ type: \"fit\" })); break;", "case \"dblclick\": if (ev.target === undefined) out.push(intent({ type: \"fit\" })); break;")]),
  m("K86", "spatial key without the secondary term (p^2 + s^2, index)", [P("navigation.ts", KEYSPATIAL, "const key: [bigint, bigint, number] = [p * p + s * s, 0n, m.index];")]),
  m("K87", "spatial key lexicographic (p, s, index)", [P("navigation.ts", KEYSPATIAL, "const key: [bigint, bigint, number] = [p, s, m.index];")]),
  m("K88", "spatial key Manhattan (p + s, s, index)", [P("navigation.ts", KEYSPATIAL, "const key: [bigint, bigint, number] = [p + s, s, m.index];")]),
  m("K89", "spatial tie to the larger secondary", [P("navigation.ts", KEYSPATIAL, "const key: [bigint, bigint, number] = [p * p + s * s, -s, m.index];")]),
  m("K90", "reveal margin 0 instead of 24", [P("navigation.ts", "Math.min(REVEAL_MARGIN_PX, floorDivN(Math.min(w, h) - 1, 2))", "Math.min(0, floorDivN(Math.min(w, h) - 1, 2))")]),
  m("K91", "reveal pan sign flipped", [P("navigation.ts", "return { type: \"pan\", dx: Number(dx), dy: Number(dy) };", "return { type: \"pan\", dx: Number(-dx), dy: Number(-dy) };")]),
  m("K92", "reveal not applied to focus-step", [P("navigation.ts", "[intent({ type: \"focus-step\", delta: cmd.delta })], t[pos + cmd.delta]);", "[intent({ type: \"focus-step\", delta: cmd.delta })], undefined);")]),
  m("K93", "reveal applied although reveal is false", [P("navigation.ts", "if (o.reveal && target !== undefined &&", "if (target !== undefined &&")]),
  // ---- pointer details (rows I) -------------------------------------------------------------------------------------------------------------------
  m("K94", "a wheel event with dy = 0 resets the accumulator", [P("machine.ts", "if (d === 0n) return; // a horizontal-only swipe changes nothing: the sign of 0 is neither", "if (d === 0n) { m.wheel_acc = 0; return; }")]),
  m("K95", "a move after a fired long press pans", [P("machine.ts", "      if (p.long) break; // a fired long press claims the pointer: never a drag, never a click\n", "")]),
  m("K96", "no lasso-end on pointercancel", [P("machine.ts", "if (g === \"lasso\") out.push({ kind: \"lasso-end\" }); // a host that drew", "if (false) out.push({ kind: \"lasso-end\" }); // a host that drew")]),
  m("K97", "wake_at kept after the pointer moved", [P("machine.ts", "if (p.ptype === \"touch\" && m.gesture === \"press\" && !p.moved && !p.long) return p.t0 + LONG_PRESS_MS;", "if (p.ptype === \"touch\" && !p.long) return p.t0 + LONG_PRESS_MS;")]),
  m("K98", "a non-primary pointerdown is handled", [P("machine.ts", "if (ev.button !== 0) return false;", "if (ev.button !== 0) return true;")]),
  // ---- reveal branches and the count boundary ---------------------------------------------------------------------------------------------------
  m("K122", "reveal ignores the left and top branches", [P("navigation.ts", "(p < lo ? ceilDiv(lo - p, MICRO) : p > hi ?", "(p < lo ? 0n : p > hi ?")]),
  m("K123", "an edge target reveals toward its source centre", [P("navigation.ts", "return { X: divRound(pa.X + pb.X, 2n), Y: divRound(pa.Y + pb.Y, 2n) };", "return { X: pa.X, Y: pa.Y };")]),
  m("K124", "reveal margin not clamped for a tiny viewport", [P("navigation.ts", "Math.min(REVEAL_MARGIN_PX, floorDivN(Math.min(w, h) - 1, 2))", "REVEAL_MARGIN_PX")]),
  m("K126", "lasso and select-all count boundary exclusive", [P("machine.ts", ".length > c.cfg.maxTargets", ".length >= c.cfg.maxTargets", 3)]),
  // ---- binding-table domain rows B14-B110 (corpus K129-K153, added with the gap rows of review 34). Each mutant is this implementation's realization of the one-line
  //      text of MUTANTS.tsv. K136, K139 and K141 have the same patch as K80, K81 and X20 and are kept under their own ids because the corpus names other killer rows. ---
  m("K129", "host-mode grammar anchored with `$` (a trailing LF accepted)", [P("bindings.ts", "const MODE = /^x-[a-z0-9][a-z0-9._-]*$/;", "const MODE = /^x-[a-z0-9][a-z0-9._-]*\\n?$/;")]),
  m("K130", "host-mode first character may be `.`, `_` or `-`", [P("bindings.ts", "const MODE = /^x-[a-z0-9][a-z0-9._-]*$/;", "const MODE = /^x-[a-z0-9._-][a-z0-9._-]*$/;")]),
  m("K131", "mods -1 accepted", [P("bindings.ts", "if (!isInt(mods) || mods < 0 || mods > 15) throw", "if (!isInt(mods) || mods > 15) throw")]),
  m("K132", "mods 15 refused", [P("bindings.ts", "if (!isInt(mods) || mods < 0 || mods > 15) throw", "if (!isInt(mods) || mods < 0 || mods >= 15) throw")]),
  m("K133", "uppercase letters are key tokens", [P("bindings.ts", "return (s >= \"a\" && s <= \"z\") || (s >= \"0\" && s <= \"9\") || PUNCTUATION.includes(s);", "return (s >= \"a\" && s <= \"z\") || (s >= \"A\" && s <= \"Z\") || (s >= \"0\" && s <= \"9\") || PUNCTUATION.includes(s);")]),
  m("K134", "legacy key names (Esc, Left, Spacebar) are key tokens", [P("bindings.ts", "if (NAME_TOKENS.has(s) || s === \"Space\") return true;\n  if (s.length !== 1) return false;", "if (NAME_TOKENS.has(s) || s === \"Space\" || LEGACY.has(s)) return true;\n  if (s.length !== 1) return false;")]),
  m("K135", "shift bit ignored for every key in the duplicate check", [P("bindings.ts", DUPID, "const id = JSON.stringify([mode, key, mods & 14]);")]),
  m("K136", "shift bit never ignored in the duplicate check", [P("bindings.ts", DUPID, "const id = JSON.stringify([mode, key, mods]);")]),
  m("K137", "duplicate check compares only the shift bit", [P("bindings.ts", DUPID, "const id = JSON.stringify([mode, key, mods & 1]);")]),
  m("K138", "duplicate check ignores the mode", [P("bindings.ts", DUPID, "const id = JSON.stringify([key, shiftIgnored(key) ? mods & 14 : mods]);")]),
  m("K139", "Tab refused only in normal mode", [P("bindings.ts", TABROW, "if (key === \"Tab\" && mode === \"normal\") throw bad(\"TAB_BOUND\", p);")]),
  m("K140", "Tab refused only with mods 0", [P("bindings.ts", TABROW, "if (key === \"Tab\" && mods === 0) throw bad(\"TAB_BOUND\", p);")]),
  m("K141", "escape rule satisfied by an Escape row with any mods", [P("bindings.ts", "if (key === \"Escape\" && mods === 0) escapes.add(mode);", "if (key === \"Escape\") escapes.add(mode);")]),
  m("K142", "escape rule not applied to marquee", [P("bindings.ts", "if (m !== \"normal\" && !escapes.has(m)) throw", "if (m !== \"normal\" && m !== \"marquee\" && !escapes.has(m)) throw")]),
  m("K143", "escape rule checked before the rows", [P("bindings.ts", ROWS, "  { const ms = new Set<string>(), es = new Set<string>(); for (const e of rows) { const mm = e.get(\"mode\"); if (typeof mm === \"string\") { ms.add(mm); if (e.get(\"key\") === \"Escape\" && e.get(\"mods\") === 0) es.add(mm); } } for (const mm of ms) if (mm !== \"normal\" && !es.has(mm)) throw bad(\"NO_ESCAPE_EXIT\", undefined, mm); }\n" + ROWS)]),
  m("K144", "key token checked before mods", [P("bindings.ts", MODSKEY, KEYMODS)]),
  m("K145", "action type checked before the key token", [P("bindings.ts", KEYACT, ACTTYPE_FIRST + KEYACT)]),
  m("K146", "Tab checked before the action fields (after the action type)", [P("bindings.ts", ACTTAB, "    { const at = plainEntries(e.get(\"action\"))?.get(\"type\"); if (key === \"Tab\" && typeof at === \"string\" && ACTIONS.has(at)) throw bad(\"TAB_BOUND\", p); }\n" + ACTTAB)]),
  m("K147", "Tab rows found in a first pass over the whole table", [P("bindings.ts", ROWS, "  rows.forEach((e, i) => { if (e.get(\"key\") === \"Tab\") throw bad(\"TAB_BOUND\", `[${i}]`); });\n" + ROWS)]),
  m("K148", "closed-row check interleaved with the per-row checks", [
    P("bindings.ts", CLOSED + "\n    rows.push(e);", "    rows.push(e ?? new Map());"),
    P("bindings.ts", "    const p = `[${i}]`;\n    const mode = e.get(\"mode\")", "    const p = `[${i}]`;\n    if (e.size !== 4 || ![\"action\", \"key\", \"mode\", \"mods\"].every((k) => e.has(k))) throw bad(\"SCHEMA\", p, \"exactly action, key, mode, mods\");\n    const mode = e.get(\"mode\")"),
  ]),
  m("K149", "extra action fields tolerated", [P("bindings.ts", "if (e.size !== spec.fields.length + 1 || !spec.fields.every", "if (!spec.fields.every")]),
  m("K150", "empty table refused", [P("bindings.ts", "  if (!Array.isArray(table)) throw bad(\"SCHEMA\", undefined, \"an array expected\");\n", "  if (!Array.isArray(table) || table.length === 0) throw bad(\"SCHEMA\", undefined, \"an array expected\");\n")]),
  m("K151", "zoom factor given as a string accepted", [P("bindings.ts", "return isInt(x) && x >= 1 && x <= 1_000_000;", "return (isInt(x) || typeof x === \"string\") && (x as never) >= 1 && (x as never) <= 1_000_000;")]),
  m("K152", "spatial extend 1 or 0 accepted as a boolean", [P("bindings.ts", "typeof f.get(\"extend\") === \"boolean\" }],", "(typeof f.get(\"extend\") === \"boolean\" || f.get(\"extend\") === 1 || f.get(\"extend\") === 0) }],")]),
  m("K153", "action type compared case-insensitively", [P("bindings.ts", "const spec = typeof type === \"string\" ? ACTIONS.get(type) : undefined;", "const spec = typeof type === \"string\" ? ACTIONS.get(type.toLowerCase()) : undefined;")]),
  // ---- revision 4 rows B111-B174 and E74-E102 (corpus K201-K232 and K269-K310, added with the rev 4 round; design 32 rev 4, 6.4 and 5.1). Each is this implementation's
  //      realization of the one-line text of MUTANTS.tsv; none is reference-only. K232 is realized as the range check of pan dx and dy judged after the Tab row (type checks before it): the only
  //      reading under which B174 alone kills it (B105, a Tab row with dx 1.5, kills every other 'Tab before the fields' reading, K146 included). -----------------------------
  m("K201", "pan dx and dy not range-checked (any integer accepted)", [P("bindings.ts", PANOK, "return isInt(x) && isInt(y);")]),
  m("K202", "pan dx not range-checked", [P("bindings.ts", PANOK, "return isInt(x) && isInt(y) && Math.abs(y) <= PIX_LIMIT;")]),
  m("K203", "pan dy not range-checked", [P("bindings.ts", PANOK, "return isInt(x) && isInt(y) && Math.abs(x) <= PIX_LIMIT;")]),
  m("K204", "pan lower bound not checked (only the upper bound)", [P("bindings.ts", PANOK, "return isInt(x) && isInt(y) && x <= PIX_LIMIT && y <= PIX_LIMIT;")]),
  m("K205", "pan upper bound 2^31 refused (strict below 2^31)", [P("bindings.ts", PANOK, "return isInt(x) && isInt(y) && x < PIX_LIMIT && x >= -PIX_LIMIT && y < PIX_LIMIT && y >= -PIX_LIMIT;")]),
  m("K206", "pan lower bound -2^31 refused (strict above -2^31)", [P("bindings.ts", PANOK, "return isInt(x) && isInt(y) && x <= PIX_LIMIT && x > -PIX_LIMIT && y <= PIX_LIMIT && y > -PIX_LIMIT;")]),
  m("K207", "zoom factor not range-checked (any integer accepted)", [P("bindings.ts", ZOOMOK, "return isInt(x);")]),
  m("K208", "zoom factor 0 accepted (lower bound 0 instead of 1)", [P("bindings.ts", ZOOMOK, "return isInt(x) && x >= 0 && x <= 1_000_000;")]),
  m("K209", "zoom lower bound not checked (negative factors accepted)", [P("bindings.ts", ZOOMOK, "return isInt(x) && x <= 1_000_000;")]),
  m("K210", "zoom factor 1000000 refused (strict below 1,000,000)", [P("bindings.ts", ZOOMOK, "return isInt(x) && x >= 1 && x < 1_000_000;")]),
  m("K211", "zoom upper bound not checked", [P("bindings.ts", ZOOMOK, "return isInt(x) && x >= 1;")]),
  m("K212", "any string accepted as a spatial dir", [P("bindings.ts", DIROK, "typeof f.get(\"dir\") === \"string\" && typeof f.get(\"extend\") === \"boolean\"")]),
  m("K213", "spatial dir compared case-insensitively", [P("bindings.ts", DIROK, "DIRS.includes(typeof f.get(\"dir\") === \"string\" ? (f.get(\"dir\") as string).toLowerCase() : f.get(\"dir\")) && typeof f.get(\"extend\") === \"boolean\"")]),
  m("K214", "spatial dir trimmed of white space before the comparison", [P("bindings.ts", DIROK, "DIRS.includes(typeof f.get(\"dir\") === \"string\" ? (f.get(\"dir\") as string).trim() : f.get(\"dir\")) && typeof f.get(\"extend\") === \"boolean\"")]),
  m("K215", "any string accepted as an endpoint end", [P("bindings.ts", ENDOK, "ok: (f) => typeof f.get(\"end\") === \"string\" }],")]),
  m("K216", "endpoint end compared case-insensitively", [P("bindings.ts", ENDOK, "ok: (f) => typeof f.get(\"end\") === \"string\" && ((f.get(\"end\") as string).toLowerCase() === \"src\" || (f.get(\"end\") as string).toLowerCase() === \"tgt\") }],")]),
  m("K217", "endpoint end trimmed of white space before the comparison", [P("bindings.ts", ENDOK, "ok: (f) => typeof f.get(\"end\") === \"string\" && ((f.get(\"end\") as string).trim() === \"src\" || (f.get(\"end\") as string).trim() === \"tgt\") }],")]),
  m("K218", "any integer accepted as a step delta", [P("bindings.ts", STEPOK, "[\"step\", { fields: [\"delta\"], ok: (f) => isInt(f.get(\"delta\")) }],")]),
  m("K219", "any integer accepted as an incident delta", [P("bindings.ts", INCOK, "[\"incident\", { fields: [\"delta\"], ok: (f) => isInt(f.get(\"delta\")) }],")]),
  m("K220", "delta 0 accepted", [P("bindings.ts", ISDELTA, "const isDelta = (v: unknown): v is 1 | -1 => v === 1 || v === -1 || v === 0;")]),
  m("K221", "any positive integer accepted as a delta", [P("bindings.ts", ISDELTA, "const isDelta = (v: unknown): v is 1 | -1 => v === -1 || (isInt(v) && v >= 1);")]),
  m("K222", "a non-string mode reported as SCHEMA instead of INVALID_VALUE", [P("bindings.ts", MODECHK, "    if (typeof mode !== \"string\") throw bad(\"SCHEMA\", `${p}.mode`);\n    if (!(mode === \"normal\" || mode === \"marquee\" || MODE.test(mode))) throw bad(\"INVALID_VALUE\", `${p}.mode`);\n")]),
  m("K223", "mode converted with String() before the check (an array holding normal accepted)", [P("bindings.ts", MODECHK, "    if (!(String(mode) === \"normal\" || String(mode) === \"marquee\" || MODE.test(String(mode)))) throw bad(\"INVALID_VALUE\", `${p}.mode`);\n")]),
  m("K224", "mods converted with Number() before the check (null, false, an empty array read as 0)", [P("bindings.ts", MODS, "    const mn: unknown = typeof mods === \"string\" ? mods : Number(mods);\n    if (!isInt(mn) || mn < 0 || mn > 15) throw bad(\"INVALID_VALUE\", `${p}.mods`);\n")]),
  m("K225", "a non-string key reported as INVALID_VALUE instead of UNKNOWN_KEY", [P("bindings.ts", KEY, "    if (typeof key !== \"string\") throw bad(\"INVALID_VALUE\", `${p}.key`);\n    if (!isKeyToken(key)) throw bad(\"UNKNOWN_KEY\", `${p}.key`);\n")]),
  m("K226", "a non-string key reported as SCHEMA instead of UNKNOWN_KEY", [P("bindings.ts", KEY, "    if (typeof key !== \"string\") throw bad(\"SCHEMA\", `${p}.key`);\n    if (!isKeyToken(key)) throw bad(\"UNKNOWN_KEY\", `${p}.key`);\n")]),
  m("K227", "key converted with String() before the check (an array holding a accepted)", [P("bindings.ts", KEY, "    if (!isKeyToken(String(key))) throw bad(\"UNKNOWN_KEY\", `${p}.key`);\n")]),
  m("K228", "an action that is not an object reported as SCHEMA instead of UNKNOWN_ACTION", [P("bindings.ts", UNKACT, "if (e === undefined) throw bad(\"SCHEMA\", path);\n  if (spec === undefined) throw bad(\"UNKNOWN_ACTION\", path);")]),
  m("K229", "an action without a string type reported as INVALID_VALUE instead of UNKNOWN_ACTION", [P("bindings.ts", UNKACT, "if (e !== undefined && typeof type !== \"string\") throw bad(\"INVALID_VALUE\", path);\n  if (e === undefined || spec === undefined) throw bad(\"UNKNOWN_ACTION\", path);")]),
  m("K230", "an action given as a string read as its type", [P("bindings.ts", "  const e = plainEntries(v);\n  const type = e?.get(\"type\");", "  const e = typeof v === \"string\" ? new Map<string, unknown>([[\"type\", v]]) : plainEntries(v);\n  const type = e?.get(\"type\");")]),
  m("K231", "an action type converted with String() (an array holding fit read as fit)", [P("bindings.ts", "const spec = typeof type === \"string\" ? ACTIONS.get(type) : undefined;", "const spec = ACTIONS.get(String(type));")]),
  m("K232", "Tab checked before the action fields (the range check of pan dx and dy is judged after the Tab row; the type checks stay before it, so B105 does not kill)", [
    P("bindings.ts", PANOK, "return isInt(x) && isInt(y);"),
    P("bindings.ts", ACTTAB, ACTTAB + "\n    if (action.type === \"pan\" && (Math.abs(action.dx) > PIX_LIMIT || Math.abs(action.dy) > PIX_LIMIT)) throw bad(\"INVALID_VALUE\", `${p}.action`);"),
  ]),
  // ---- pointer and pinch field ranges of the machine reader (rows E74-E102, R32-10) -----------------------------------------------------------------
  //      K272 (last_t -1), K292 (t0 0) and K296 (id 0) refuse a value that the initial machine and every transcript step carry, and `step` re-reads its machine through the same strict reader
  //      (the oracle reference checks a machine only in parseMachine), so these three are killed by many rows besides the named E60, E75/E77/E78 and E75/E77/E78: a deviation recorded in review, not a defect.
  m("K269", "last_t: upper bound not checked", [P("machine.ts", LASTT, "!isInt(last_t) || last_t < -1")]),
  m("K270", "last_t: lower bound not checked", [P("machine.ts", LASTT, "!isInt(last_t) || last_t > 2 ** 52")]),
  m("K271", "last_t: the upper limit value itself refused (off by one)", [P("machine.ts", LASTT, "!isInt(last_t) || last_t < -1 || last_t >= 2 ** 52")]),
  m("K272", "last_t: the lower limit value itself refused (off by one)", [P("machine.ts", LASTT, "!isInt(last_t) || last_t <= -1 || last_t > 2 ** 52")]),
  m("K273", "pointer x: upper bound not checked", [P("machine.ts", "x: int(\"x\", -c, c)", "x: int(\"x\", -c)")]),
  m("K274", "pointer x: lower bound not checked", [P("machine.ts", "x: int(\"x\", -c, c)", "x: int(\"x\", -Infinity, c)")]),
  m("K275", "pointer x: the upper limit value itself refused (off by one)", [P("machine.ts", "x: int(\"x\", -c, c)", "x: int(\"x\", -c, c - 1)")]),
  m("K276", "pointer x: the lower limit value itself refused (off by one)", [P("machine.ts", "x: int(\"x\", -c, c)", "x: int(\"x\", -c + 1, c)")]),
  m("K277", "pointer x0: upper bound not checked", [P("machine.ts", "x0: int(\"x0\", -c, c)", "x0: int(\"x0\", -c)")]),
  m("K278", "pointer x0: lower bound not checked", [P("machine.ts", "x0: int(\"x0\", -c, c)", "x0: int(\"x0\", -Infinity, c)")]),
  m("K279", "pointer x0: the upper limit value itself refused (off by one)", [P("machine.ts", "x0: int(\"x0\", -c, c)", "x0: int(\"x0\", -c, c - 1)")]),
  m("K280", "pointer x0: the lower limit value itself refused (off by one)", [P("machine.ts", "x0: int(\"x0\", -c, c)", "x0: int(\"x0\", -c + 1, c)")]),
  m("K281", "pointer y: upper bound not checked", [P("machine.ts", "y: int(\"y\", -c, c)", "y: int(\"y\", -c)")]),
  m("K282", "pointer y: lower bound not checked", [P("machine.ts", "y: int(\"y\", -c, c)", "y: int(\"y\", -Infinity, c)")]),
  m("K283", "pointer y: the upper limit value itself refused (off by one)", [P("machine.ts", "y: int(\"y\", -c, c)", "y: int(\"y\", -c, c - 1)")]),
  m("K284", "pointer y: the lower limit value itself refused (off by one)", [P("machine.ts", "y: int(\"y\", -c, c)", "y: int(\"y\", -c + 1, c)")]),
  m("K285", "pointer y0: upper bound not checked", [P("machine.ts", "y0: int(\"y0\", -c, c)", "y0: int(\"y0\", -c)")]),
  m("K286", "pointer y0: lower bound not checked", [P("machine.ts", "y0: int(\"y0\", -c, c)", "y0: int(\"y0\", -Infinity, c)")]),
  m("K287", "pointer y0: the upper limit value itself refused (off by one)", [P("machine.ts", "y0: int(\"y0\", -c, c)", "y0: int(\"y0\", -c, c - 1)")]),
  m("K288", "pointer y0: the lower limit value itself refused (off by one)", [P("machine.ts", "y0: int(\"y0\", -c, c)", "y0: int(\"y0\", -c + 1, c)")]),
  m("K289", "pointer t0: upper bound not checked", [P("machine.ts", "t0: int(\"t0\", 0, 2 ** 52)", "t0: int(\"t0\", 0)")]),
  m("K290", "pointer t0: lower bound not checked", [P("machine.ts", "t0: int(\"t0\", 0, 2 ** 52)", "t0: int(\"t0\", -Infinity, 2 ** 52)")]),
  m("K291", "pointer t0: the upper limit value itself refused (off by one)", [P("machine.ts", "t0: int(\"t0\", 0, 2 ** 52)", "t0: int(\"t0\", 0, 2 ** 52 - 1)")]),
  m("K292", "pointer t0: the lower limit value itself refused (off by one)", [P("machine.ts", "t0: int(\"t0\", 0, 2 ** 52)", "t0: int(\"t0\", 1, 2 ** 52)")]),
  m("K293", "pointer id: upper bound not checked", [P("machine.ts", "id: int(\"id\", 0, 2 ** 31 - 1)", "id: int(\"id\", 0)")]),
  m("K294", "pointer id: lower bound not checked", [P("machine.ts", "id: int(\"id\", 0, 2 ** 31 - 1)", "id: int(\"id\", -Infinity, 2 ** 31 - 1)")]),
  m("K295", "pointer id: the upper limit value itself refused (off by one)", [P("machine.ts", "id: int(\"id\", 0, 2 ** 31 - 1)", "id: int(\"id\", 0, 2 ** 31 - 2)")]),
  m("K296", "pointer id: the lower limit value itself refused (off by one)", [P("machine.ts", "id: int(\"id\", 0, 2 ** 31 - 1)", "id: int(\"id\", 1, 2 ** 31 - 1)")]),
  m("K297", "pinch mx: upper bound not checked", [P("machine.ts", "Math.abs(mx) > c", "mx < -c")]),
  m("K298", "pinch mx: lower bound not checked", [P("machine.ts", "Math.abs(mx) > c", "mx > c")]),
  m("K299", "pinch mx: the upper limit value itself refused (off by one)", [P("machine.ts", "Math.abs(mx) > c", "mx >= c || mx < -c")]),
  m("K300", "pinch mx: the lower limit value itself refused (off by one)", [P("machine.ts", "Math.abs(mx) > c", "mx > c || mx <= -c")]),
  m("K301", "pinch my: upper bound not checked", [P("machine.ts", "Math.abs(my) > c", "my < -c")]),
  m("K302", "pinch my: lower bound not checked", [P("machine.ts", "Math.abs(my) > c", "my > c")]),
  m("K303", "pinch my: the upper limit value itself refused (off by one)", [P("machine.ts", "Math.abs(my) > c", "my >= c || my < -c")]),
  m("K304", "pinch my: the lower limit value itself refused (off by one)", [P("machine.ts", "Math.abs(my) > c", "my > c || my <= -c")]),
  m("K305", "pinch d: upper bound not checked", [P("machine.ts", PINCHD, "d < 0")]),
  m("K306", "pinch d: lower bound not checked", [P("machine.ts", PINCHD, "d > 2 ** 41")]),
  m("K307", "pinch d: the upper limit value itself refused (off by one)", [P("machine.ts", PINCHD, "d < 0 || d >= 2 ** 41")]),
  m("K308", "pinch d: the lower limit value itself refused (off by one)", [P("machine.ts", PINCHD, "d <= 0 || d > 2 ** 41")]),
  m("K309", "pointer and pinch fields not range-checked (the rev 3 reading, 'not range-checked again')", [
    P("machine.ts", "if (!isInt(x) || x < lo || x > hi) throw badMachine(", "if (!isInt(x)) throw badMachine("),
    P("machine.ts", " || d < 0 || d > 2 ** 41 || Math.abs(mx) > c || Math.abs(my) > c) throw badMachine(\"pinch\");", ") throw badMachine(\"pinch\");"),
  ]),
  m("K310", "pointer ranges checked on the first pointer only", [
    P("machine.ts", "function readPointer(v: unknown): MPointer {", "function readPointer(v: unknown, strict = true): MPointer {"),
    P("machine.ts", "if (!isInt(x) || x < lo || x > hi) throw badMachine(", "if (!isInt(x) || (strict && (x < lo || x > hi))) throw badMachine("),
    P("machine.ts", "const p = readPointer(d.value);", "const p = readPointer(d.value, i === 0);"),
  ]),
];

/**
 * Extra mutants (X01...), not in the corpus table: the behaviour added after the independent audit of stage A1 (reviews/32-code-audit-a1.md) and the sixteen
 * mutants of the auditor's own set that survived every row and every test (M02, M03, M07, M08, M11, M20, M21, M23, M27, M28, M29, M39, M42, M43, M44, M47).
 * They are killed by the ext: rows of test/oracle/ext.ts, which the harness runs besides the oracle rows.
 */
const MIDPOINT = "const midpoint = (a: MPointer, b: MPointer): { x: number; y: number } => ({ x: Number(floorDiv(BigInt(a.x) + BigInt(b.x), 2n)), y: Number(floorDiv(BigInt(a.y) + BigInt(b.y), 2n)) });";
export const EXTRA_MUTANTS = [
  m("X01", "audit I-1: a contextmenu (and pointerdown) target of the wrong kind is accepted", [P("machine.ts", "return el !== undefined && isEdge(el) === (\"edge\" in target) ? el : undefined;", "return el;")]),
  m("X02", "audit M-1: a lone surrogate in a node address of a machine is accepted", [P("machine.ts", "  if (hasLoneSurrogate(id) || hasLoneSurrogate(type)) throw badMachine(\"an address string holds a lone surrogate\"); // never an IgsError from the serializer\n", "")]),
  m("X03", "audit M-3: marquee-commit with no anchor is a silent no-op", [P("machine.ts", "const anchor = m.anchor === undefined ? undefined : drawnElement(v, m.anchor);", "if (m.anchor === undefined) return;\n  const anchor = drawnElement(v, m.anchor);")]),
  m("X04", "audit M-5: the pointer x coordinate is not range-checked in readMachine", [P("machine.ts", "x: int(\"x\", -c, c)", "x: int(\"x\")")]),
  m("X05", "audit M-5: t0 is not range-checked in readMachine", [P("machine.ts", "t0: int(\"t0\", 0, 2 ** 52)", "t0: int(\"t0\")")]),
  m("X06", "audit M-6: the pointer id is not range-checked (a negative first id)", [P("machine.ts", "id: int(\"id\", 0, 2 ** 31 - 1)", "id: int(\"id\")")]),
  m("X07", "audit M-5: the pinch distance is not range-checked", [P("machine.ts", " || d < 0 || d > 2 ** 41", "")]),
  m("X08", "audit M-5: the pinch midpoint is not range-checked", [P("machine.ts", " || Math.abs(mx) > c || Math.abs(my) > c", "")]),
  m("X09", "audit M-1: a lone surrogate in an edge address of a machine is accepted", [P("machine.ts", " || hasLoneSurrogate(ord) || hasLoneSurrogate(rel)", "")]),
  m("X10", "audit M-10 M02: the pinch midpoint truncates toward zero", [P("machine.ts", MIDPOINT, "const midpoint = (a: MPointer, b: MPointer): { x: number; y: number } => ({ x: Number((BigInt(a.x) + BigInt(b.x)) / 2n), y: Number((BigInt(a.y) + BigInt(b.y)) / 2n) });")]),
  m("X11", "audit M-10 M03: the pinch zoom without the reference distance guard", [P("machine.ts", "if (pinch.d > 0 && d1 > 0n) {", "if (d1 > 0n) {")]),
  m("X12", "audit M-10 M07: the context-action position floors", [P("machine.ts", "x: Number(divRound(BigInt(ev.x), 1000n)), y: Number(divRound(BigInt(ev.y), 1000n)), ...(target === undefined ? {} : { target }) });", "x: Math.floor(ev.x / 1000), y: Math.floor(ev.y / 1000), ...(target === undefined ? {} : { target }) });")]),
  m("X13", "audit M-10 M08: the long-press position floors", [P("machine.ts", "x: Number(divRound(BigInt(p.x), 1000n)), y: Number(divRound(BigInt(p.y), 1000n)) });", "x: Math.floor(p.x / 1000), y: Math.floor(p.y / 1000) });")]),
  m("X14", "audit M-10 M11: the marquee rectangle is not normalized", [P("machine.ts", "lassoTargetsMicro(v, lo(a.X, b.X), lo(a.Y, b.Y), hi(a.X, b.X), hi(a.Y, b.Y))", "lassoTargetsMicro(v, a.X, a.Y, b.X, b.Y)")]),
  m("X15", "audit M-10 M20: the reveal margin box is open at the high edges", [P("navigation.ts", "if (X >= lo && X <= hiX && Y >= lo && Y <= hiY) return undefined;", "if (X >= lo && X < hiX && Y >= lo && Y < hiY) return undefined;")]),
  m("X16", "audit M-10 M21: the reveal pan truncates on the left and top", [P("navigation.ts", "p < lo ? ceilDiv(lo - p, MICRO)", "p < lo ? (lo - p) / MICRO")]),
  m("X17", "audit M-10 M23: the reveal omission is inclusive at 2^31", [P("navigation.ts", "if (dx > PIX_LIMIT || dx < -PIX_LIMIT || dy > PIX_LIMIT || dy < -PIX_LIMIT) return undefined;", "if (dx >= PIX_LIMIT || dx <= -PIX_LIMIT || dy >= PIX_LIMIT || dy <= -PIX_LIMIT) return undefined;")]),
  m("X18", "audit M-10 M27: with no focus an endpoint move focuses the last element", [P("navigation.ts", "case \"nav-endpoint\": return \"first\";", "case \"nav-endpoint\": return \"last\";")]),
  m("X19", "audit M-10 M28: Home and End reveal even the already focused element", [P("navigation.ts", "if (o.reveal && target !== undefined && !(v.focus !== undefined && sameElement(v.focus, target))) {", "if (o.reveal && target !== undefined) {")]),
  m("X20", "audit M-10 M29: an Escape row with any modifiers satisfies NO_ESCAPE_EXIT", [P("bindings.ts", "if (key === \"Escape\" && mods === 0) escapes.add(mode);", "if (key === \"Escape\") escapes.add(mode);")]),
  m("X21", "audit M-10 M39: the lasso selects a hidden edge between two inside nodes", [P("lasso.ts", "if (v.edges[e.index] && inside[e.src] && inside[e.tgt])", "if (inside[e.src] && inside[e.tgt])")]),
  m("X22", "audit M-10 M42: the pinch factor upper clamp is 2,000,000", [P("machine.ts", "f > 1_000_000n ? 1_000_000n : f", "f > 2_000_000n ? 2_000_000n : f")]),
  m("X23", "audit M-10 M43: the pinch factor lower clamp is 0", [P("machine.ts", "f < 1n ? 1n : f", "f < 0n ? 0n : f")]),
  m("X24", "audit M-10 M44: the remainders are not range-checked in readMachine", [P("machine.ts", "if (!isInt(rem_x) || rem_x < -500 || rem_x > 499 || !isInt(rem_y) || rem_y < -500 || rem_y > 499) throw badMachine(\"rem_x or rem_y\");", "if (!isInt(rem_x) || !isInt(rem_y)) throw badMachine(\"rem_x or rem_y\");")]),
  m("X25", "audit M-10 M47: mods0 is not range-checked in readMachine", [P("machine.ts", "  if (mods0 < 0 || mods0 > 15) throw badMachine(\"mods0\");\n", "")]),
];
