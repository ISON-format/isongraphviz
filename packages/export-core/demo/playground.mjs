// demo/playground.mjs - the page logic of demo/playground.html (NON-NORMATIVE demo code; bundled by scripts/build-demo.mjs). An interactive graph viewer on the
// two hosts of demo/page.mjs (Canvas renderer + accessible companion, or the V5 SVG adapter), with: hover and focus highlight, node dragging, search and filter,
// pan, zoom and a minimap. It changes no renderer, no layout byte and no contract:
//  - every view change goes through the frozen intents of renderer-core (select, focus, set-hidden, set-viewport, resize, fit, zoom, pan) on the host renderer or
//    through bindInteraction (wheel zoom, background pan, double-click fit, keys +, -, 0, arrows);
//  - highlight and drag preview are drawn on an OVERLAY canvas above the host from a display list built with display-list's public buildDisplayList and replayed with
//    its public Canvas replay (the highlight is the same list filtered to the elements to keep, drawn over a veil; the drag preview is a full list of a candidate model),
//    so no label coordinate is ever computed here and a change of label placement in the libraries shows up in the overlay as it does in the host;
//  - a drag builds a NEW layout through layout-core's public computeFixedLayout (family FIXED, positions in layout units) and a new RenderModel through
//    buildRenderModel; the original layout bytes are never touched (Reset layout loads them again). The semantic state (selection, focus, hidden, viewport) is
//    carried to the new model by element address; only its layout_sha256 changes.
// No network, no storage, no innerHTML: every text goes through textContent. Pure helpers live in playground-lib.mjs (unit-tested).
import { buildRenderModel, effectiveVisibility, elementKey, fitViewport, initialState, lookupElement, normalizeState } from "isongraph-visualize-renderer-core";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { THEME, buildDisplayList } from "isongraph-visualize-display-list";
import { replayCanvas } from "isongraph-visualize-display-list/canvas2d";
import { createDomCanvasRenderer } from "isongraph-visualize-renderer-canvas/dom";
import { createDomSvgRenderer } from "isongraph-visualize-renderer-svg/dom";
import { decodeElementId, elementDomId, pickElement } from "isongraph-visualize-renderer-svg";
import { bindInteraction } from "isongraph-visualize-interaction-core/dom";
import { mountCompanion } from "isongraph-visualize-a11y-companion/dom";
import { COMPANION_CSS, liveText } from "isongraph-visualize-a11y-companion";
import * as L from "./playground-lib.mjs";

const data = window.__PLAYGROUND__;
const $ = (id) => document.getElementById(id);
const stage = $("stage"), graph = $("graph"), overlay = $("overlay"), tooltip = $("tooltip"), previewTag = $("previewtag"), mini = $("minimap");
const searchBox = $("q"), resultsList = $("results"), messageEl = $("message");
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const msg = (e) => (e && e.message ? e.message : String(e));
const SVG_PREFIX = "igr"; // the V5 adapter's default idPrefix
const STAGE_BG = "#f7f8fa"; // = --stage in playground.html
const VEIL = "rgba(247,248,250,0.76)";
const ACCENT_INK = "#14181d";
const RING_R = 22; // the ring of the hovered or dragged node: outside the host's selection (14) and focus (18) rings
const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const app = {
  kind: "canvas", renderer: undefined, binding: undefined, companion: undefined, status: undefined,
  model: undefined, layoutBytes: undefined, edited: false, moves: 0,
  nodeKeys: [], edgeKeys: [],
  hover: undefined, pointer: undefined, // pointer: the last client point over the graph, or undefined
  drag: undefined, overlayInfo: { mode: "none", nodes: [], edges: [], ring: null },
  search: { query: "", terms: [], items: [], all: [], total: 0, hidden: 0, active: 0, sig: "", open: false },
  hiddenTypes: new Set(), hiddenRels: new Set(),
  atFit: true, miniT: undefined, miniFrozen: undefined, miniDrag: false, miniBox: { w: 220, h: 132 },
  chain: Promise.resolve(), switching: false,
};

