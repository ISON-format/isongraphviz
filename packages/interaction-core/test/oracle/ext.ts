// The `ext:` rows of interaction-core: checks that no row of fixtures/oracles-ia observes (the independent audit of stage A1 found the gaps; design 15.7 lists
// them as TypeScript-tranche items). They are NOT oracle rows and claim no corpus bytes; like the oracle rows they are parameterized by the implementation, so
// the same logic runs against src/ (test/ext.test.ts) and against the scratch copies of the mutation harness (scripts/mutate.mjs: the extra mutants X01...).
// Imports nothing from vitest and nothing from src/.
import { initialState, reduce, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { errKey, modelOf, type Corpus, type Impl, type RowResult } from "./runner.js";

type Imp = Impl & { revealPan(model: RenderModel, state: SemanticState, target: unknown): unknown };
type Json = Record<string, unknown>;
const SIZE = { width: 900, height: 600 };

function eq(got: unknown, want: unknown, what: string): void {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}: expected ${w}, got ${g}`);
}
function throws(f: () => unknown, key: string, what: string): void {
  try { f(); } catch (e) { if (errKey(e) !== key) throw new Error(`${what}: expected ${key}, got ${errKey(e)}`); return; }
  throw new Error(`${what}: expected ${key}, got no error`);
}
const text = (b: Uint8Array): string => new TextDecoder().decode(b);

interface Ctx { impl: Imp; model: RenderModel; state: SemanticState }
const key = (t: number, k: string, mods = 0): Json => ({ type: "key", t, key: k, mods });
const withViewport = (s: SemanticState, v: Partial<SemanticState["viewport"]>): SemanticState => ({ ...s, viewport: { ...s.viewport, ...v } });
const down = (t: number, id: number, x: number, y: number, extra: Json = {}): Json => ({ type: "pointerdown", t, id, ptype: "touch", button: 0, x, y, mods: 0, ...extra });
const A = { node: { id: "s:a", type: "p" } };

/** A machine object (as `step` would return it) for the readers: one press pointer, overridable. */
const pressMachine = (pointer: Json = {}, top: Json = {}): Json => ({
  gesture: "press", last_t: 0, mode: "normal", rem_x: 0, rem_y: 0, wheel_acc: 0,
  pointers: [{ button: 0, id: 1, lasso: false, long: false, mods0: 0, moved: false, ptype: "mouse", t0: 0, x: 0, x0: 0, y: 0, y0: 0, ...pointer }], ...top,
});
const panMachine = (top: Json = {}, pointer: Json = {}): Json => pressMachine({ moved: true, ...pointer }, { gesture: "pan", ...top });

export const EXT: { id: string; what: string; run(c: Ctx): void }[] = [
  {
    id: "ext:I1-contextmenu-kind", what: "a contextmenu target of the wrong kind is absent, as at pointerdown (5.2)",
    run({ impl, model, state }) {
      const edge = model.edges[0]!.ref;
      const ev = (target: unknown): Json => ({ type: "contextmenu", t: 0, x: 182000, y: 32000, mods: 0, target });
      const hasTarget = (target: unknown): boolean => (impl.step(impl.createMachine(), ev(target), model, state).outputs[0] as Json)["target"] !== undefined;
      eq(hasTarget({ node: A.node }), true, "a node target");
      eq(hasTarget({ edge }), true, "an edge target");
      eq(hasTarget({ edge: A.node }), false, "a node address under edge");
      eq(hasTarget({ node: edge }), false, "an edge address under node");
    },
  },
  {
    id: "ext:M1-lone-surrogate", what: "a lone surrogate in a machine address is INVALID_MACHINE/SCHEMA, never an IgsError (5.1)",
    run({ impl, model, state }) {
      const bad = pressMachine({ target: { id: "s:\ud800", type: "p" } });
      throws(() => impl.serializeMachine(bad), "INVALID_MACHINE/SCHEMA", "serializeMachine of a pointer target");
      throws(() => impl.step(bad, { type: "tick", t: 1 }, model, state), "INVALID_MACHINE/SCHEMA", "step with such a machine");
      throws(() => impl.serializeMachine({ gesture: "idle", last_t: 0, mode: "marquee", anchor: { id: "s:a", type: "p\udc00" }, pointers: [], rem_x: 0, rem_y: 0, wheel_acc: 0 }), "INVALID_MACHINE/SCHEMA", "serializeMachine of an anchor");
      throws(() => impl.serializeMachine(pressMachine({ target: { ord: "0", rel: "r\ud800", src: { id: "s:a", type: "p" }, tgt: { id: "s:b", type: "p" } } })), "INVALID_MACHINE/SCHEMA", "an edge target");
      const bytes = new TextEncoder().encode(JSON.stringify(pressMachine({ target: { id: "s:x", type: "p" } })).replace("s:x", "s:\\ud800"));
      throws(() => impl.parseMachine(bytes), "INVALID_MACHINE/SCHEMA", "parseMachine of an escaped lone surrogate");
    },
  },
  {
    id: "ext:M3-commit-outside-marquee", what: "marquee-commit bound outside marquee mode gives nav-none ANCHOR_GONE (the oracle's reading, ruling on F-8)",
    run({ impl, model, state }) {
      const config = { bindings: [{ mode: "normal", key: "x", mods: 0, action: { type: "marquee-commit" } }] };
      const r = impl.step(impl.createMachine(), key(0, "x"), model, state, config);
      eq([r.handled, r.outputs], [true, [{ kind: "nav", event: { type: "nav-none", reason: "ANCHOR_GONE" } }]], "marquee-commit in normal mode");
      eq((JSON.parse(text(impl.serializeMachine(r.machine))) as Json)["mode"], "normal", "mode after");
    },
  },
  {
    id: "ext:M4-binding-domains", what: "verifyBindings keeps the reducer's domains for pan and zoom (5.6 I1; an addition to 6.4)",
    run({ impl }) {
      const row = (action: unknown): unknown[] => [{ mode: "normal", key: "0", mods: 0, action }];
      const v = (a: unknown): void => { impl.verifyBindings(row(a)); };
      v({ type: "pan", dx: 2 ** 31, dy: -(2 ** 31) });
      v({ type: "zoom", factor: 1 });
      v({ type: "zoom", factor: 1_000_000 });
      throws(() => v({ type: "pan", dx: 2 ** 31 + 1, dy: 0 }), "INVALID_BINDINGS/INVALID_VALUE", "pan dx 2^31 + 1");
      throws(() => v({ type: "pan", dx: 0, dy: -(2 ** 31) - 1 }), "INVALID_BINDINGS/INVALID_VALUE", "pan dy -2^31 - 1");
      throws(() => v({ type: "zoom", factor: 0 }), "INVALID_BINDINGS/INVALID_VALUE", "zoom 0");
      throws(() => v({ type: "zoom", factor: 1_000_001 }), "INVALID_BINDINGS/INVALID_VALUE", "zoom 1,000,001");
    },
  },
  {
    id: "ext:M5-machine-ranges", what: "readMachine range-checks the pointer coordinates, times, ids, pinch members, remainders and mods0 (5.1)",
    run({ impl }) {
      const ser = (m: unknown): void => { impl.serializeMachine(m); };
      const bad = (m: unknown, what: string): void => throws(() => ser(m), "INVALID_MACHINE/SCHEMA", what);
      const E39 = 2 ** 39;
      ser(pressMachine({ x: E39, x0: -E39, y: E39, y0: -E39, t0: 2 ** 52, id: 2 ** 31 - 1 }));
      for (const f of ["x", "x0", "y", "y0"]) { bad(pressMachine({ [f]: E39 + 1 }), `${f} above 2^39`); bad(pressMachine({ [f]: -E39 - 1 }), `${f} below -2^39`); }
      bad(pressMachine({ t0: -1 }), "t0 -1");
      bad(pressMachine({ t0: 2 ** 52 + 1 }), "t0 above 2^52");
      bad(pressMachine({ id: -5 }), "a negative first pointer id");
      bad(pressMachine({ id: 2 ** 31 }), "an id above 2^31 - 1");
      bad(pressMachine({ mods0: 16 }), "mods0 16");
      bad(pressMachine({ mods0: -1 }), "mods0 -1");
      ser(panMachine({ rem_x: 499, rem_y: -500 }));
      bad(panMachine({ rem_x: 500 }), "rem_x 500");
      bad(panMachine({ rem_y: -501 }), "rem_y -501");
      const two = (pinch: unknown): Json => ({
        gesture: "pinch", last_t: 0, mode: "normal", rem_x: 0, rem_y: 0, wheel_acc: 0, pinch,
        pointers: [1, 2].map((id) => ({ button: 0, id, lasso: false, long: false, mods0: 0, moved: true, ptype: "touch", t0: 0, x: 0, x0: 0, y: 0, y0: 0 })),
      });
      ser(two({ d: 2 ** 41, mx: E39, my: -E39 }));
      bad(two({ d: -1, mx: 0, my: 0 }), "pinch d -1");
      bad(two({ d: 2 ** 41 + 1, mx: 0, my: 0 }), "pinch d above 2^41");
      bad(two({ d: 1, mx: E39 + 1, my: 0 }), "pinch mx above 2^39");
      bad(two({ d: 1, mx: 0, my: -E39 - 1 }), "pinch my below -2^39");
    },
  },
  {
    id: "ext:M10-rounding", what: "the pixel position of a context action and of a long press is divRound of the milli-pixels (5.3, 5.4)",
    run({ impl, model, state }) {
      const cm = impl.step(impl.createMachine(), { type: "contextmenu", t: 0, x: 1500, y: -500, mods: 0 }, model, state);
      eq(cm.outputs, [{ kind: "context-action", source: "pointer", x: 2, y: 0 }], "contextmenu at (1500, -500)");
      const m = impl.step(impl.createMachine(), down(0, 1, 2500, -1500), model, state).machine;
      const lp = impl.step(m, { type: "tick", t: 500 }, model, state);
      eq(lp.outputs, [{ kind: "context-action", source: "long-press", x: 3, y: -1 }], "long press at (2500, -1500)");
    },
  },
  {
    id: "ext:M10-marquee-orientation", what: "the marquee rectangle is normalized whatever the position of the focused node relative to the anchor (8.2)",
    run({ impl, model, state }) {
      const at = (n: string): SemanticState => reduce(model, state, { type: "focus", target: { node: { id: n, type: "p" } } }).state;
      for (const [anchor, other] of [["s:e", "s:a"], ["s:d", "s:b"], ["s:b", "s:d"], ["s:a", "s:e"]] as const) {
        const m = impl.step(impl.createMachine(), key(0, "m"), model, at(anchor)).machine;
        const r = impl.step(m, key(1, "Enter"), model, at(other));
        const intent = (r.outputs[0] as { intent?: { type: string; mode: string; targets: unknown[] } }).intent;
        eq([intent?.type, intent?.mode], ["select", "replace"], `${anchor} to ${other}`);
        eq(intent!.targets.length, 8, `${anchor} to ${other}: the elements between the two centres`);
      }
    },
  },
  {
    id: "ext:M10-reveal-boundary", what: "the margin box is closed, the left and top pans are ceil(), and the 2^31 omission is exclusive at 2^31 (7.5)",
    run({ impl, model, state }) {
      const a = { node: model.nodes[0]!.ref };
      const pan = (v: Partial<SemanticState["viewport"]>): unknown => impl.revealPan(model, withViewport(state, v), a);
      eq(pan({ zoom: 1000, center_x: -426000, center_y: 0 }), undefined, "X exactly on the high edge of the box");
      eq(pan({ zoom: 1000, center_x: -426001, center_y: 0 }), { type: "pan", dx: -1, dy: 0 }, "X one milli-pixel beyond the high edge");
      eq(pan({ zoom: 10, center_x: 42600001, center_y: 0 }), { type: "pan", dx: 1, dy: 0 }, "X a hair inside the low edge: ceil, not truncation");
      eq(pan({ zoom: 10, center_x: 0, center_y: 27600001 }), { type: "pan", dx: 0, dy: 1 }, "Y a hair above the low edge");
      const far = -2147484074000; // X - (w - m) = 2^31 * 10^6 micro-pixels at zoom 1000
      eq(pan({ zoom: 1000, center_x: far, center_y: 0 }), { type: "pan", dx: -2147483648, dy: 0 }, "|dx| = 2^31 is kept");
      eq(pan({ zoom: 1000, center_x: far - 1000, center_y: 0 }), undefined, "|dx| = 2^31 + 1 is omitted");
    },
  },
  {
    id: "ext:M10-endpoint-nofocus", what: "with no focus s and t give focus-first (5.6)",
    run({ impl, model, state }) {
      for (const k of ["s", "t"]) eq(impl.step(impl.createMachine(), key(0, k), model, state).outputs, [{ kind: "intent", intent: { type: "focus-first" } }], `key ${k} with no focus`);
    },
  },
  {
    id: "ext:M10-home-focused", what: "Home at the already focused, off-screen first element appends no reveal pan (5.6)",
    run({ impl, model, state }) {
      const s = reduce(model, withViewport(state, { zoom: 1000, center_x: -500000, center_y: 0 }), { type: "focus", target: { node: model.nodes[0]!.ref } }).state;
      eq(impl.step(impl.createMachine(), key(0, "Home"), model, s).outputs, [{ kind: "intent", intent: { type: "focus-first" } }], "Home at the focused first node");
    },
  },
  {
    id: "ext:M10-escape-mods", what: "a host mode needs an Escape row with mods 0 (6.4 step 3)",
    run({ impl }) {
      const t = [{ mode: "x-m", key: "a", mods: 0, action: { type: "fit" } }, { mode: "x-m", key: "Escape", mods: 1, action: { type: "clear-selection" } }];
      throws(() => impl.verifyBindings(t), "INVALID_BINDINGS/NO_ESCAPE_EXIT", "Escape with shift only");
    },
  },
  {
    id: "ext:M10-lasso-hidden-edge", what: "a hidden edge between two inside nodes is not selected by the lasso (8.1)",
    run({ impl, model, state }) {
      const rect = { x0: 150000, y0: 0, x1: 500000, y1: 350000 };
      const hid = reduce(model, state, { type: "set-hidden", targets: [{ edge: model.edges[0]!.ref }], hidden: true }).state;
      const all = impl.lassoTargets(model, state, rect) as unknown[];
      const some = impl.lassoTargets(model, hid, rect) as unknown[];
      eq([all.length, some.length], [8, 7], "counts with and without the hidden edge");
      eq(some.some((x) => JSON.stringify(x) === JSON.stringify({ edge: model.edges[0]!.ref })), false, "the hidden edge is absent");
    },
  },
  {
    id: "ext:M10-pinch", what: "the pinch factor is clamped to 1..1,000,000, a zero reference distance is set without a zoom, the midpoint is a floor (5.3)",
    run({ impl, model, state }) {
      const run = (a: [number, number], b: [number, number], to: [number, number]): { outputs: Json[]; machine: Json } => {
        let m = impl.step(impl.createMachine(), down(0, 1, a[0], a[1]), model, state).machine;
        m = impl.step(m, down(1, 2, b[0], b[1]), model, state).machine;
        const r = impl.step(m, { type: "pointermove", t: 2, id: 2, x: to[0], y: to[1], mods: 0 }, model, state);
        return { outputs: r.outputs as Json[], machine: JSON.parse(text(impl.serializeMachine(r.machine))) as Json };
      };
      const zoom = (o: Json[]): unknown => (o[o.length - 1]!["intent"] as Json)["factor_milli"];
      eq(zoom(run([0, 0], [1, 0], [2_000_000, 0]).outputs), 1_000_000, "upper clamp");
      eq(zoom(run([0, 0], [1_000_000, 0], [1, 0]).outputs), 1, "lower clamp");
      const z = run([0, 0], [0, 0], [5000, 0]);
      eq([z.outputs.length, (z.outputs[0]!["intent"] as Json)["type"]], [1, "pan"], "d = 0: a pan and no zoom");
      eq((z.machine["pinch"] as Json)["d"], 5000, "d = 0: the reference distance is set");
      const n = JSON.parse(text(impl.serializeMachine(impl.step(impl.step(impl.createMachine(), down(0, 1, -1, 0), model, state).machine, down(1, 2, -2, 0), model, state).machine))) as Json;
      eq((n["pinch"] as Json)["mx"], -2, "the midpoint of -1 and -2 is floor(-3 / 2)");
    },
  },
];

/** Every ext row, result by result (the mutation harness reads these). */
export async function runExt(impl: Impl, c: Corpus): Promise<RowResult[]> {
  const model = await modelOf(c, "scenes/G9.scene.json", "layouts/G9.layout.json");
  const state = initialState(model, SIZE);
  const out: RowResult[] = [];
  for (const row of EXT) {
    try { row.run({ impl: impl as Imp, model, state }); out.push({ id: row.id, ok: true }); } catch (e) { out.push({ id: row.id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}
