// demo/playground-lib.mjs - the pure helpers of demo/playground.mjs (NON-NORMATIVE demo code). No DOM, no package import: plain data in, plain data out, so that
// test/playground-lib.test.ts can pin each one. Layout coordinates are the model's integer thousandths ("milli"); the viewport is { center_x, center_y, width, height,
// zoom } with center_x and center_y in milli, width and height in CSS pixels and zoom in thousandths of a pixel per layout unit (screen px = (x - cx) * zoom / 1e6).

/** Mirrors of the renderer-core constants (pinned by a test): the playground clamps its own zoom targets to the same range as the reducer. */
export const ZOOM_MIN = 10;
export const ZOOM_MAX = 100_000;
export const MAX_RESULTS = 8;

const lower = (s) => String(s).toLowerCase();

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Search
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The search terms of a query: lower case, split on white space, empty parts dropped. */
export function queryTerms(query) {
  return lower(query).split(/\s+/).filter((t) => t !== "");
}

/** The fields a query can match, lower case, in rank order: a node's label (its id as text) then its type; an edge's relation, then its ordinal and its endpoints. */
export function searchFields(model, kind, index) {
  if (kind === "node") {
    const n = model.nodes[index];
    return [lower(n.label), lower(n.category)];
  }
  const e = model.edges[index];
  const s = model.nodes[e.src], t = model.nodes[e.tgt];
  return [lower(e.label), lower(e.ref.rel), lower(e.ref.ord), lower(s.label), lower(t.label), lower(s.category), lower(t.category)];
}

/** 0 exact, 1 prefix, 2 substring, undefined no match: the best over the fields. */
function termRank(fields, term) {
  let best;
  for (const f of fields) {
    const r = f === term ? 0 : f.startsWith(term) ? 1 : f.includes(term) ? 2 : undefined;
    if (r !== undefined && (best === undefined || r < best)) best = r;
    if (best === 0) break;
  }
  return best;
}

/**
 * Finds nodes and edges whose id (a node's label is its id as text), label or type contains EVERY term of the query (case-insensitive). Elements that are not effectively
 * visible (`vis` = { nodes: boolean[], edges: boolean[] }, optional) are not returned but counted in `hidden`. The result is sorted by (sum of term ranks, nodes before
 * edges, scene index); `items` is cut to `limit`, `total` is the full number of visible matches, `all` are every visible match as { kind, index }.
 */
export function searchElements(model, query, options = {}) {
  const limit = options.limit ?? MAX_RESULTS;
  const vis = options.vis;
  const terms = queryTerms(query);
  const empty = { terms, total: 0, hidden: 0, items: [], all: [] };
  if (terms.length === 0) return empty;
  const found = [];
  let hidden = 0;
  const consider = (kind, index) => {
    const fields = searchFields(model, kind, index);
    let score = 0;
    for (const t of terms) { const r = termRank(fields, t); if (r === undefined) return; score += r; }
    const visible = vis === undefined || (kind === "node" ? vis.nodes[index] : vis.edges[index]);
    if (!visible) { hidden++; return; }
    found.push({ kind, index, score });
  };
  model.nodes.forEach((_, i) => consider("node", i));
  model.edges.forEach((_, j) => consider("edge", j));
  found.sort((a, b) => a.score - b.score || (a.kind === b.kind ? a.index - b.index : a.kind === "node" ? -1 : 1));
  return { terms, total: found.length, hidden, items: found.slice(0, limit).map(({ kind, index }) => describeElement(model, kind, index)), all: found.map(({ kind, index }) => ({ kind, index })) };
}

/** What the page shows for one element: { kind, index, title, subtitle }. */
export function describeElement(model, kind, index) {
  if (kind === "node") {
    const n = model.nodes[index];
    return { kind, index, title: n.label, subtitle: `${n.category}` };
  }
  const e = model.edges[index];
  return { kind, index, title: e.label, subtitle: `${model.nodes[e.src].label} → ${model.nodes[e.tgt].label}` };
}