function say(text, isError = false) { messageEl.textContent = text; messageEl.classList.toggle("err", isError); }

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Model plumbing: addresses, keys, visibility
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const refCopy = (r) => JSON.parse(JSON.stringify(r));
const addressOf = (t) => (t.kind === "node" ? { node: refCopy(app.model.nodes[t.index].ref) } : { edge: refCopy(app.model.edges[t.index].ref) });
const elementOfAddress = (a) => { const e = lookupElement(app.model, "node" in a ? a.node : a.edge); return e === undefined ? undefined : { kind: "node" in a ? "node" : "edge", index: e.index }; };
const sameTarget = (a, b) => (a === undefined || b === undefined ? a === b : a.kind === b.kind && a.index === b.index);
const label = (t) => (t.kind === "node" ? app.model.nodes[t.index].label : `${app.model.nodes[app.model.edges[t.index].src].label} ${app.model.edges[t.index].label} ${app.model.nodes[app.model.edges[t.index].tgt].label}`);
const stateNow = () => app.renderer.getState();
const visNow = () => effectiveVisibility(app.model, stateNow());
function indexKeys() {
  app.nodeKeys = app.model.nodes.map((n) => elementKey(n.ref));
  app.edgeKeys = app.model.edges.map((e) => elementKey(e.ref));
}
/** The explicit hidden sets of a state, as scene indices. */
function hiddenOf(state) {
  const idx = (a) => lookupElement(app.model, a).index;
  return { nodes: state.hidden.nodes.map(idx), edges: state.hidden.edges.map(idx) };
}
const focusTarget = (state) => (state.focus === undefined ? undefined : elementOfAddress(state.focus));

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Canvas sizing (overlay and minimap)
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Sizes a canvas to w x h CSS px at the device ratio; returns the ratio in thousandths (what replayCanvas takes as dprMilli). */
function sizeCanvas(c, w, h) {
  const milli = Math.min(8000, Math.max(250, Math.round((window.devicePixelRatio || 1) * 1000)));
  const k = milli / 1000;
  const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k));
  if (c.width !== bw) c.width = bw;
  if (c.height !== bh) c.height = bh;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  return milli;
}
let overlayMilli = 1000;
const octx = overlay.getContext("2d");
const mctx = mini.getContext("2d");
function sizeOverlay() { const vp = stateNow().viewport; overlayMilli = sizeCanvas(overlay, vp.width, vp.height); }
function sizeMini() {
  const w = Math.max(120, Math.floor($("minimap-box").clientWidth) || 220);
  app.miniBox = { w, h: Math.round(w * 0.52) };
  sizeCanvas(mini, app.miniBox.w, app.miniBox.h);
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// The overlay: highlight (a veil over the host with the kept elements redrawn on top) and the drag preview
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function traceRoute(ctx, r) {
  const n = (i) => r[i] / 1000;
  ctx.beginPath();
  ctx.moveTo(n(4), n(5));
  if (r[3] === 0) ctx.lineTo(n(6), n(7));
  else if (r[3] === 1) ctx.quadraticCurveTo(n(6), n(7), n(8), n(9));
  else ctx.bezierCurveTo(n(6), n(7), n(8), n(9), n(10), n(11));
}
function clearOverlay() {
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  app.overlayInfo = { mode: "none", nodes: [], edges: [], ring: null };
}
/** pid of every element of a display list, by address key: nodes are 1..n in list order, edges follow. */
function pidMap(list) {
  const m = new Map();
  list.nodes.forEach((n, i) => m.set(elementKey(n), i + 1));
  list.edges.forEach((e, i) => m.set(elementKey(e), list.nodes.length + i + 1));
  return m;
}
/** set = { nodes, edges, incident } (scene indices); ring = target to circle, or undefined. */
function paintHighlight(mode, set, ring) {
  const state = stateNow();
  const list = buildDisplayList(app.model, state);
  const pids = pidMap(list);
  const keep = new Set(), accent = new Set();
  for (const i of set.nodes) { const p = pids.get(app.nodeKeys[i]); if (p !== undefined) keep.add(p); }
  for (const j of set.edges) { const p = pids.get(app.edgeKeys[j]); if (p !== undefined) { keep.add(p); if (set.incident.has(j)) accent.add(p); } }
  replayCanvas({ width: list.width, height: list.height, records: list.records.filter((r) => keep.has(r[1])) }, octx, { dprMilli: overlayMilli });
  octx.globalAlpha = 1; octx.setLineDash([]); octx.strokeStyle = ACCENT_INK; octx.lineWidth = 3;
  for (const r of list.records) if (r[0] === "E" && accent.has(r[1])) { traceRoute(octx, r); octx.stroke(); }
  let ringPid;
  if (ring !== undefined) ringPid = pids.get(ring.kind === "node" ? app.nodeKeys[ring.index] : app.edgeKeys[ring.index]);
  if (ring !== undefined && ring.kind === "node") {
    for (const r of list.records) if (r[0] === "N" && r[1] === ringPid) { octx.beginPath(); octx.arc(r[4] / 1000, r[5] / 1000, RING_R, 0, 2 * Math.PI); octx.stroke(); }
  } else if (ring !== undefined) {
    for (const r of list.records) if (r[0] === "E" && r[1] === ringPid) { octx.lineWidth = 4; traceRoute(octx, r); octx.stroke(); }
  }
  octx.globalCompositeOperation = "destination-over";
  octx.globalAlpha = 1; octx.fillStyle = VEIL;
  octx.fillRect(0, 0, list.width, list.height);
  octx.globalCompositeOperation = "source-over";
  app.overlayInfo = {
    mode, ring: ring === undefined ? null : label(ring),
    nodes: [...set.nodes].map((i) => app.model.nodes[i].label).sort(),
    edges: [...set.edges].map((j) => label({ kind: "edge", index: j })).sort(),
  };
}

/** What the overlay should show now: the hovered element, else the search matches, else the semantic focus while the graph has DOM focus. */
function wantedHighlight() {
  const vis = visNow();
  if (app.hover !== undefined) return { mode: "hover", set: L.neighbourhood(app.model, app.hover, vis), ring: app.hover };
  if (app.search.terms.length > 0 && app.search.all.length > 0) {
    const active = app.search.items[app.search.active];
    return { mode: "search", set: L.matchSet(app.search.all, vis), ring: active === undefined ? undefined : { kind: active.kind, index: active.index } };
  }
  const f = focusTarget(stateNow());
  if (f !== undefined && graph.contains(document.activeElement)) return { mode: "focus", set: L.neighbourhood(app.model, f, vis), ring: f };
  return undefined;
}
function refreshOverlay() {
  if (app.drag !== undefined && app.drag.moved) return; // the preview owns the overlay
  try {
    const w = wantedHighlight();
    clearOverlay();
    if (w !== undefined) paintHighlight(w.mode, w.set, w.ring);
  } catch (e) { clearOverlay(); say(`highlight: ${msg(e)}`, true); }
  stage.classList.toggle("over-node", app.hover !== undefined && app.hover.kind === "node");
}

function hideTooltip() { tooltip.hidden = true; }
function showTooltip(target, clientX, clientY) {
  const t = L.tooltipRows(app.model, target.kind, target.index);
  tooltip.textContent = "";
  const h = document.createElement("div");
  h.className = "h"; h.textContent = t.heading;
  tooltip.appendChild(h);
  for (const [k, v] of t.rows) {
    const row = document.createElement("div");
    row.className = "r";
    const a = document.createElement("span"), b = document.createElement("span");
    a.textContent = k; b.textContent = v;
    row.append(a, b);
    tooltip.appendChild(row);
  }
  tooltip.hidden = false;
  const box = stage.getBoundingClientRect();
  let x = clientX - box.left + 14, y = clientY - box.top + 16;
  if (x + tooltip.offsetWidth > box.width - 4) x = clientX - box.left - tooltip.offsetWidth - 14;
  if (y + tooltip.offsetHeight > box.height - 4) y = clientY - box.top - tooltip.offsetHeight - 14;
  tooltip.style.left = `${Math.max(4, x)}px`;
  tooltip.style.top = `${Math.max(4, y)}px`;
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Picking and hover
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function pickAt(clientX, clientY) {
  const rect = graph.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return undefined;
  const state = stateNow(), vp = state.viewport;
  const p = { x: ((clientX - rect.left) * vp.width) / rect.width, y: ((clientY - rect.top) * vp.height) / rect.height };
  if (p.x < 0 || p.y < 0 || p.x > vp.width || p.y > vp.height) return undefined;
  try {
    const a = app.kind === "canvas" ? app.renderer.pick(p) : pickElement(app.model, state, SVG_PREFIX, { point: p });
    return a === undefined ? undefined : elementOfAddress(a);
  } catch { return undefined; }
}
function setHover(t, clientX, clientY) {
  const changed = !sameTarget(t, app.hover);
  app.hover = t;
  if (t === undefined) hideTooltip(); else showTooltip(t, clientX, clientY);
  if (changed) refreshOverlay();
}
graph.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" || e.buttons !== 0 || app.drag !== undefined || app.switching) return;
  app.pointer = { x: e.clientX, y: e.clientY };
  setHover(pickAt(e.clientX, e.clientY), e.clientX, e.clientY);
});
graph.addEventListener("pointerleave", () => { app.pointer = undefined; if (app.drag === undefined) setHover(undefined); });
graph.addEventListener("pointerdown", () => { hideTooltip(); });
graph.addEventListener("focusin", () => refreshOverlay());
graph.addEventListener("focusout", () => { window.setTimeout(refreshOverlay, 0); });

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Intents: one place that dispatches, announces and refreshes everything that follows a commit
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function announce(events, nav = [], mode = "normal") {
  if (app.kind === "canvas") app.companion.update(app.model, stateNow(), [...events, ...nav], mode);
  else app.status.textContent = liveText([...events, ...nav], app.model, stateNow(), { omitFocusAnnouncement: true });
}
/** Dispatches the intents in order on the host renderer; any refusal is shown in the message line. Returns whether all of them were accepted. */
function act(...intents) {
  const events = [];
  let ok = true;
  try { for (const i of intents) events.push(...app.renderer.dispatch(i)); }
  catch (e) { ok = false; say(`${e && e.code ? `${e.code}: ` : ""}${msg(e)}`, true); }
  announce(events);
  after();
  return ok;
}
/** After EVERY commit (the binder's, or act's): readouts, minimap, filter counts, search results, hover re-pick, overlay. */
function after() {
  const state = stateNow(), vp = state.viewport;
  try { const f = fitViewport(app.model, state); app.atFit = f.center_x === vp.center_x && f.center_y === vp.center_y && f.zoom === vp.zoom; } catch { app.atFit = false; }
  $("zoomread").textContent = L.zoomPercent(vp.zoom);
  const vis = visNow(), c = L.countHidden(vis);
  $("readout").textContent = `Zoom ${L.zoomPercent(vp.zoom)} · ${c.totalNodes - c.nodes} of ${c.totalNodes} nodes and ${c.totalEdges - c.edges} of ${c.totalEdges} edges shown · ${app.kind === "canvas" ? "Canvas" : "SVG"} host`;
  $("filtercount").textContent = c.nodes + c.edges === 0 ? "Nothing hidden." : `Hidden: ${c.nodes} of ${c.totalNodes} nodes, ${c.edges} of ${c.totalEdges} edges.`;
  $("clear-filters").disabled = c.nodes + c.edges === 0 && app.hiddenTypes.size === 0 && app.hiddenRels.size === 0;
  const sel = [...state.selection.nodes.map((n) => lookupElement(app.model, n)), ...state.selection.edges.map((e) => lookupElement(app.model, e))];
  $("selection").textContent = sel.length === 0 ? "Nothing selected." : `${sel.length} selected: ${sel.slice(0, 4).map((x) => x.label).join(", ")}${sel.length > 4 ? ` and ${sel.length - 4} more` : ""}.`;
  $("zoom-sel").disabled = sel.length === 0;
  if (app.pointer !== undefined && app.drag === undefined && !app.switching) {
    const t = pickAt(app.pointer.x, app.pointer.y);
    app.hover = t;
    if (t === undefined) hideTooltip();
  }
  refreshSearch(true);
  drawMinimap();
  refreshOverlay();
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Hosts (Canvas + companion, or the V5 SVG adapter): the mechanism of demo/page.mjs
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const measure = () => ({ width: Math.max(200, Math.floor(graph.clientWidth)), height: Math.max(200, Math.floor(graph.clientHeight)) });
const hostEnv = () => ({ host: graph, size: measure(), reducedMotion: reducedQuery.matches, onError: (e) => say(`error: ${msg(e)}`, true) });
const common = () => ({
  model: () => app.model,
  state: () => app.renderer.getState(),
  dispatch: (intent) => app.renderer.dispatch(intent),
  onOutput: () => {},
  onError: (e) => say(`error: ${msg(e)}`, true),
});

async function startCanvas(initial) {
  const renderer = createDomCanvasRenderer({ pointer: "none", liveRegion: "none", canvasLabel: "none" });
  const env = hostEnv();
  await renderer.initialize(env);
  await renderer.loadScene(app.model, initial ?? initialState(app.model, env.size));
  const companion = mountCompanion(graph, { onError: (e) => say(`companion: ${msg(e)}`, true) });
  companion.update(app.model, renderer.getState());
  Object.assign(app, { renderer, companion, status: undefined, kind: "canvas" });
  const itemFor = (a) => [...graph.querySelectorAll('[role="option"]')].find((el) => JSON.stringify(companion.itemAddress(el)) === JSON.stringify(a));
  app.binding = bindInteraction(graph, {
    ...common(),
    pick: (p) => renderer.pick(p),
    addressOfElement: (el) => companion.itemAddress(el),
    focusElement: (a) => { const el = a && itemFor(a); if (el) el.focus({ preventScroll: true }); },
    onCommit: ({ events, nav, mode }) => { announce(events, nav, mode); after(); },
  }, { adapterPointer: "none", adapterFocusRestore: "none", surface: graph.querySelector("canvas") });
}

async function startSvg(initial) {
  const renderer = createDomSvgRenderer({ pointer: "none", liveRegion: "none", focusRestore: "none" });
  const env = hostEnv();
  await renderer.initialize(env);
  const status = document.createElement("div");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.setAttribute("aria-atomic", "true"); status.setAttribute("class", "demo-status");
  graph.insertBefore(status, graph.firstChild);
  await renderer.loadScene(app.model, initial ?? initialState(app.model, env.size));
  Object.assign(app, { renderer, companion: undefined, status, kind: "svg" });
  const elementOf = (el) => (el && typeof el.closest === "function" ? el.closest("g.igr-node, g.igr-edge") : null);
  // the adapter replaces its svg element on every commit: the binder's surface names whichever svg is mounted
  const surface = { getBoundingClientRect: () => { const s = graph.querySelector("svg"); return s ? s.getBoundingClientRect() : new DOMRect(0, 0, 0, 0); } };
  app.binding = bindInteraction(graph, {
    ...common(),
    pick: (p) => pickElement(app.model, renderer.getState(), SVG_PREFIX, { point: p }),
    addressOfElement: (el) => { const g = elementOf(el); const id = g === null ? null : g.getAttribute("id"); return typeof id === "string" ? decodeElementId(SVG_PREFIX, id) : undefined; },
    focusElement: (a) => { const el = a && document.getElementById(elementDomId(SVG_PREFIX, a)); if (el) el.focus({ preventScroll: true }); },
    onCommit: ({ events, nav }) => { announce(events, nav); after(); },
  }, { adapterPointer: "none", adapterFocusRestore: "none", surface });
}

async function teardown() {
  app.binding.dispose();
  if (app.companion) app.companion.dispose();
  if (app.status && app.status.parentNode === graph) graph.removeChild(app.status);
  await app.renderer.dispose();
}

async function switchHost(to) {
  if (app.switching || to === app.kind) return;
  app.switching = true;
  try {
    const state = stateNow();
    setHover(undefined);
    await teardown();
    if (to === "svg") await startSvg(state); else await startCanvas(state);
    $("host-canvas").setAttribute("aria-pressed", String(to === "canvas"));
    $("host-svg").setAttribute("aria-pressed", String(to === "svg"));
    say(to === "svg" ? "SVG host: the adapter's own ARIA elements, one Tab stop." : "Canvas host: the accessible companion is back.");
    sizeOverlay();
    after();
  } catch (e) { say(`switching the host failed: ${msg(e)}`, true); }
  finally { app.switching = false; }
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Layouts: drag, nudge, reset (a NEW FIXED layout beside the untouched original)
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const sceneBytes = () => unb64(data.sceneB64);
/** A model for the current model's layout with some nodes moved (Map<index, {x, y}> in milli): computeFixedLayout, then buildRenderModel. */
async function layoutWith(moves) {
  const positions = L.fixedPositions(app.model, moves);
  const scene = sceneBytes();
  const { layoutBytes } = await computeFixedLayout(scene, positions);
  const model = await buildRenderModel(scene, layoutBytes);
  return { model, layoutBytes };
}
/** The state of the current renderer for another model of the same scene: the same selection, focus, hidden and viewport; only the layout hash differs. */
const carry = (model) => normalizeState(model, { ...stateNow(), layout_sha256: model.layoutSha256 });

function layoutInfo() {
  const orig = L.shortHash(app.originalSha), cur = L.shortHash(app.model.layoutSha256);
  $("layoutinfo").textContent = app.edited
    ? `Edited: ${app.moves} move${app.moves === 1 ? "" : "s"} as a new FIXED layout (igl-fixed/1), hash ${cur}. The original layout (${orig}) is unchanged.`
    : `Original FORCE layout, hash ${orig}.`;
  $("reset-layout").disabled = !app.edited;
}

/** Loads another model of the scene into the host renderer, carrying the state; the binder reads app.model, so it follows. */
async function installModel(model, layoutBytes) {
  const state = carry(model);
  await app.renderer.loadScene(model, state);
  app.model = model; app.layoutBytes = layoutBytes;
  indexKeys();
  if (app.kind === "canvas") app.companion.update(model, app.renderer.getState());
  layoutInfo();
  clearOverlay();
  after();
}

async function commitMove(moves, text) {
  try {
    const built = await layoutWith(moves);
    await installModel(built.model, built.layoutBytes);
    app.edited = true; app.moves += 1;
    layoutInfo();
    say(`${text}. New layout igl-fixed/1, hash ${L.shortHash(built.model.layoutSha256)}; the original (${L.shortHash(app.originalSha)}) is unchanged.`);
  } catch (e) { say(`move refused: ${msg(e)}`, true); clearOverlay(); after(); }
}

function paintPreview(model, movedIndex) {
  const state = normalizeState(model, { ...stateNow(), layout_sha256: model.layoutSha256 });
  const list = buildDisplayList(model, state);
  replayCanvas(list, octx, { dprMilli: overlayMilli });
  const pids = pidMap(list);
  const pid = pids.get(elementKey(model.nodes[movedIndex].ref));
  octx.globalAlpha = 1; octx.setLineDash([]); octx.strokeStyle = ACCENT_INK; octx.lineWidth = 3;
  for (const r of list.records) if (r[0] === "N" && r[1] === pid) { octx.beginPath(); octx.arc(r[4] / 1000, r[5] / 1000, RING_R, 0, 2 * Math.PI); octx.stroke(); }
  octx.globalCompositeOperation = "destination-over";
  octx.fillStyle = STAGE_BG;
  octx.fillRect(0, 0, list.width, list.height);
  octx.globalCompositeOperation = "source-over";
  app.overlayInfo = { mode: "drag", ring: model.nodes[movedIndex].label, nodes: [model.nodes[movedIndex].label], edges: [], pos: { x: model.nodes[movedIndex].x, y: model.nodes[movedIndex].y } };
}

function schedulePreview(d) {
  d.dirty = true;
  if (d.running) return;
  d.running = true;
  (async () => {
    try {
      while (d.dirty && app.drag === d) {
        d.dirty = false;
        const built = await layoutWith(new Map([[d.index, d.pos]]));
        if (app.drag !== d) return;
        paintPreview(built.model, d.index);
      }
    } catch (e) { say(`preview: ${msg(e)}`, true); }
    finally { d.running = false; }
  })();
}

function endDrag() {
  const d = app.drag;
  app.drag = undefined;
  stage.classList.remove("grabbing");
  previewTag.hidden = true;
  if (d) { try { stage.releasePointerCapture(d.pointerId); } catch { /* already released */ } }
  return d;
}

stage.addEventListener("pointerdown", (e) => {
  if (!graph.contains(e.target) || app.switching || app.drag !== undefined) return;
  if (e.button !== 0 || e.isPrimary === false || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return; // modified presses stay with the binder (toggle, add, lasso)
  const hit = pickAt(e.clientX, e.clientY);
  if (hit === undefined || hit.kind !== "node") return; // background, edges: the binder (pan, click)
  e.preventDefault(); e.stopPropagation();
  graph.focus({ preventScroll: true });
  const n = app.model.nodes[hit.index];
  app.drag = { index: hit.index, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, start: { x: n.x, y: n.y }, pos: { x: n.x, y: n.y }, moved: false, dirty: false, running: false };
  try { stage.setPointerCapture(e.pointerId); } catch { /* an inactive pointer cannot be captured */ }
  setHover(undefined);
}, true);
stage.addEventListener("pointermove", (e) => {
  const d = app.drag;
  if (d === undefined || e.pointerId !== d.pointerId) return;
  const rect = graph.getBoundingClientRect(), vp = stateNow().viewport;
  const dx = ((e.clientX - d.x0) * vp.width) / rect.width, dy = ((e.clientY - d.y0) * vp.height) / rect.height;
  if (!d.moved && Math.hypot(dx, dy) < 4) return; // below the threshold it is still a click
  if (!d.moved) { d.moved = true; stage.classList.add("grabbing"); previewTag.hidden = false; }
  d.pos = L.dragPosition(d.start, dx, dy, vp.zoom);
  schedulePreview(d);
});
stage.addEventListener("pointerup", (e) => {
  const d = app.drag;
  if (d === undefined || e.pointerId !== d.pointerId) return;
  endDrag();
  if (!d.moved) { act({ type: "select", mode: "replace", targets: [addressOf({ kind: "node", index: d.index })] }); return; } // a click on a node selects it, as the binder's click does
  const name = app.model.nodes[d.index].label;
  app.chain = app.chain.then(() => commitMove(new Map([[d.index, d.pos]]), `Moved ${name}`));
});
const cancelDrag = (text) => { const d = endDrag(); if (d && d.moved) { clearOverlay(); after(); say(text); } };
stage.addEventListener("pointercancel", () => cancelDrag("Move cancelled."));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && app.drag !== undefined) { cancelDrag("Move cancelled."); e.preventDefault(); } });

