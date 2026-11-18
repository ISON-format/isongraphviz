// src/executor.ts - the executor of a plan (design 9.6) over a STRUCTURAL DOM (createElement("div"), setAttribute, a textContent setter, insertBefore,
// removeChild: nothing else), the recording DOM that logs every call, and COMPANION_CSS. This is the only code of the package that touches a DOM; no
// innerHTML-family API, no style, no markup is reachable: a graph string is only ever an attribute value from a fixed allowlist or a textContent.
import { IaError } from "isongraph-visualize-interaction-core";
import { ATTRIBUTE_ALLOWLIST } from "./plan.js";
import type { DomLike, DomOp, ElementLike, ExecutorState } from "./types.js";
import { canon } from "./util.js";

export const HOST_KEY = "@host";

/** The one constant stylesheet the host adds to its page: the companion is visually hidden (design 9.6). */
export const COMPANION_CSS =
  ".igr-companion-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}";

const allowed = new Set<string>(ATTRIBUTE_ALLOWLIST);
const bad = (reason: "SCHEMA" | "UNKNOWN_KEY", path: string, detail?: string): IaError => new IaError("INVALID_PLAN", reason, path, detail);

/** A validated op: the closed shape of design 9.5 (arrays of strings, `c` only creates a `div`). */
function readOp(raw: unknown, i: number): readonly string[] {
  const p = `ops[${i}]`;
  if (!Array.isArray(raw)) throw bad("SCHEMA", p, "an array expected");
  const op: unknown[] = [];
  for (let x = 0; x < raw.length; x++) {
    const d = Object.getOwnPropertyDescriptor(raw, String(x));
    if (d === undefined || d.get !== undefined || d.set !== undefined || typeof d.value !== "string") throw bad("SCHEMA", `${p}[${x}]`, "a string expected");
    op.push(d.value);
  }
  const want: Record<string, number> = { c: 3, a: 4, t: 3, p: 4, r: 2 };
  const kind = op[0] as string | undefined;
  const len = kind === undefined || !Object.hasOwn(want, kind) ? undefined : want[kind];
  if (len === undefined || op.length !== len) throw bad("SCHEMA", p, "unknown op or wrong length");
  if (kind === "c" && op[2] !== "div") throw bad("SCHEMA", `${p}[2]`, "only the tag div is allowed");
  return op as string[];
}

/**
 * Executes the ops of a plan on `dom`/`host` with the bookkeeping `state` (`"@host"` -> `host`; `elements`, `parent`). The whole plan is checked first on the
 * bookkeeping alone (so a refused plan leaves the DOM untouched), then executed. Returns the new state; the argument is not mutated.
 * Guards (INVALID_PLAN): an unknown key `UNKNOWN_KEY`; a `c` of a live key, a `c`, `a`, `t` or `r` of "@host", an attribute outside the allowlist `SCHEMA`.
 */
