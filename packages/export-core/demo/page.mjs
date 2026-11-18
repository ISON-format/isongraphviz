// demo/page.mjs - the page logic of demo/index.html (NON-NORMATIVE; bundled by scripts/build-demo.mjs). A Canvas renderer (pointer, liveRegion and canvasLabel
// off), bindInteraction on its container, mountCompanion beside it, an export button and a gate button. No network, no storage, no innerHTML: every text goes
// through textContent.
import { buildRenderModel } from "isongraph-visualize-renderer-core";
import { createDomCanvasRenderer } from "isongraph-visualize-renderer-canvas/dom";
import { bindInteraction } from "isongraph-visualize-interaction-core/dom";
import { mountCompanion } from "isongraph-visualize-a11y-companion/dom";
import { COMPANION_CSS, buildCompanionTree, runAccessibilityGate } from "isongraph-visualize-a11y-companion";
import { exportBundle, verifyExportBundle, readPngBinding } from "../dist/index.js";

const data = window.__IA_DEMO__;
const graph = document.getElementById("graph");
const result = document.getElementById("result");
const show = (text) => { result.textContent = text; };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const msg = (e) => (e && e.message ? e.message : String(e));

async function main() {
  if (!data) { show("out/data.js is missing: run `npm run demo:build`."); return; }
  const style = document.createElement("style");
  style.textContent = COMPANION_CSS;
  document.head.appendChild(style);
  const layoutBytes = unb64(data.layoutB64);
  let model;
  try { model = await buildRenderModel(unb64(data.sceneB64), layoutBytes); }
  catch (e) { show(`cannot build the model: ${msg(e)} (hashing needs a secure context: https: or localhost)`); return; }
  const renderer = createDomCanvasRenderer({ pointer: "none", liveRegion: "none", canvasLabel: "none" });
  await renderer.initialize({ host: graph, size: data.size, reducedMotion: false, onError: (e) => show(`error: ${msg(e)}`) });
  await renderer.loadScene(model);
  const companion = mountCompanion(graph, { onError: (e) => show(`companion: ${msg(e)}`) });
  companion.update(model, renderer.getState());
  const itemFor = (a) => [...graph.querySelectorAll('[role="option"]')].find((el) => JSON.stringify(companion.itemAddress(el)) === JSON.stringify(a));
  const binding = bindInteraction(graph, {
    model: () => model,
    state: () => renderer.getState(),
    dispatch: (intent) => renderer.dispatch(intent),
    pick: (p) => renderer.pick(p),
    addressOfElement: (el) => companion.itemAddress(el),
    focusElement: (a) => { const el = a && itemFor(a); if (el) el.focus({ preventScroll: true }); },
    onCommit: ({ events, nav, mode }) => { companion.update(model, renderer.getState(), [...events, ...nav], mode); },
    onOutput: (o) => show(`output: ${JSON.stringify(o)}`),
    onError: (e) => show(`error: ${msg(e)}`),
  }, { adapterPointer: "none", adapterFocusRestore: "none", surface: graph.querySelector("canvas") });
  document.getElementById("fit").addEventListener("click", () => { try { renderer.dispatch({ type: "fit" }); companion.update(model, renderer.getState(), []); } catch (e) { show(`error: ${msg(e)}`); } });
  document.getElementById("export").addEventListener("click", async () => {
    try {
      const state = renderer.getState();
      const canvas = graph.querySelector("canvas");
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (JSON.stringify(renderer.getState()) !== JSON.stringify(state)) throw new Error("the state changed during capture: nothing exported");
      const png = new Uint8Array(await blob.arrayBuffer());
      const r = await exportBundle(model, state, layoutBytes, { png, expectedPngSize: { width: canvas.width, height: canvas.height } });
      await verifyExportBundle(r.files, r.manifestBytes);
      window.__export = { names: [...r.files.keys()], binding: readPngBinding(r.files.get("png")), manifest: new TextDecoder().decode(r.manifestBytes) };
      show(`export ok: ${window.__export.names.join(", ")}\n${window.__export.manifest}`);
    } catch (e) { show(`export refused: ${msg(e)}`); }
  });
  document.getElementById("gate").addEventListener("click", () => {
    try {
      const state = renderer.getState();
      const tabStops = graph.querySelectorAll('[tabindex]:not([tabindex="-1"])').length;
      const report = runAccessibilityGate({ model, state, tree: buildCompanionTree(model, state), tabStops });
      window.__gate = report;
      show(`gate verdict ${report.verdict} (tab stops counted by the page: ${tabStops})\n${JSON.stringify(report.checks.filter((c) => c.verdict !== "pass" && c.verdict !== "not-applicable"))}`);
    } catch (e) { show(`gate error: ${msg(e)}`); }
  });
  window.__demo = { renderer, model, companion, binding };
  show(`ready: ${model.nodes.length} nodes, ${model.edges.length} edges. Tab, arrows, Space, m, Enter, Escape.`);
}
main().catch((e) => show(`error: ${msg(e)}`));
