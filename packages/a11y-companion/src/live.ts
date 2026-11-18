// src/live.ts - the live text (design 9.4): the announcements of a step's events, coalesced and bounded. Sources are those of the committed
// `announcementFor` (27 10.2): counts from the STATE argument, the focused text from the event's focus address; the nav events have standard English texts.
import { announcementFor, type RenderModel, type SemanticEvent, type SemanticState } from "isongraph-visualize-renderer-core";
import { IaError } from "isongraph-visualize-interaction-core";
import type { LiveEvent } from "./types.js";
import { copyPlain, plainArray, plainEntries } from "./util.js";

export const LIVE_MAX_UNITS = 400;

const SPATIAL = new Set(["left", "right", "up", "down"]);

/** A minimal owned snapshot of an event: only the fields the texts read (a selection list of 60,000 refs is not copied). Throws IaError on a bad shape. */
function snapshot(e: unknown, code: "INVALID_CONFIG" | "INVALID_INPUT", path: string): { type: string; [k: string]: unknown } {
  const bad = (d: string): IaError => new IaError(code, "SCHEMA", path, d);
  const m = plainEntries(e);
  if (m === undefined) throw bad("an event is a plain object");
  const type = m.get("type");
  if (typeof type !== "string") throw bad("event.type must be a string");
  const out: { type: string; [k: string]: unknown } = { type };
  const want = (k: string): unknown => m.get(k);
  switch (type) {
    case "traversal-boundary": out["end"] = want("end"); break;
    case "focus-changed": {
      const f = want("focus");
      if (f !== undefined) {
        const fm = plainEntries(f);
        const a = fm === undefined ? undefined : copyPlain(fm.get("address"), 6);
        if (fm === undefined || a === undefined) throw bad("event.focus must be an ObjectRef");
        out["focus"] = { address: a, artifact_sha256: fm.get("artifact_sha256") };
      }
      break;
    }
    case "nav-none": out["reason"] = want("reason"); break;
    case "nav-boundary": out["nav"] = want("nav"); out["dir"] = want("dir"); out["delta"] = want("delta"); break;
    case "nav-wrapped": out["end"] = want("end"); break;
    case "lasso-too-large": case "select-all-too-large": {
      const n = want("count");
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new IaError(code, "INVALID_VALUE", `${path}.count`, "a non-negative integer expected"); // no floating-point text (law 2)
      out["count"] = n;
      break;
    }
    default: break; // selection-changed, visibility-changed, viewport-changed, marquee-started, marquee-cancelled and unknown types: the type alone
  }
  return out;
}

/** An owned snapshot of an events argument (an array of events). */
export function snapshotEvents(events: unknown, code: "INVALID_CONFIG" | "INVALID_INPUT", path: string): { type: string; [k: string]: unknown }[] {
  const a = plainArray(events);
  if (a === undefined) throw new IaError(code, "SCHEMA", path, "an array of events expected");
  return a.map((e, i) => snapshot(e, code, `${path}[${i}]`));
}

/** The standard text of a nav event (7.4), or undefined when the event is not a nav event. */
function navText(e: { type: string; [k: string]: unknown }): string | undefined {
  switch (e.type) {
    case "nav-boundary":
      if (e["nav"] === "spatial" && typeof e["dir"] === "string" && SPATIAL.has(e["dir"])) return `No element to the ${e["dir"]}.`;
      if (e["nav"] === "incident") return e["delta"] === 1 ? "No next edge." : e["delta"] === -1 ? "No previous edge." : undefined;
      return undefined;
    case "nav-wrapped": return e["end"] === "end" ? "Wrapped to start." : e["end"] === "start" ? "Wrapped to end." : undefined;
    case "nav-none":
      return e["reason"] === "NO_FOCUS" ? "No focused element." : e["reason"] === "NOT_A_NODE" ? "Focus a node first."
        : e["reason"] === "NOT_AN_EDGE" ? "Focus an edge first." : e["reason"] === "ANCHOR_GONE" ? "Marquee anchor is gone." : undefined;
    case "marquee-started": return "Marquee started. Move focus to the opposite corner, then press Enter.";
    case "marquee-cancelled": return "Marquee cancelled.";
    case "lasso-too-large": case "select-all-too-large": return typeof e["count"] === "number" ? `Selection too large: ${e["count"]} elements.` : undefined;
    default: return undefined;
  }
}
const NAV_TYPES = new Set(["nav-boundary", "nav-wrapped", "nav-none", "marquee-started", "marquee-cancelled", "lasso-too-large", "select-all-too-large"]);

/** At most `LIVE_MAX_UNITS` UTF-16 units: the longest prefix of whole scalars of at most 399 units plus U+2026 (a surrogate pair is never split). */
export function bound(s: string): string {
  if (s.length <= LIVE_MAX_UNITS) return s;
  let end = LIVE_MAX_UNITS - 1;
  const c = s.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end -= 1; // the cut would split a pair
  return s.slice(0, end) + "…";
}

/** The live text of already-snapshotted events (the tree builder passes its own snapshot). */
export function liveTextOf(events: readonly { type: string; [k: string]: unknown }[], model: RenderModel, state: SemanticState, omitFocus: boolean): string {
  const texts: string[] = [];
  for (const e of events) {
    if (omitFocus && e.type === "focus-changed") continue; // dropped before its text is built (A-72)
    const t = NAV_TYPES.has(e.type) ? navText(e) : announcementFor(e as unknown as SemanticEvent, model, state);
    if (t === undefined) continue; // events with no announcement are omitted FIRST
    if (texts.length > 0 && texts[texts.length - 1] === t) continue; // then consecutive identical announcements are collapsed
    texts.push(t);
  }
  return bound(texts.join(" "));
}

/** The live-region text of one step's events (design 9.4). */
export function liveText(events: readonly LiveEvent[], model: RenderModel, state: SemanticState, options?: { omitFocusAnnouncement?: boolean }): string {
  const o = options === undefined ? undefined : plainEntries(options);
  if (options !== undefined && o === undefined) throw new IaError("INVALID_CONFIG", "SCHEMA", "options");
  let omit = false;
  if (o !== undefined) {
    for (const k of o.keys()) if (k !== "omitFocusAnnouncement") throw new IaError("INVALID_CONFIG", "SCHEMA", `options.${k}`);
    const v = o.get("omitFocusAnnouncement");
    if (v !== undefined && typeof v !== "boolean") throw new IaError("INVALID_CONFIG", "SCHEMA", "options.omitFocusAnnouncement");
    omit = v === true;
  }
  return liveTextOf(snapshotEvents(events, "INVALID_INPUT", "events"), model, state, omit);
}

