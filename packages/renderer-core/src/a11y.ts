// src/a11y.ts - accessibility DATA MODEL as pure functions (design section 10; versions igr-a11y/1, igr-summary/1, igr-announce/1).
// Texts are verbatim scene strings: no normalization, escaping, trimming or truncation. Companion DOM, ARIA and key bindings are V5/V11.
import { IgrError } from "./errors.js";
import { edgeElement, nodeElement, readElementAddress } from "./elements.js";
import { assertModel, lookupElement, resolveElement } from "./model.js";
import { checkState, traversalOfCore, visibilityOf, type StateCore } from "./state.js";
import type { AccessibleItem, AccessibleModel, ElementAddress, GraphSummary, ModelEdge, ModelNode, RenderModel, SemanticEvent, SemanticState } from "./types.js";

const MAX_LISTED_CATEGORIES = 8;

function elementOf(model: RenderModel, address: ElementAddress): ModelNode | ModelEdge {
  assertModel(model);
  const a = readElementAddress(address);
  if (!a) throw new IgrError("INVALID_INPUT", "SCHEMA", "address", "ElementAddress expected");
  const e = resolveElement(model, a);
  if (!e) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", "address", "names no element of this model");
  return e;
}

const nameOf = (e: ModelNode | ModelEdge): string => ("category" in e ? `${e.category} ${e.label}` : e.label);
const descriptionOf = (model: RenderModel, e: ModelNode | ModelEdge): string | undefined =>
  "category" in e ? undefined : `${model.nodes[e.src]!.label} ${e.ref.rel} ${model.nodes[e.tgt]!.label}`;

/** Node: `{category} {label}`; edge: `{label}` (the relation; IGR-level gap-fill D7). */
export const accessibleName = (model: RenderModel, address: ElementAddress): string => nameOf(elementOf(model, address));
/** Edge: `{src label} {rel} {tgt label}` in stored endpoint order; a node has none. */
export const accessibleDescription = (model: RenderModel, address: ElementAddress): string | undefined => descriptionOf(model, elementOf(model, address));

export function graphSummary(model: RenderModel): GraphSummary {
  assertModel(model);
  const counts = new Map<string, number>();
  for (const n of model.nodes) counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
  return { directed: model.directed, nodes: model.nodes.length, edges: model.edges.length, categories: model.categories.map((category) => ({ category, count: counts.get(category)! })) };
}

/** The normative `igr-summary/1` format (English). */
export function summaryText(s: GraphSummary): string {
  const noun = (n: number, one: string, many: string): string => (n === 1 ? one : many);
  let text = `${s.directed ? "Directed" : "Undirected"} graph with ${s.nodes} ${noun(s.nodes, "node", "nodes")} and ${s.edges} ${noun(s.edges, "edge", "edges")}.`;
  if (s.nodes > 0) {
    const items = s.categories.slice(0, MAX_LISTED_CATEGORIES).map((c) => `${c.category} (${c.count})`);
    let list = items.join(", ");
    if (s.categories.length > MAX_LISTED_CATEGORIES) list += `, and ${s.categories.length - MAX_LISTED_CATEGORIES} more`;
    text += ` Node categories: ${list}.`;
  }
  return text;
}

function counts(model: RenderModel, core: StateCore): { selected: number; hidden: number } {
  const vis = visibilityOf(model, core.hiddenNodes, core.hiddenEdges);
  return { selected: core.selNodes.length + core.selEdges.length, hidden: vis.nodes.filter((v) => !v).length + vis.edges.filter((v) => !v).length };
}
const focusText = (model: RenderModel, core: StateCore): string | undefined =>
  core.focus === undefined ? undefined : core.focus.edge ? descriptionOf(model, model.edges[core.focus.index]!) : nameOf(model.nodes[core.focus.index]!);

/** `{s} selected, {h} hidden.` (h = effectively hidden elements) plus ` Focus: {t}.` when focused. */
export function statusText(model: RenderModel, state: SemanticState): string {
  assertModel(model);
  const core = checkState(model, state, "strict");
  const c = counts(model, core);
  const f = focusText(model, core);
  return `${c.selected} selected, ${c.hidden} hidden.` + (f === undefined ? "" : ` Focus: ${f}.`);
}

/** `igr-announce/1`; `state` is the post-commit state. viewport-changed has none. Never length-capped here. */
export function announcementFor(event: SemanticEvent, model: RenderModel, state: SemanticState): string | undefined {
  assertModel(model);
  const ev: unknown = event;
  if (typeof ev !== "object" || ev === null) throw new IgrError("INVALID_INPUT", "SCHEMA", "event", "object expected");
  const type: unknown = (ev as { type?: unknown }).type;
  if (type !== "selection-changed" && type !== "visibility-changed" && type !== "traversal-boundary" && type !== "viewport-changed" && type !== "focus-changed") throw new IgrError("INVALID_INPUT", "SCHEMA", "event.type", "unknown event type");
  if (type === "traversal-boundary" && (ev as { end?: unknown }).end !== "start" && (ev as { end?: unknown }).end !== "end") throw new IgrError("INVALID_INPUT", "SCHEMA", "event.end");
  if (type === "focus-changed") { const f = (ev as { focus?: unknown }).focus; if (f !== undefined && (typeof f !== "object" || f === null || typeof (f as { address?: unknown }).address !== "object" || (f as { address?: unknown }).address === null)) throw new IgrError("INVALID_INPUT", "SCHEMA", "event.focus"); }
  const core = checkState(model, state, "strict");
  switch (event.type) {
    case "selection-changed": return `${counts(model, core).selected} selected.`;
    case "visibility-changed": return `${counts(model, core).hidden} hidden.`;
    case "traversal-boundary": return event.end === "end" ? "End of graph." : "Start of graph.";
    case "viewport-changed": return undefined;
    case "focus-changed": {
      if (event.focus === undefined) return "Focus cleared.";
      const e = lookupElement(model, event.focus.address);
      if (!e) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", "event.focus", "names no element of this model");
      return "category" in e ? nameOf(e) : descriptionOf(model, e);
    }
  }
}

export function buildAccessibleModel(model: RenderModel, state: SemanticState): AccessibleModel {
  assertModel(model);
  const core = checkState(model, state, "strict");
  const order = traversalOfCore(model, core);
  const sel = { n: new Set(core.selNodes), e: new Set(core.selEdges) };
  const items: AccessibleItem[] = order.map((address, k) => {
    const isEdge = "edge" in address;
    const el = resolveElement(model, address)!;
    const item: AccessibleItem = {
      role: isEdge ? "edge" : "node", address: isEdge ? edgeElement(address.edge) : nodeElement(address.node), name: nameOf(el),
      selected: isEdge ? sel.e.has(el.index) : sel.n.has(el.index),
      focused: core.focus !== undefined && core.focus.edge === isEdge && core.focus.index === el.index, position: k + 1, set_size: order.length,
    };
    const d = descriptionOf(model, el);
    if (d !== undefined) item.description = d;
    return item;
  });
  return { summary: summaryText(graphSummary(model)), status: statusText(model, state), items };
}
