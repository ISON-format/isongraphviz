// src/svgmap.ts - the SVG ARIA mapping check G9-MAP (design 9.7, 10): for an SVG host whose own elements are the accessible tree, the names, tabindex values
// and root title and description of a V5 `readSvg` result are compared with the traversal, the state and the summary. Pure; no DOM.
import { IaError } from "isongraph-visualize-interaction-core";
import { plainArray, plainEntries } from "./util.js";

export interface SvgInput { root: { title: string; desc: string }; items: readonly { name: string; tabindex: number }[] }
export interface Finding { code: string; position?: number }

/** An owned, shape-checked copy of the gate's `svg` input (INVALID_INPUT/SCHEMA for any deviation). */
export function readSvgInput(v: unknown): SvgInput {
  const bad = (p: string): IaError => new IaError("INVALID_INPUT", "SCHEMA", `svg${p}`);
  const m = plainEntries(v);
  if (m === undefined) throw bad("");
  for (const k of m.keys()) if (k !== "root" && k !== "items") throw bad(`.${k}`);
  const r = plainEntries(m.get("root"));
  if (r === undefined || typeof r.get("title") !== "string" || typeof r.get("desc") !== "string") throw bad(".root");
  const raw = plainArray(m.get("items"));
  if (raw === undefined) throw bad(".items");
  const items = raw.map((x, i) => {
    const e = plainEntries(x);
    if (e === undefined || typeof e.get("name") !== "string" || typeof e.get("tabindex") !== "number" || !Number.isInteger(e.get("tabindex"))) throw bad(`.items[${i}]`);
    return { name: e.get("name") as string, tabindex: e.get("tabindex") as number };
  });
  return { root: { title: r.get("title") as string, desc: r.get("desc") as string }, items };
}

/**
 * G9-MAP findings: the whole-check findings SVG_TITLE, SVG_DESC, SVG_TABSTOP first (in this order), then SVG_NAME and SVG_ORDER in item order.
 * `names[i]` is the accessible name of the traversal element at position i + 1; `stop` is the expected tab-stop position (undefined for an empty graph).
 */
export function svgMapFindings(svg: SvgInput, summary: string, status: string, names: readonly string[], stop: number | undefined): Finding[] {
  const n = names.length;
  const out: Finding[] = [];
  if (svg.root.title !== summary) out.push({ code: "SVG_TITLE" });
  if (svg.root.desc !== status) out.push({ code: "SVG_DESC" });
  const zeros: number[] = [];
  svg.items.forEach((it, i) => { if (it.tabindex === 0) zeros.push(i + 1); });
  const tabOk = n === 0 ? zeros.length === 0 : zeros.length === 1 && zeros[0] === stop;
  if (!tabOk) out.push({ code: "SVG_TABSTOP" });
  for (let i = 0; i < svg.items.length; i++) {
    const pos = i + 1;
    if (pos <= n) { if (svg.items[i]!.name !== names[i]) out.push({ code: "SVG_NAME", position: pos }); }
    else out.push({ code: "SVG_ORDER", position: pos });
  }
  if (svg.items.length < n) out.push({ code: "SVG_ORDER", position: svg.items.length + 1 });
  return out;
}