// keyboard alternative to dragging: Alt+Shift+arrows nudge the one selected node, else the focused node
graph.addEventListener("keydown", (e) => {
  const dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
  if (dir === undefined || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const state = stateNow();
  let t = state.selection.nodes.length === 1 && state.selection.edges.length === 0 ? elementOfAddress({ node: state.selection.nodes[0] }) : undefined;
  if (t === undefined) { const f = focusTarget(state); if (f !== undefined && f.kind === "node") t = f; }
  if (t === undefined) { say("Nudge: select exactly one node, or move the focus to a node with the arrow keys, first.", true); return; }
  const idx = t.index;
  app.chain = app.chain.then(() => {
    const n = app.model.nodes[idx];
    const d = L.nudgeDelta(dir, stateNow().viewport.zoom);
    return commitMove(new Map([[idx, { x: n.x + d.dx, y: n.y + d.dy }]]), `Nudged ${n.label} ${dir}`);
  });
});

$("reset-layout").addEventListener("click", () => {
  app.chain = app.chain.then(async () => {
    try {
      const model = await buildRenderModel(sceneBytes(), unb64(data.layoutB64));
      await installModel(model, unb64(data.layoutB64));
      app.edited = false; app.moves = 0;
      layoutInfo();
      say(`Original layout restored (hash ${L.shortHash(model.layoutSha256)}).`);
    } catch (e) { say(`reset failed: ${msg(e)}`, true); }
  });
});

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Search
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function renderResults() {
  const s = app.search;
  resultsList.textContent = "";
  const open = s.open && s.terms.length > 0 && (s.items.length > 0 || s.hidden > 0 || s.total === 0);
  resultsList.hidden = !open;
  searchBox.setAttribute("aria-expanded", String(open));
  if (!open) { searchBox.removeAttribute("aria-activedescendant"); return; }
  s.items.forEach((it, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option"); li.id = `res-${i}`; li.setAttribute("aria-selected", String(i === s.active));
    const kind = document.createElement("span"), title = document.createElement("span"), sub = document.createElement("span");
    kind.className = "kind"; kind.textContent = it.kind; title.textContent = it.title; sub.className = "sub"; sub.textContent = it.subtitle;
    li.append(kind, title, sub);
    li.addEventListener("mousedown", (e) => e.preventDefault()); // keep the focus in the box
    li.addEventListener("click", () => { app.search.active = i; chooseResult(i); app.search.open = false; renderResults(); });
    resultsList.appendChild(li);
  });
  const note = (text) => { const li = document.createElement("li"); li.setAttribute("role", "presentation"); li.className = "note"; li.textContent = text; resultsList.appendChild(li); };
  if (s.total === 0) note(s.hidden > 0 ? `No visible match (${s.hidden} hidden by filters).` : "No match.");
  else {
    if (s.total > s.items.length) note(`${s.total - s.items.length} more not listed; all ${s.total} are highlighted.`);
    if (s.hidden > 0) note(`${s.hidden} more hidden by filters.`);
  }
  if (s.items.length > 0) searchBox.setAttribute("aria-activedescendant", `res-${s.active}`); else searchBox.removeAttribute("aria-activedescendant");
}
/** Recomputes the matches of the current query; `keep` keeps the active row when the list did not change. Re-renders only on a change. */
function refreshSearch(keep) {
  const query = searchBox.value;
  const res = L.searchElements(app.model, query, { vis: visNow(), limit: L.MAX_RESULTS });
  const prev = app.search;
  const sig = `${query}|${res.total}|${res.hidden}|${res.items.map((i) => `${i.kind}${i.index}`).join(",")}`;
  if (keep && sig === prev.sig) return;
  const active = keep && prev.items.length > 0 ? Math.min(prev.active, Math.max(0, res.items.length - 1)) : 0;
  app.search = { query, terms: res.terms, items: res.items, all: res.all, total: res.total, hidden: res.hidden, active, sig, open: keep ? prev.open : true };
  renderResults();
  if (!keep) { say(res.terms.length === 0 ? "Search cleared." : `${res.total} match${res.total === 1 ? "" : "es"}${res.hidden > 0 ? `, ${res.hidden} hidden by filters` : ""}.`); refreshOverlay(); }
}
function centreOnTarget(t) {
  const m = app.model;
  const pts = t.kind === "node" ? [m.nodes[t.index]] : [m.nodes[m.edges[t.index].src], m.nodes[m.edges[t.index].tgt]];
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length, y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { type: "set-viewport", ...L.centreOn(stateNow().viewport, x, y) };
}
function chooseResult(i) {
  const it = app.search.items[i];
  if (it === undefined) return;
  const a = addressOf(it);
  if (act({ type: "select", mode: "replace", targets: [a] }, { type: "focus", target: a }, centreOnTarget(it))) say(`Selected ${label(it)} and centred it.`);
}
searchBox.addEventListener("input", () => refreshSearch(false));
searchBox.addEventListener("focus", () => { if (!app.search.open && app.search.terms.length > 0) { app.search.open = true; renderResults(); } });
searchBox.addEventListener("blur", () => { if (app.search.open) { app.search.open = false; renderResults(); } }); // the list closes, the matches stay highlighted until the query is cleared
searchBox.addEventListener("keydown", (e) => {
  const s = app.search;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (s.items.length === 0) return;
    e.preventDefault();
    s.open = true;
    s.active = Math.max(0, Math.min(s.items.length - 1, s.active + (e.key === "ArrowDown" ? 1 : -1)));
    renderResults(); refreshOverlay();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (s.items.length > 0) { chooseResult(s.active); s.open = false; renderResults(); }
  } else if (e.key === "Escape" && searchBox.value !== "") {
    e.preventDefault();
    searchBox.value = "";
    refreshSearch(false);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !e.ctrlKey && !e.altKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement ? document.activeElement.tagName : "")) { e.preventDefault(); searchBox.focus(); }
});

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Filters (through set-hidden)
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function buildFilters() {
  const mk = (host, items, set, kindText, swatch) => {
    for (const it of items) {
      const row = document.createElement("label"), box = document.createElement("input"), name = document.createElement("span"), n = document.createElement("span");
      row.className = "opt";
      box.type = "checkbox"; box.checked = true; box.setAttribute("aria-label", `Show ${kindText} ${it.name}`);
      box.addEventListener("change", () => { if (box.checked) set.delete(it.name); else set.add(it.name); applyFilters(); });
      row.appendChild(box);
      if (swatch) { const sw = document.createElement("span"); sw.className = "swatch"; const c = THEME.palette[Math.min(it.index, 8)]; sw.style.backgroundColor = `rgb(${c[0]},${c[1]},${c[2]})`; row.appendChild(sw); }
      name.textContent = it.name; n.className = "n"; n.textContent = String(it.count);
      row.append(name, n);
      host.appendChild(row);
    }
  };
  const types = app.model.categories.map((name, index) => ({ name, index, count: app.model.nodes.filter((n) => n.category === name).length }));
  mk($("types-set"), types, app.hiddenTypes, "nodes of type", true);
  mk($("rels-set"), L.relationCounts(app.model), app.hiddenRels, "relation", false);
}
function applyFilters() {
  const d = L.diffHidden(hiddenOf(stateNow()), L.desiredHidden(app.model, app.hiddenTypes, app.hiddenRels));
  const targets = (s) => [...s.nodes.map((i) => addressOf({ kind: "node", index: i })), ...s.edges.map((j) => addressOf({ kind: "edge", index: j }))];
  const intents = [];
  const show = targets(d.show), hide = targets(d.hide);
  if (show.length > 0) intents.push({ type: "set-hidden", targets: show, hidden: false });
  if (hide.length > 0) intents.push({ type: "set-hidden", targets: hide, hidden: true });
  if (intents.length > 0) act(...intents); else after();
  const c = L.countHidden(visNow());
  say(c.nodes + c.edges === 0 ? "Filters cleared: everything is shown." : `Filter applied: ${c.nodes} node${c.nodes === 1 ? "" : "s"} and ${c.edges} edge${c.edges === 1 ? "" : "s"} hidden.`);
}
$("clear-filters").addEventListener("click", () => {
  app.hiddenTypes.clear(); app.hiddenRels.clear();
  for (const box of document.querySelectorAll('#types-set input[type="checkbox"], #rels-set input[type="checkbox"]')) box.checked = true;
  applyFilters();
});

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Toolbar
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
$("fit").addEventListener("click", () => act({ type: "fit" }));
$("zoom-in").addEventListener("click", () => act({ type: "zoom", factor_milli: 1250 }));
$("zoom-out").addEventListener("click", () => act({ type: "zoom", factor_milli: 800 }));
$("zoom-sel").addEventListener("click", () => {
  const st = stateNow();
  const pts = L.selectionPoints(app.model, st.selection.nodes.map((n) => lookupElement(app.model, n).index), st.selection.edges.map((e) => lookupElement(app.model, e).index));
  const box = L.boxOf(pts);
  if (box === undefined) { say("Nothing selected.", true); return; }
  act({ type: "set-viewport", ...L.viewportForBox(box, st.viewport) });
});
$("host-canvas").addEventListener("click", () => switchHost("canvas"));
$("host-svg").addEventListener("click", () => switchHost("svg"));

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Minimap
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function miniTransform() {
  if (app.miniFrozen !== undefined) return app.miniFrozen;
  const { w, h } = app.miniBox;
  return L.minimapTransform(L.minimapWorld(app.model.bounds, stateNow().viewport), w, h, 8);
}
function drawMinimap() {
  const { w, h } = app.miniBox;
  const k = Math.min(8000, Math.max(250, Math.round((window.devicePixelRatio || 1) * 1000))) / 1000;
  const state = stateNow(), vp = state.viewport, T = miniTransform();
  app.miniT = T;
  mctx.setTransform(k, 0, 0, k, 0, 0);
  mctx.clearRect(0, 0, w, h);
  const vis = visNow();
  mctx.lineWidth = 1; mctx.strokeStyle = "rgba(31,35,40,.32)";
  mctx.beginPath();
  for (const e of app.model.edges) {
    if (!vis.edges[e.index]) continue;
    const a = T.toMini(app.model.nodes[e.src].x, app.model.nodes[e.src].y), b = T.toMini(app.model.nodes[e.tgt].x, app.model.nodes[e.tgt].y);
    mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y);
  }
  mctx.stroke();
  const selected = new Set(state.selection.nodes.map((n) => lookupElement(app.model, n).index));
  for (const n of app.model.nodes) {
    if (!vis.nodes[n.index]) continue;
    const p = T.toMini(n.x, n.y), c = THEME.palette[Math.min(app.model.categories.indexOf(n.category), 8)];
    mctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    mctx.beginPath(); mctx.arc(p.x, p.y, 3, 0, 2 * Math.PI); mctx.fill();
    if (selected.has(n.index)) { mctx.strokeStyle = ACCENT_INK; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(p.x, p.y, 5, 0, 2 * Math.PI); mctx.stroke(); }
  }
  const r = L.viewportRect(vp), a = T.toMini(r.x0, r.y0), b = T.toMini(r.x1, r.y1);
  mctx.fillStyle = "rgba(11,87,208,.12)"; mctx.strokeStyle = "#0b57d0"; mctx.lineWidth = 1.5;
  mctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  mctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
}
function miniPoint(e) {
  const r = mini.getBoundingClientRect();
  const p = app.miniT.fromMini(((e.clientX - r.left) * app.miniBox.w) / r.width, ((e.clientY - r.top) * app.miniBox.h) / r.height);
  return p;
}
function miniMove(e) {
  const p = miniPoint(e);
  act({ type: "set-viewport", ...L.centreOn(stateNow().viewport, p.x, p.y) });
}
mini.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  app.miniFrozen = app.miniT; // the mapping stays put while the frame is dragged
  app.miniDrag = true;
  try { mini.setPointerCapture(e.pointerId); } catch { /* inactive pointer */ }
  miniMove(e);
});
mini.addEventListener("pointermove", (e) => { if (app.miniDrag) miniMove(e); });
const miniEnd = () => { if (!app.miniDrag) return; app.miniDrag = false; app.miniFrozen = undefined; drawMinimap(); };
mini.addEventListener("pointerup", miniEnd);
mini.addEventListener("pointercancel", miniEnd);

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Start
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
async function main() {
  if (!data) { say("out/playground-data.js is missing: run `npm run demo:build`.", true); return; }
  const style = document.createElement("style");
  style.textContent = COMPANION_CSS;
  document.head.appendChild(style);
  const layoutBytes = unb64(data.layoutB64);
  try { app.model = await buildRenderModel(sceneBytes(), layoutBytes); }
  catch (e) { say(`cannot build the model: ${msg(e)} (hashing needs a secure context: https: or localhost)`, true); return; }
  app.layoutBytes = layoutBytes; app.originalSha = app.model.layoutSha256;
  indexKeys();
  await startCanvas(undefined);
  sizeOverlay(); sizeMini();
  buildFilters();
  layoutInfo();
  after();
  new ResizeObserver(() => { sizeMini(); drawMinimap(); }).observe($("minimap-box"));
  new ResizeObserver(() => {
    if (app.switching) return;
    const s = measure(), vp = stateNow().viewport;
    if (s.width === vp.width && s.height === vp.height) { sizeMini(); drawMinimap(); return; }
    const wasFit = app.atFit;
    try { app.renderer.dispatch({ type: "resize", width: s.width, height: s.height }); if (wasFit) app.renderer.dispatch({ type: "fit" }); } catch (e) { say(`resize: ${msg(e)}`, true); }
    announce([]);
    sizeOverlay(); sizeMini();
    after();
  }).observe(graph);
  reducedQuery.addEventListener("change", () => app.renderer.setReducedMotion(reducedQuery.matches));
  window.__playground = {
    ready: true,
    kind: () => app.kind,
    model: () => app.model,
    state: () => stateNow(),
    overlay: () => ({ ...app.overlayInfo }),
    drag: () => (app.drag === undefined ? null : { index: app.drag.index, moved: app.drag.moved, pos: { ...app.drag.pos } }),
    originalLayoutSha: () => app.originalSha,
    edited: () => ({ edited: app.edited, moves: app.moves }),
    search: () => ({ query: app.search.query, total: app.search.total, hidden: app.search.hidden, titles: app.search.items.map((i) => i.title), active: app.search.active }),
    minimap: () => { const r = mini.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, box: { ...app.miniBox }, toMini: app.miniT.toMini, fromMini: app.miniT.fromMini }; },
    atFit: () => app.atFit,
    idle: () => app.chain,
  };
  say(`Ready: ${app.model.nodes.length} nodes, ${app.model.edges.length} edges. Hover, drag, search, filter, zoom.`);
}
main().catch((e) => say(`error: ${msg(e)}`, true));
