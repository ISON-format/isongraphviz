// src/labels.ts - the label pass (design 4.4(g); 30 7.5(b)-(d) by reference): which labels are drawn, the unit total and the fidelity.
import type { RenderModel } from "isongraph-visualize-renderer-core";
import type { DlFidelity } from "./types.js";
import { dl, flatLabel } from "./text.js";

export interface LabelPlan { nodeText: (string | undefined)[]; edgeText: (string | undefined)[]; fidelity: DlFidelity }

/**
 * Walks the would-be labels in the order of 4.4(g): the drawn nodes with a non-empty dl, then (iff edgeLabels) the drawn edges. The first label
 * for which total + len > maxDrawnLabelUnits is omitted and so is every later one; an empty dl is neither counted nor stops the walk.
 */
export function planLabels(model: RenderModel, nodeVisible: readonly boolean[], edgeVisible: readonly boolean[], labels: boolean, edgeLabels: boolean, maxUnits: number): LabelPlan {
  const nodeText: (string | undefined)[] = new Array<string | undefined>(model.nodes.length).fill(undefined);
  const edgeText: (string | undefined)[] = new Array<string | undefined>(model.edges.length).fill(undefined);
  if (!labels) return { nodeText, edgeText, fidelity: { labels: "none", edge_labels: false, label_units: 0 } };
  let units = 0, elided = false, stopped = false;
  const consider = (label: string): string | undefined => {
    const text = dl(label);
    if (text === "") return undefined;
    if (stopped || units + text.length > maxUnits) { stopped = true; elided = true; return undefined; }
    units += text.length;
    if (text !== flatLabel(label)) elided = true;
    return text;
  };
  for (const n of model.nodes) if (nodeVisible[n.index]) nodeText[n.index] = consider(n.label);
  if (edgeLabels) for (const e of model.edges) if (edgeVisible[e.index]) edgeText[e.index] = consider(e.label);
  return { nodeText, edgeText, fidelity: { labels: elided ? "elided" : "full", edge_labels: edgeLabels, label_units: units } };
}
