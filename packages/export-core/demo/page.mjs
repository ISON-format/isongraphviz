// demo/page.mjs - the page logic of demo/index.html (NON-NORMATIVE; bundled by scripts/build-demo.mjs). Design 17.2. Two hosts for one model and one set of keys.
// Canvas host: a Canvas renderer (pointer, liveRegion and canvasLabel off), bindInteraction on its container, mountCompanion beside it.
// SVG host (the `toggle SVG` button, 9.7): the V5 renderer-svg `./dom` adapter built with pointer, liveRegion and focusRestore off, bindInteraction on the same
// container, NO companion (the SVG's own ARIA elements are the accessible tree and its roving tabindex the one Tab stop), the binder moving DOM focus
// through focusElement, an own status element written from liveText, and the `svg-native` gate composition. The current semantic state is carried across the
// toggle. Buttons: fit, export bundle, gate, toggle SVG. No network, no storage, no innerHTML: every text goes through textContent.
import { buildRenderModel } from "isongraph-visualize-renderer-core";
import { createDomCanvasRenderer } from "isongraph-visualize-renderer-canvas/dom";
import { createDomSvgRenderer } from "isongraph-visualize-renderer-svg/dom";
import { decodeElementId, elementDomId, pickElement, readSvg } from "isongraph-visualize-renderer-svg";
import { bindInteraction } from "isongraph-visualize-interaction-core/dom";
import { mountCompanion } from "isongraph-visualize-a11y-companion/dom";
import { COMPANION_CSS, buildCompanionTree, liveText, runAccessibilityGate } from "isongraph-visualize-a11y-companion";
import { exportBundle, verifyExportBundle, readPngBinding } from "../dist/index.js";

const data = window.__IA_DEMO__;
const graph = document.getElementById("graph");
const result = document.getElementById("result");
const show = (text) => { result.textContent = text; };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const msg = (e) => (e && e.message ? e.message : String(e));
const SVG_PREFIX = "igr"; // the V5 adapter's default idPrefix: the ids of the SVG's own elements

