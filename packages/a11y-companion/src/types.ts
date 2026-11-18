// src/types.ts - the types of a11y-companion (design 2, 9.2, 9.5, 10). Types only; nothing here is a runtime value.
import type { NavEvent } from "isongraph-visualize-interaction-core";
import type { ElementAddress, SemanticEvent } from "isongraph-visualize-renderer-core";

export type { NavEvent };
export type LiveEvent = SemanticEvent | NavEvent;
export type WindowOption = "auto" | "all" | { first: number; count: number };
export type Mode = "normal" | "marquee";

export interface CompanionOptions {
  idPrefix?: string;
  window?: WindowOption;
  events?: readonly LiveEvent[];
  mode?: Mode;
  omitFocusAnnouncement?: boolean;
  maxTreeBytes?: number;
}

export interface CompanionItem {
  address: ElementAddress;
  description?: string;
  focused: boolean;
  id: string;
  kind: "node" | "edge";
  name: string;
  position: number;
  roledescription: "node" | "edge";
  selected: boolean;
  set_size: number;
  tabindex: 0 | -1;
}

export interface CompanionTree {
  companion: "igr-companion/1";
  container: { description: string; name: string; role: "application" };
  id_prefix: string;
  items: CompanionItem[];
  layout_sha256: string;
  list: { multiselectable: true; role: "listbox"; set_size: number; window: { count: number; first: number } };
  live: { atomic: true; politeness: "polite"; role: "status"; text: string };
  mode: Mode;
  scene_sha256: string;
}

/** One DOM operation of a plan: a JSON array of strings (design 9.5). */
export type DomOp = readonly ["c", string, "div"] | readonly ["a", string, string, string] | readonly ["t", string, string] | readonly ["p", string, string, string] | readonly ["r", string];

/** The structural DOM the executor needs (design 9.6): the listed members only. */
export interface ElementLike {
  setAttribute(name: string, value: string): void;
  textContent: string | null;
  insertBefore(child: ElementLike, before: ElementLike | null): unknown;
  removeChild(child: ElementLike): unknown;
}
export interface DomLike { createElement(tag: "div"): ElementLike }
export interface ExecutorState { elements: Map<string, ElementLike>; parent: Map<string, string> }
