// src/dom/index.ts - a11y-companion "./dom" (DOM lib): `mountCompanion`, the one place where the companion touches a real DOM (design 9.6). Smoke only: its
// behaviour in a browser is checked by the browser smoke of export-core, no accessibility claim. It builds DOM only through the structural DomLike operations
// of the executor (createElement("div"), setAttribute, textContent, insertBefore, removeChild); it adds no listener.
// Recovery (audit I-2): a tree or plan refused BEFORE any DOM call keeps the previous DOM (stale but consistent). If the real DOM throws while a plan runs (the
// page moved or removed one of our elements, an extension, a translation tool), the half-applied DOM is discarded: the root is removed (guarded) and the NEXT
// tree is built in full, so the companion never stays half-applied and the next update starts from a known state. The failure is reported through onError.
import type { ElementAddress, RenderModel, SemanticEvent, SemanticState } from "isongraph-visualize-renderer-core";
import type { NavEvent } from "isongraph-visualize-interaction-core";
import { buildCompanionTree, executePlan, planCompanionUpdate } from "../index.js";
import type { CompanionTree, DomLike, DomOp, ElementLike, ExecutorState, Mode } from "../index.js";

export interface MountOptions { idPrefix?: string; onError?: (e: unknown) => void }
export interface MountedCompanion {
  update(model: RenderModel, state: SemanticState, events?: readonly (SemanticEvent | NavEvent)[], mode?: Mode): void;
  itemAddress(el: Element): ElementAddress | undefined;
  dispose(): void;
}

/** An owned deep copy of an element address (plain data: two levels of small objects). */
const copyAddress = (a: ElementAddress): ElementAddress => JSON.parse(JSON.stringify(a)) as ElementAddress;

/** Mounts the companion as ONE child element of `host` (a Canvas/WebGL host's own container; never shared with another adapter). */
export function mountCompanion(host: Element, options?: MountOptions): MountedCompanion {
  const doc = host.ownerDocument;
  const dom: DomLike = { createElement: (tag) => doc.createElement(tag) as unknown as ElementLike };
  const hostLike = host as unknown as ElementLike;
  const prefix = options?.idPrefix;
  const onError = options?.onError;
  let prev: CompanionTree | undefined;
  let state: ExecutorState | undefined;
  let addresses = new Map<string, ElementAddress>();
  let disposed = false;
  const fail = (e: unknown): void => { try { onError?.(e); } catch { /* a throwing error handler must not break the page */ } };
  const rootOf = (): Element | undefined => (prev === undefined || state === undefined ? undefined : (state.elements.get(`${prev.id_prefix}-root`) as unknown as Element | undefined));
  /** Removes our root from wherever it is (guarded: the page may have moved or removed it) and forgets every handle. */
  const discard = (): void => {
    const root = rootOf();
    try { if (root !== undefined && root.parentNode !== null) root.parentNode.removeChild(root); } catch { /* already gone */ }
    prev = undefined; state = undefined; addresses = new Map();
  };
  const apply = (next: CompanionTree, ops: DomOp[]): void => {
    state = executePlan(dom, hostLike, ops, state);
    prev = next;
    addresses = new Map(next.items.map((i) => [i.id, i.address]));
  };

  return {
    update(model, state_, events, mode) {
      if (disposed) return;
      let next: CompanionTree, ops: DomOp[], inside: boolean;
      try {
        // the page may have removed our root from under us: then the DOM we hold no longer matches, rebuild in full
        const r0 = rootOf();
        if (r0 !== undefined && r0.parentNode !== host) discard();
        const root = rootOf();
        const active = doc.activeElement;
        inside = root !== undefined && active !== null && root.contains(active);
        next = buildCompanionTree(model, state_, {
          ...(prefix === undefined ? {} : { idPrefix: prefix }), ...(events === undefined ? {} : { events }), ...(mode === undefined ? {} : { mode }), omitFocusAnnouncement: inside,
        });
        ops = planCompanionUpdate(prev, next);
      } catch (e) { fail(e); return; } // a refused tree or plan: nothing was touched, the previous DOM stays (stale but consistent)
      try {
        apply(next, ops);
      } catch (e) {
        fail(e); // the DOM threw in the middle of the plan: discard the half-applied DOM and build the next tree in full
        discard();
        try { apply(next, planCompanionUpdate(undefined, next)); } catch (e2) { fail(e2); discard(); return; }
      }
      try {
        if (inside) {
          const stop = next.items.find((i) => i.tabindex === 0);
          const el = stop === undefined ? undefined : (state?.elements.get(stop.id) as unknown as HTMLElement | undefined);
          if (el !== undefined) el.focus({ preventScroll: true }); // DOM focus follows semantic focus
        }
      } catch (e) { fail(e); }
    },
    itemAddress(el) { const a = addresses.get(el.id); return a === undefined ? undefined : copyAddress(a); },
    dispose() {
      if (disposed) return;
      disposed = true;
      discard();
    },
  };
}
