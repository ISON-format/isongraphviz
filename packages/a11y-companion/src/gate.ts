// src/gate.ts - the accessibility gate `igr-a11y-gate/1` (design 10): a pure verifier over (model, state, companion tree or SVG list) per composition. It checks
// the listed items and reports findings; it does NOT claim WCAG conformance (Law 8). `verdict: "pass"` means "the listed checks hold for this input".
import { buildAccessibleModel, lookupElement, type ElementAddress, type ModelEdge, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { DEFAULT_BINDINGS, IaError, type Binding } from "isongraph-visualize-interaction-core";
import { defaultWindow, readTree, type ReadItem } from "./tree.js";
import { readSvgInput, svgMapFindings, type Finding, type SvgInput } from "./svgmap.js";
import type { CompanionTree, Mode, WindowOption } from "./types.js";
import { addressKey, canon, copyPlain, itemId, plainArray, plainEntries, screenMicro, type Plain } from "./util.js";

export const GATE_FORMAT = "igr-a11y-gate/1";
export const GATE_SCOPE = "listed-checks-only";
const NOT_CLAIMED: readonly string[] = [
  "assistive-technology-behaviour", "character-key-shortcuts", "colour-contrast", "keyboard-behaviour-in-real-browsers", "pointer-gesture-alternatives",
  "reflow-and-text-spacing", "screen-reader-browse-mode", "scroll-trap-behaviour", "selection-state-in-svg", "set-hidden-keyboard-access", "target-size-of-real-pixels",
  "wcag-conformance",
];

export interface GateInput {
  model: RenderModel; state: SemanticState;
  composition?: "companion" | "svg-native";
  tree?: CompanionTree;
  bindings?: readonly Binding[];
  window?: WindowOption;
  fidelity?: { motion: "none" | "full" }; reducedMotion?: boolean;
  readout?: { focus?: ElementAddress };
  canvasLabel?: string;
  svg?: { root: { title: string; desc: string }; items: readonly { name: string; tabindex: number }[] };
  mode?: Mode;
  tabStops?: number;
}
export type Verdict = "pass" | "fail" | "info" | "not-applicable";
export interface GateCheck { findings: Finding[]; id: string; verdict: Verdict }
export interface GateReport { checks: GateCheck[]; gate: "igr-a11y-gate/1"; layout_sha256: string; not_claimed: string[]; scene_sha256: string; scope: "listed-checks-only"; verdict: "pass" | "fail" }

const bad = (path: string, detail?: string): IaError => new IaError("INVALID_INPUT", "SCHEMA", path, detail);

interface Row { mode: string; key: string; mods: number; step?: number }
/** The binding table as the gate reads it: not verified (a defective host table is what G3 reports); only the fields the checks read, owned copies. */
function readTable(v: unknown): Row[] {
  const a = plainArray(v);
  if (a === undefined) throw bad("bindings", "an array expected");
  return a.map((r, i) => {
    const m = plainEntries(r);
    const act = m === undefined ? undefined : plainEntries(m.get("action"));
    if (m === undefined || act === undefined || typeof m.get("mode") !== "string" || typeof m.get("key") !== "string" || typeof m.get("mods") !== "number" || typeof act.get("type") !== "string") throw bad(`bindings[${i}]`);
    const row: Row = { mode: m.get("mode") as string, key: m.get("key") as string, mods: m.get("mods") as number };
    if (act.get("type") === "step" && typeof act.get("delta") === "number") row.step = act.get("delta") as number;
    return row;
  });
}

function readWindowOpt(w: unknown): WindowOption {
  if (w === "auto" || w === "all") return w;
  const m = plainEntries(w);
  if (m === undefined) throw new IaError("INVALID_CONFIG", "SCHEMA", "window");
  for (const k of m.keys()) if (k !== "first" && k !== "count") throw new IaError("INVALID_CONFIG", "SCHEMA", `window.${k}`);
  const first = m.get("first"), count = m.get("count");
  if (typeof first !== "number" || typeof count !== "number") throw new IaError("INVALID_CONFIG", "SCHEMA", "window");
  if (!Number.isInteger(first) || !Number.isInteger(count)) throw new IaError("INVALID_CONFIG", "NOT_INTEGER", "window");
  if (first < 1 || count < 0 || count > 5000) throw new IaError("INVALID_CONFIG", "OUT_OF_RANGE", "window");
  return { first, count };
}

const checkOf = (id: string, findings: Finding[]): GateCheck => ({ findings, id, verdict: findings.length === 0 ? "pass" : "fail" });
const na = (id: string): GateCheck => ({ findings: [], id, verdict: "not-applicable" });
const NAME_BLANK = /^[\s﻿]*$/; // the JavaScript whitespace set (27 4.2)

export function runAccessibilityGate(input: GateInput): GateReport {
  const top = plainEntries(input);
  if (top === undefined) throw bad("input", "a plain object expected");
  const allowedKeys = ["model", "state", "composition", "tree", "bindings", "window", "fidelity", "reducedMotion", "readout", "canvasLabel", "svg", "mode", "tabStops"];
  for (const k of top.keys()) if (!allowedKeys.includes(k)) throw bad(`input.${k}`, "unknown key");
  const g = (k: string): unknown => top.get(k);
  const model = g("model") as RenderModel;
  // the state is snapshotted once as own plain data (an accessor is refused): the validator and every later read see the same values
  const stateCopy = copyPlain(g("state"), 12);
  if (stateCopy === undefined) throw bad("state", "plain data expected");
  const state = stateCopy as unknown as SemanticState;
  const am = buildAccessibleModel(model, state); // validates the model and the state
  const comp = g("composition") === undefined ? "companion" : g("composition");
  if (comp !== "companion" && comp !== "svg-native") throw bad("composition", '"companion" or "svg-native" expected');
  const table = g("bindings") === undefined ? readTable(DEFAULT_BINDINGS) : readTable(g("bindings"));
  const win = g("window") === undefined ? "auto" : readWindowOpt(g("window"));
  let motion: string | undefined;
  if (g("fidelity") !== undefined) {
    const f = plainEntries(g("fidelity"));
    if (f === undefined || (f.get("motion") !== "none" && f.get("motion") !== "full") || f.size !== 1) throw bad("fidelity");
    motion = f.get("motion") as string;
  }
  if (g("reducedMotion") !== undefined && typeof g("reducedMotion") !== "boolean") throw bad("reducedMotion");
  let readoutFocus: { present: boolean; address?: unknown } | undefined;
  if (g("readout") !== undefined) {
    const r = plainEntries(g("readout"));
    if (r === undefined) throw bad("readout");
    for (const k of r.keys()) if (k !== "focus") throw bad(`readout.${k}`);
    readoutFocus = r.has("focus") ? { present: true, address: r.get("focus") } : { present: false };
  }
  if (g("canvasLabel") !== undefined && typeof g("canvasLabel") !== "string") throw bad("canvasLabel");
  if (g("mode") !== undefined && g("mode") !== "normal" && g("mode") !== "marquee") throw bad("mode");
  const tabStops = g("tabStops");
  if (tabStops !== undefined && (typeof tabStops !== "number" || !Number.isInteger(tabStops))) throw bad("tabStops");
  let svg: SvgInput | undefined;
  let tree: ReturnType<typeof readTree> | undefined;
  if (comp === "svg-native") {
    if (g("svg") === undefined) throw bad("svg", "required for svg-native");
    svg = readSvgInput(g("svg"));
  } else {
    if (g("svg") !== undefined) throw bad("svg", "not allowed for the companion composition");
    if (g("tree") === undefined) throw bad("tree", "required for the companion composition");
    tree = readTree(g("tree"), true);
  }

  const n = am.items.length;
  let fpos: number | undefined;
  for (const it of am.items) if (it.focused) { fpos = it.position; break; }
  const stop = n === 0 ? undefined : fpos ?? 1;
  const checks: GateCheck[] = [];

  // ---- G1-REACH ----
  {
    const f: Finding[] = [];
    const hasStep = (d: number): boolean => table.some((r) => r.mode === "normal" && r.mods === 0 && r.step === d);
    if (!hasStep(1)) f.push({ code: "NO_STEP_FORWARD_BINDING" });
    if (!hasStep(-1)) f.push({ code: "NO_STEP_BACKWARD_BINDING" });
    if (tree !== undefined) {
      if (tree.list.set_size !== n) f.push({ code: "SETSIZE_WRONG" });
      const ew = win === "auto" ? defaultWindow(n, fpos) : win === "all" ? { first: 1, count: n } : win;
      if (tree.list.window.first !== ew.first || tree.list.window.count !== ew.count) f.push({ code: "WINDOW_MISMATCH" });
      const need = new Set<number>();
      const lo = Math.max(1, tree.list.window.first), hi = Math.min(n, tree.list.window.first + tree.list.window.count - 1);
      for (let p = lo; p <= hi; p++) need.add(p);
      for (const p of [fpos, stop]) if (p !== undefined && p >= 1 && p <= n) need.add(p);
      const seen = new Map<number, number>();
      const dups: number[] = [];
      for (const it of tree.items) { const c = (seen.get(it.position) ?? 0) + 1; seen.set(it.position, c); if (c === 2) dups.push(it.position); }
      for (const p of [...need].sort((a, b) => a - b)) if (!seen.has(p)) f.push({ code: "ITEM_MISSING", position: p });
      for (const p of dups) f.push({ code: "ITEM_DUPLICATE", position: p });
    }
    checks.push(checkOf("G1-REACH", f));
  }

  // ---- G2-NAME ----
  if (tree === undefined) checks.push(na("G2-NAME"));
  else {
    const f: Finding[] = [];
    for (const it of tree.items) {
      const p = it.position;
      if (p < 1 || p > n) { f.push({ code: "POSITION_INVALID", position: p }); continue; }
      const k = am.items[p - 1]!;
      if (addressKey(it.address) !== addressKey(k.address)) { f.push({ code: "ADDRESS_WRONG", position: p }); continue; }
      if (it.kind !== k.role) f.push({ code: "KIND_WRONG", position: p });
      if (it.id !== itemId(tree.id_prefix, k.address)) f.push({ code: "ID_WRONG", position: p });
      if (NAME_BLANK.test(it.name)) f.push({ code: "NAME_EMPTY", position: p });
      else if (it.name !== k.name) f.push({ code: "NAME_MISMATCH", position: p });
      if (it.roledescription === "") f.push({ code: "ROLE_MISSING", position: p });
      else if (it.roledescription !== k.role) f.push({ code: "ROLE_WRONG", position: p });
      if (k.description !== undefined) {
        if (it.description === undefined) f.push({ code: "DESCRIPTION_MISSING", position: p });
        else if (it.description !== k.description) f.push({ code: "DESCRIPTION_MISMATCH", position: p });
      } else if (it.description !== undefined) f.push({ code: "DESCRIPTION_UNEXPECTED", position: p });
      if (it.selected !== k.selected) f.push({ code: "SELECTED_WRONG", position: p });
      if (it.set_size !== n) f.push({ code: "ITEM_SETSIZE_WRONG", position: p });
    }
    checks.push(checkOf("G2-NAME", f));
  }

  // ---- G3-TRAP ----
  {
    const f: Finding[] = [];
    if (table.some((r) => r.key === "Tab")) f.push({ code: "TAB_BOUND" });
    const modes: string[] = []; // one pass: the modes in order of first occurrence, and the modes that have an Escape row
    const seenModes = new Set<string>(), exits = new Set<string>();
    for (const r of table) {
      if (r.mode !== "normal" && !seenModes.has(r.mode)) { seenModes.add(r.mode); modes.push(r.mode); }
      if (r.key === "Escape" && r.mods === 0) exits.add(r.mode);
    }
    for (const m of modes) if (!exits.has(m)) f.push({ code: "NO_ESCAPE_EXIT" });
    if (tree !== undefined) {
      const zeros = tree.items.filter((it) => it.tabindex === 0);
      const countOk = n > 0 ? zeros.length === 1 : zeros.length === 0;
      if (!countOk) f.push({ code: "TABSTOP_COUNT" });
      else if (zeros.length === 1 && zeros[0]!.position !== stop) f.push({ code: "TABSTOP_WRONG" });
      for (const it of tree.items) if (it.tabindex !== 0 && it.tabindex !== -1) f.push({ code: "TABINDEX_INVALID", position: it.position });
    }
    checks.push(checkOf("G3-TRAP", f));
  }

  // ---- G4-FOCUS ----
  if (tree === undefined) checks.push(na("G4-FOCUS"));
  else {
    const f: Finding[] = [];
    const focused: ReadItem[] = tree.items.filter((it) => it.focused);
    if (fpos !== undefined) {
      if (focused.length === 0) f.push({ code: "FOCUS_ITEM_MISSING" });
      else if (focused.length > 1) f.push({ code: "FOCUS_COUNT" });
      else if (focused[0]!.position !== fpos) f.push({ code: "FOCUSED_WRONG" });
    } else if (focused.length > 0) f.push({ code: "FOCUS_COUNT" });
    checks.push(checkOf("G4-FOCUS", f));
  }

  // ---- G5-MOTION ----
  checks.push(motion === undefined ? na("G5-MOTION") : checkOf("G5-MOTION", g("reducedMotion") === true && motion !== "none" ? [{ code: "MOTION_NOT_NONE" }] : []));

  // ---- G6-TEXT ----
  if (tree === undefined) checks.push(na("G6-TEXT"));
  else {
    const f: Finding[] = [];
    if (tree.container.name === "") f.push({ code: "SUMMARY_MISSING" });
    else if (tree.container.name !== am.summary) f.push({ code: "SUMMARY_MISMATCH" });
    if (tree.container.description !== am.status) f.push({ code: "STATUS_MISMATCH" });
    if (g("canvasLabel") !== undefined && g("canvasLabel") !== `${am.summary} ${am.status}`) f.push({ code: "CANVAS_LABEL_MISMATCH" });
    checks.push(checkOf("G6-TEXT", f));
  }

  // ---- G7-LIVE ----
  if (tree === undefined) checks.push(na("G7-LIVE"));
  else {
    const f: Finding[] = [];
    if (tree.mode !== "normal" && tree.mode !== "marquee") f.push({ code: "MODE_INVALID" });
    else if (g("mode") !== undefined && g("mode") !== tree.mode) f.push({ code: "MODE_MISMATCH" });
    if (tree.live === undefined) f.push({ code: "LIVE_MISSING" });
    else {
      if (tree.live.politeness !== "polite") f.push({ code: "LIVE_NOT_POLITE" });
      if (tree.live.atomic !== true) f.push({ code: "LIVE_NOT_ATOMIC" });
      if (tree.live.text.length > 400) f.push({ code: "LIVE_TOO_LONG" });
    }
    checks.push(checkOf("G7-LIVE", f));
  }

  // ---- G8-TARGET (informational) ----
  checks.push({ findings: am.items.some((it) => it.role === "edge") ? [{ code: "EDGE_TARGET_BELOW_24" }] : [], id: "G8-TARGET", verdict: "info" });

  // ---- G9-MAP ----
  checks.push(svg === undefined ? na("G9-MAP") : checkOf("G9-MAP", svgMapFindings(svg, am.summary, am.status, am.items.map((it) => it.name), stop)));

  // ---- G10-MARKER ----
  if (readoutFocus === undefined) checks.push(na("G10-MARKER"));
  else {
    const have = readoutFocus.present && readoutFocus.address !== undefined, want = state.focus !== undefined;
    let equal = have === want;
    if (equal && have) { try { equal = addressKey(readoutFocus.address as Plain) === addressKey(state.focus); } catch { equal = false; } }
    checks.push(checkOf("G10-MARKER", equal ? [] : [{ code: "NO_BACKEND_MARKER" }]));
  }

  // ---- G11-PAGE ----
  checks.push(tabStops === undefined ? na("G11-PAGE") : checkOf("G11-PAGE", tabStops === (n > 0 ? 1 : 0) ? [] : [{ code: "TABSTOP_COUNT_PAGE" }]));

  // ---- G12-VIEW ----
  {
    const f: Finding[] = [];
    if (state.focus !== undefined) {
      const el = lookupElement(model, "node" in state.focus ? state.focus.node : state.focus.edge);
      if (el !== undefined) {
        const vp = state.viewport;
        let X: bigint, Y: bigint;
        if ("category" in el) ({ X, Y } = screenMicro(vp, el.x, el.y));
        else {
          const e = el as ModelEdge;
          const a = screenMicro(vp, model.nodes[e.src]!.x, model.nodes[e.src]!.y), b = screenMicro(vp, model.nodes[e.tgt]!.x, model.nodes[e.tgt]!.y);
          const mid = (p: bigint, q: bigint): bigint => { const num = 2n * (p + q) + 2n; let r = num / 4n; if (num % 4n !== 0n && num < 0n) r -= 1n; return r; }; // divRound(p + q, 2)
          X = mid(a.X, b.X); Y = mid(a.Y, b.Y);
        }
        if (X < 0n || X > BigInt(vp.width) * 1_000_000n || Y < 0n || Y > BigInt(vp.height) * 1_000_000n) f.push({ code: "FOCUS_OFFSCREEN" });
      }
    }
    checks.push(checkOf("G12-VIEW", f));
  }

  const fail = checks.some((c) => c.verdict === "fail");
  return { checks, gate: GATE_FORMAT, layout_sha256: model.layoutSha256, not_claimed: [...NOT_CLAIMED], scene_sha256: model.sceneSha256, scope: GATE_SCOPE, verdict: fail ? "fail" : "pass" };
}

export function serializeGateReport(r: GateReport): Uint8Array { return canon(r); }