/** The tooltip of an element: { heading, rows: [[name, value], ...] } (plain strings; the page writes them with textContent). */
export function tooltipRows(model, kind, index) {
  if (kind === "node") {
    const n = model.nodes[index];
    return { heading: `Node ${n.label}`, rows: [["kind", "node"], ["label", n.label], ["type", n.category], ["id", n.ref.id], ["degree", String(n.degree)]] };
  }
  const e = model.edges[index];
  return { heading: `Edge ${e.label}`, rows: [["kind", "edge"], ["label", e.label], ["relation", e.ref.rel], ["from", model.nodes[e.src].label], ["to", model.nodes[e.tgt].label], ["ordinal", e.ref.ord]] };
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Neighbourhoods and visibility
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The highlight set of a target: a node, its incident (visible) edges and the other end of each; an edge and its two (visible) endpoints. `vis` is optional
 * ({ nodes, edges } booleans). Returns { nodes: Set<number>, edges: Set<number>, incident: Set<number> } where `incident` are the edges that get the accent stroke.
 */
export function neighbourhood(model, target, vis) {
  const nodes = new Set(), edges = new Set();
  const nodeOk = (i) => vis === undefined || vis.nodes[i];
  const edgeOk = (j) => vis === undefined || vis.edges[j];
  if (target.kind === "node") {
    if (nodeOk(target.index)) nodes.add(target.index);
    for (const e of model.edges) {
      if (!edgeOk(e.index) || (e.src !== target.index && e.tgt !== target.index)) continue;
      edges.add(e.index);
      if (nodeOk(e.src)) nodes.add(e.src);
      if (nodeOk(e.tgt)) nodes.add(e.tgt);
    }
  } else {
    const e = model.edges[target.index];
    if (edgeOk(target.index)) {
      edges.add(target.index);
      if (nodeOk(e.src)) nodes.add(e.src);
      if (nodeOk(e.tgt)) nodes.add(e.tgt);
    }
  }
  return { nodes, edges, incident: new Set(edges) };
}

/** The highlight set of a list of matches ({ kind, index }): exactly those elements (visible ones only when `vis` is given). */
export function matchSet(items, vis) {
  const nodes = new Set(), edges = new Set();
  for (const { kind, index } of items) {
    if (kind === "node") { if (vis === undefined || vis.nodes[index]) nodes.add(index); }
    else if (vis === undefined || vis.edges[index]) edges.add(index);
  }
  return { nodes, edges, incident: new Set() };
}

/** How many nodes and edges are effectively hidden: { nodes, edges, totalNodes, totalEdges }. */
export function countHidden(vis) {
  return { nodes: vis.nodes.filter((v) => !v).length, edges: vis.edges.filter((v) => !v).length, totalNodes: vis.nodes.length, totalEdges: vis.edges.length };
}

/** The explicit hidden sets a filter asks for: every node of a hidden type, every edge of a hidden relation (as scene indices). */
export function desiredHidden(model, hiddenTypes, hiddenRels) {
  return {
    nodes: model.nodes.filter((n) => hiddenTypes.has(n.category)).map((n) => n.index),
    edges: model.edges.filter((e) => hiddenRels.has(e.ref.rel)).map((e) => e.index),
  };
}

/** What changes between the explicit hidden sets `current` and `desired` (scene indices): { show, hide } with { nodes, edges } each. */
export function diffHidden(current, desired) {
  const minus = (a, b) => { const s = new Set(b); return a.filter((x) => !s.has(x)); };
  return {
    show: { nodes: minus(current.nodes, desired.nodes), edges: minus(current.edges, desired.edges) },
    hide: { nodes: minus(desired.nodes, current.nodes), edges: minus(desired.edges, current.edges) },
  };
}

/** The distinct relations of a model, sorted, with their edge counts: [{ name, count }]. */
export function relationCounts(model) {
  const m = new Map();
  for (const e of model.edges) m.set(e.ref.rel, (m.get(e.ref.rel) ?? 0) + 1);
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([name, count]) => ({ name, count }));
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Viewport arithmetic
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The rectangle of the layout (milli) the viewport shows: { x0, y0, x1, y1 }. */
export function viewportRect(vp) {
  const hw = (vp.width * 500_000) / vp.zoom, hh = (vp.height * 500_000) / vp.zoom;
  return { x0: vp.center_x - hw, y0: vp.center_y - hh, x1: vp.center_x + hw, y1: vp.center_y + hh };
}

const unionRect = (a, b) => (a === undefined ? b : b === undefined ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** The layout rectangle (milli) the minimap shows: the bounds of the nodes joined with the viewport rectangle, so the viewport frame is never clipped. */
export function minimapWorld(bounds, vp) {
  const b = bounds === undefined ? undefined : { x0: bounds.min_x, y0: bounds.min_y, x1: bounds.max_x, y1: bounds.max_y };
  return unionRect(b, viewportRect(vp));
}

/**
 * The mapping between a layout rectangle (milli) and a w x h minimap box with `pad` px on every side, aspect ratio kept, centred.
 * Returns { scale (px per milli), toMini(x, y), fromMini(px, py) }; a degenerate (zero-size) world is given a 1000-milli extent.
 */
export function minimapTransform(world, w, h, pad = 6) {
  const ww = Math.max(world.x1 - world.x0, 1000), wh = Math.max(world.y1 - world.y0, 1000);
  const scale = Math.min((w - 2 * pad) / ww, (h - 2 * pad) / wh);
  const cx = (world.x0 + world.x1) / 2, cy = (world.y0 + world.y1) / 2;
  const ox = w / 2 - cx * scale, oy = h / 2 - cy * scale;
  return { scale, toMini: (x, y) => ({ x: x * scale + ox, y: y * scale + oy }), fromMini: (px, py) => ({ x: (px - ox) / scale, y: (py - oy) / scale }) };
}

/** The set-viewport target that centres the layout point (milli) in the viewport at the same zoom: integers only. */
export function centreOn(vp, x, y) {
  return { center_x: Math.round(x), center_y: Math.round(y), zoom: vp.zoom };
}

/** The bounding box (milli) of nodes ({ x, y } each) and edges' end points: { x0, y0, x1, y1 } or undefined when there is nothing. */
export function boxOf(points) {
  let b;
  for (const p of points) b = b === undefined ? { x0: p.x, y0: p.y, x1: p.x, y1: p.y } : { x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) };
  return b;
}

/** The points a selection covers: every selected node, and both ends of every selected edge (indices into model.nodes and model.edges). */
export function selectionPoints(model, nodeIndices, edgeIndices) {
  const pts = new Map();
  for (const i of nodeIndices) pts.set(i, model.nodes[i]);
  for (const j of edgeIndices) { const e = model.edges[j]; pts.set(e.src, model.nodes[e.src]); pts.set(e.tgt, model.nodes[e.tgt]); }
  return [...pts.values()].map((n) => ({ x: n.x, y: n.y }));
}

/**
 * A set-viewport target (integers) that shows a layout box (milli) in a width x height viewport with `padding` px around it. The zoom is the largest that fits, clamped
 * to [ZOOM_MIN, maxZoom]; a box of one point (zero span) takes `maxZoom`.
 */
export function viewportForBox(box, size, padding = 48, maxZoom = 2000) {
  const ax = Math.max(size.width - 2 * padding, 1), ay = Math.max(size.height - 2 * padding, 1);
  const sx = box.x1 - box.x0, sy = box.y1 - box.y0;
  const cands = [];
  if (sx > 0) cands.push(Math.floor((ax * 1_000_000) / sx));
  if (sy > 0) cands.push(Math.floor((ay * 1_000_000) / sy));
  const z = cands.length === 0 ? maxZoom : Math.min(...cands);
  return { center_x: Math.round((box.x0 + box.x1) / 2), center_y: Math.round((box.y0 + box.y1) / 2), zoom: Math.max(ZOOM_MIN, Math.min(maxZoom, ZOOM_MAX, z)) };
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Dragging
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** A pointer displacement in viewport pixels as a displacement of the layout (milli), rounded to integers: dx px = dx x 1e6 / zoom milli. */
export function pixelsToMilli(dxPx, dyPx, zoom) {
  const f = (v) => { const m = Math.round((v * 1_000_000) / zoom); return m === 0 ? 0 : m; };
  return { dx: f(dxPx), dy: f(dyPx) };
}

/** The new position (integer milli) of a dragged node: its start position plus the pointer displacement (viewport px) at the viewport zoom. */
export function dragPosition(start, dxPx, dyPx, zoom) {
  const d = pixelsToMilli(dxPx, dyPx, zoom);
  return { x: start.x + d.dx, y: start.y + d.dy };
}

/** The positions argument of layout-core's computeFixedLayout: every node at its model position (layout units = milli / 1000), `moves` (Map<index, {x, y} milli>) applied. */
export function fixedPositions(model, moves) {
  return model.nodes.map((n) => {
    const m = moves.get(n.index);
    return { ref: { id: n.ref.id, type: n.ref.type }, x: (m ? m.x : n.x) / 1000, y: (m ? m.y : n.y) / 1000 };
  });
}

/** The unit step of a keyboard nudge, in layout milli at the given zoom: `px` pixels (default 16) in the direction named. */
export function nudgeDelta(dir, zoom, px = 16) {
  const d = pixelsToMilli(px, px, zoom);
  const sx = dir === "left" ? -1 : dir === "right" ? 1 : 0, sy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
  return { dx: sx * d.dx, dy: sy * d.dy };
}

/** The layout hash shortened for display: the first 12 hex digits. */
export const shortHash = (h) => String(h).slice(0, 12);

/** The zoom as the page shows it: a percentage of the 1:1 scale (zoom 1000 = 100 %). */
export const zoomPercent = (zoom) => `${Math.round(zoom / 10)}%`;