export function executePlan(dom: DomLike, host: ElementLike, ops: readonly DomOp[], state?: ExecutorState): ExecutorState {
  const list = Array.isArray(ops) ? (ops as readonly unknown[]).map((o, i) => readOp(o, i)) : (() => { throw bad("SCHEMA", "ops", "an array expected"); })();
  const elements = new Map<string, ElementLike>(state === undefined ? [[HOST_KEY, host]] : state.elements);
  const parent = new Map<string, string>(state === undefined ? [] : state.parent);
  if (!elements.has(HOST_KEY)) elements.set(HOST_KEY, host);
  const live = (k: string, p: string): ElementLike => { const e = elements.get(k); if (e === undefined) throw bad("UNKNOWN_KEY", p, "no element with this key"); return e; };
  const nonHost = (k: string, p: string): void => { if (k === HOST_KEY) throw bad("SCHEMA", p, "the host key is reserved"); if (k === "") throw bad("SCHEMA", p, "an element key is never empty"); };
  /** The bookkeeping alone: live keys, parent links and a child index (so a removal costs the size of the removed subtree, not of the whole map). */
  class Book {
    readonly el: Set<string>;
    readonly par: Map<string, string>;
    readonly kids = new Map<string, Set<string>>();
    constructor(keys: Iterable<string>, par: Map<string, string>) {
      this.el = new Set(keys); this.par = new Map(par);
      for (const [c, p] of par) this.kidsOf(p).add(c);
    }
    kidsOf(p: string): Set<string> { let k = this.kids.get(p); if (k === undefined) { k = new Set(); this.kids.set(p, k); } return k; }
    attach(child: string, p: string): void { const old = this.par.get(child); if (old !== undefined) this.kidsOf(old).delete(child); this.par.set(child, p); this.kidsOf(p).add(child); }
    /** The removed key and every descendant, forgotten. */
    forget(k: string): string[] {
      const gone = [k];
      for (let x = 0; x < gone.length; x++) { const kids = this.kids.get(gone[x]!); if (kids !== undefined) for (const c of kids) gone.push(c); }
      const old = this.par.get(k);
      if (old !== undefined) this.kidsOf(old).delete(k);
      for (const g of gone) { this.el.delete(g); this.par.delete(g); this.kids.delete(g); }
      return gone;
    }
    /** Is `anc` an ancestor of (or equal to) `k`? Walks up the parent links. */
    under(k: string, anc: string): boolean { for (let cur: string | undefined = k, n = 0; cur !== undefined && n < 100_000; cur = this.par.get(cur), n++) if (cur === anc) return true; return false; }
  }
  // pass 1: the bookkeeping alone, on copies (the keys a plan creates exist as placeholders)
  const dry = new Book(elements.keys(), parent);
  list.forEach((op, i) => {
    const p = `ops[${i}]`;
    switch (op[0]) {
      case "c": nonHost(op[1]!, `${p}[1]`); if (dry.el.has(op[1]!)) throw bad("SCHEMA", `${p}[1]`, "the key is live"); dry.el.add(op[1]!); break;
      case "a": nonHost(op[1]!, `${p}[1]`); if (!dry.el.has(op[1]!)) throw bad("UNKNOWN_KEY", `${p}[1]`); if (!allowed.has(op[2]!)) throw bad("SCHEMA", `${p}[2]`, "attribute outside the allowlist"); break;
      case "t": nonHost(op[1]!, `${p}[1]`); if (!dry.el.has(op[1]!)) throw bad("UNKNOWN_KEY", `${p}[1]`); break;
      case "p":
        if (!dry.el.has(op[1]!)) throw bad("UNKNOWN_KEY", `${p}[1]`);
        nonHost(op[2]!, `${p}[2]`); if (!dry.el.has(op[2]!)) throw bad("UNKNOWN_KEY", `${p}[2]`);
        if (op[3] !== "") { if (!dry.el.has(op[3]!)) throw bad("UNKNOWN_KEY", `${p}[3]`); if (dry.par.get(op[3]!) !== op[1]) throw bad("SCHEMA", `${p}[3]`, "before is not a child of the parent"); }
        if (dry.under(op[1]!, op[2]!)) throw bad("SCHEMA", `${p}[2]`, "an element cannot be inserted into itself or into its own descendant");
        dry.attach(op[2]!, op[1]!);
        break;
      case "r":
        nonHost(op[1]!, `${p}[1]`); if (!dry.el.has(op[1]!)) throw bad("UNKNOWN_KEY", `${p}[1]`);
        if (!dry.par.has(op[1]!)) throw bad("SCHEMA", `${p}[1]`, "the element has no recorded parent");
        dry.forget(op[1]!);
        break;
    }
  });
  // pass 2: the real calls, with the same bookkeeping
  const real = new Book(elements.keys(), parent);
  for (const op of list) {
    switch (op[0]) {
      case "c": { const el = dom.createElement("div"); el.setAttribute("id", op[1]!); elements.set(op[1]!, el); real.el.add(op[1]!); break; }
      case "a": live(op[1]!, "a").setAttribute(op[2]!, op[3]!); break;
      case "t": live(op[1]!, "t").textContent = op[2]!; break;
      case "p": {
        const par = live(op[1]!, "p"), child = live(op[2]!, "p");
        par.insertBefore(child, op[3] === "" ? null : live(op[3]!, "p"));
        real.attach(op[2]!, op[1]!);
        parent.set(op[2]!, op[1]!);
        break;
      }
      case "r": {
        const k = op[1]!;
        const par = live(parent.get(k)!, "r"), child = live(k, "r");
        par.removeChild(child);
        for (const g of real.forget(k)) { elements.delete(g); parent.delete(g); }
        break;
      }
    }
  }
  return { elements, parent };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the recording DOM (9.6): every call is one canonical text per line, an LF after every line, no null
// ---------------------------------------------------------------------------------------------------------------------------------------------
class RecElement implements ElementLike {
  id: string;
  constructor(private readonly rows: string[][], id: string) { this.id = id; }
  setAttribute(name: string, value: string): void {
    if (name === "id") this.id = value; // the new value for the id assignment itself
    this.rows.push(["setAttribute", this.id, name, value]);
  }
  set textContent(text: string | null) { this.rows.push(["textContent", this.id, text ?? ""]); }
  get textContent(): string | null { return null; }
  insertBefore(child: ElementLike, before: ElementLike | null): void {
    this.rows.push(["insertBefore", this.id, (child as RecElement).id, before === null ? "" : (before as RecElement).id]);
  }
  removeChild(child: ElementLike): void { this.rows.push(["removeChild", this.id, (child as RecElement).id]); }
}

/** A DomLike that logs every call (design 9.6). `log()` is the canonical text so far; the host element has the id "@host". */
export function createRecordingDom(): { dom: DomLike; host: ElementLike; log(): Uint8Array } {
  const rows: string[][] = [];
  const dom: DomLike = {
    createElement(tag: "div"): ElementLike {
      rows.push(["createElement", tag]);
      return new RecElement(rows, "");
    },
  };
  const host = new RecElement(rows, HOST_KEY);
  return { dom, host, log: () => encodeLog(rows) };
}

/** One canonical text per line (strings by IGS/1 5.4), one LF after every line, no null. */
function encodeLog(rows: readonly (readonly string[])[]): Uint8Array {
  const parts = rows.map((r) => canon(r));
  let n = 0;
  for (const p of parts) n += p.length + 1;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; out[at++] = 0x0a; }
  return out;
}