async function main() {
  if (!data) { show("out/data.js is missing: run `npm run demo:build`."); return; }
  const style = document.createElement("style");
  style.textContent = COMPANION_CSS;
  document.head.appendChild(style);
  const layoutBytes = unb64(data.layoutB64);
  let model;
  try { model = await buildRenderModel(unb64(data.sceneB64), layoutBytes); }
  catch (e) { show(`cannot build the model: ${msg(e)} (hashing needs a secure context: https: or localhost)`); return; }
  const env = () => ({ host: graph, size: data.size, reducedMotion: false, onError: (e) => show(`error: ${msg(e)}`) });
  // the live host: kind is "canvas" or "svg"; the other members are the current host's (companion and status exist on one host each)
  const demo = { kind: "canvas", renderer: undefined, model, companion: undefined, binding: undefined, status: undefined, focusedDomId: undefined };
  demo.focusedDomId = () => { const f = demo.renderer.getState().focus; return f === undefined ? null : elementDomId(SVG_PREFIX, f); };
  const common = {
    model: () => model,
    state: () => demo.renderer.getState(),
    dispatch: (intent) => demo.renderer.dispatch(intent),
    onOutput: (o) => show(`output: ${JSON.stringify(o)}`),
    onError: (e) => show(`error: ${msg(e)}`),
  };

  async function startCanvas(initial) {
    const renderer = createDomCanvasRenderer({ pointer: "none", liveRegion: "none", canvasLabel: "none" });
    await renderer.initialize(env());
    await renderer.loadScene(model, initial);
    const companion = mountCompanion(graph, { onError: (e) => show(`companion: ${msg(e)}`) });
    companion.update(model, renderer.getState());
    demo.renderer = renderer; demo.companion = companion; demo.status = undefined; demo.kind = "canvas";
    const itemFor = (a) => [...graph.querySelectorAll('[role="option"]')].find((el) => JSON.stringify(companion.itemAddress(el)) === JSON.stringify(a));
    demo.binding = bindInteraction(graph, {
      ...common,
      pick: (p) => renderer.pick(p),
      addressOfElement: (el) => companion.itemAddress(el),
      focusElement: (a) => { const el = a && itemFor(a); if (el) el.focus({ preventScroll: true }); },
      onCommit: ({ events, nav, mode }) => { companion.update(model, renderer.getState(), [...events, ...nav], mode); },
    }, { adapterPointer: "none", adapterFocusRestore: "none", surface: graph.querySelector("canvas") });
  }

  async function startSvg(initial) {
    const renderer = createDomSvgRenderer({ pointer: "none", liveRegion: "none", focusRestore: "none" });
    await renderer.initialize(env());
    // the adapter's own status div is off (it would speak the focused name again); the host writes one status text per step from liveText (9.7)
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    status.setAttribute("class", "demo-status");
    graph.insertBefore(status, graph.firstChild);
    await renderer.loadScene(model, initial);
    demo.renderer = renderer; demo.companion = undefined; demo.status = status; demo.kind = "svg";
    const elementOf = (el) => (el && typeof el.closest === "function" ? el.closest("g.igr-node, g.igr-edge") : null);
    // the adapter replaces its svg element on every commit, so `surface` cannot be a fixed element: this object names whichever svg is mounted (finding C-1)
    const surface = { getBoundingClientRect: () => { const s = graph.querySelector("svg"); return s ? s.getBoundingClientRect() : new DOMRect(0, 0, 0, 0); } };
    demo.binding = bindInteraction(graph, {
      ...common,
      pick: (p) => pickElement(model, renderer.getState(), SVG_PREFIX, { point: p }),
      addressOfElement: (el) => { const g = elementOf(el); const id = g === null ? null : g.getAttribute("id"); return typeof id === "string" ? decodeElementId(SVG_PREFIX, id) : undefined; },
      focusElement: (a) => { const el = a && document.getElementById(elementDomId(SVG_PREFIX, a)); if (el) el.focus({ preventScroll: true }); },
      onCommit: ({ events, nav }) => { status.textContent = liveText([...events, ...nav], model, renderer.getState(), { omitFocusAnnouncement: true }); },
    }, { adapterPointer: "none", adapterFocusRestore: "none", surface });
  }

  // the old host goes first (binder, companion, status), then its renderer; the companion is a child of the host the Canvas renderer restores
  async function teardown() {
    demo.binding.dispose();
    if (demo.companion) demo.companion.dispose();
    if (demo.status && demo.status.parentNode === graph) graph.removeChild(demo.status);
    await demo.renderer.dispose();
  }

  await startCanvas(undefined);
  let busy = false;
  document.getElementById("toggle").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      const state = demo.renderer.getState();
      const to = demo.kind === "canvas" ? "svg" : "canvas";
      await teardown();
      if (to === "svg") await startSvg(state); else await startCanvas(state);
      show(to === "svg"
        ? "SVG host: the V5 adapter's own ARIA elements (no companion), one Tab stop, the same keys. aria-selected is not valid on graphics-symbol (30 8.4): the selection class is igr-selected."
        : "Canvas host: the companion is back, the same keys.");
    } catch (e) { show(`toggle failed: ${msg(e)}`); }
    finally { busy = false; }
  });
  document.getElementById("fit").addEventListener("click", () => {
    try { demo.renderer.dispatch({ type: "fit" }); if (demo.companion) demo.companion.update(model, demo.renderer.getState(), []); } catch (e) { show(`error: ${msg(e)}`); }
  });
  document.getElementById("export").addEventListener("click", async () => {
    try {
      const renderer = demo.renderer;
      const state = renderer.getState();
      const canvas = demo.kind === "canvas" ? graph.querySelector("canvas") : null; // the SVG host has no canvas: its bundle has no PNG
      let options;
      if (canvas) {
        const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
        if (JSON.stringify(renderer.getState()) !== JSON.stringify(state)) throw new Error("the state changed during capture: nothing exported");
        options = { png: new Uint8Array(await blob.arrayBuffer()), expectedPngSize: { width: canvas.width, height: canvas.height } };
      }
      const r = await exportBundle(model, state, layoutBytes, options);
      await verifyExportBundle(r.files, r.manifestBytes);
      window.__export = { names: [...r.files.keys()], binding: r.files.has("png") ? readPngBinding(r.files.get("png")) : undefined, manifest: new TextDecoder().decode(r.manifestBytes) };
      show(`export ok: ${window.__export.names.join(", ")}\n${window.__export.manifest}`);
    } catch (e) { show(`export refused: ${msg(e)}`); }
  });
  document.getElementById("gate").addEventListener("click", () => {
    try {
      const state = demo.renderer.getState();
      const tabStops = graph.querySelectorAll('[tabindex]:not([tabindex="-1"])').length;
      let report;
      if (demo.kind === "svg") {
        // the names, tabindex values and root title and description of the document the adapter mounted (a readSvg result), no companion tree
        const ro = readSvg(demo.renderer.svg());
        report = runAccessibilityGate({ model, state, composition: "svg-native", svg: { root: { title: ro.title, desc: ro.desc }, items: [...ro.nodes, ...ro.edges].map((x) => ({ name: x.name, tabindex: Number(x.tabindex) })) }, tabStops });
      } else report = runAccessibilityGate({ model, state, tree: buildCompanionTree(model, state), tabStops });
      window.__gate = report;
      show(`gate verdict ${report.verdict} (${demo.kind} host; tab stops counted by the page: ${tabStops})\n${JSON.stringify(report.checks.filter((c) => c.verdict !== "pass" && c.verdict !== "not-applicable"))}`);
    } catch (e) { show(`gate error: ${msg(e)}`); }
  });
  window.__demo = demo;
  show(`ready: ${model.nodes.length} nodes, ${model.edges.length} edges. Tab, arrows, Space, m, Enter, Escape. "toggle SVG" swaps the host.`);
}
main().catch((e) => show(`error: ${msg(e)}`));
