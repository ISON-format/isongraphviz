// demo/page.mjs - the page logic of demo/index.html (NON-NORMATIVE; bundled by demo/build-demo.mjs into demo/out/demo.js).
// A headless renderer holds the semantic state; bindInteraction turns DOM events into intents and dispatches them; a tiny painter draws the state. No network,
// no storage, no innerHTML: every text goes through textContent.
import { buildRenderModel, hitTest, initialState, layoutToScreen } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import { bindInteraction } from "../dist/dom/index.js";

const data = window.__IA_DEMO__;
const stage = document.getElementById("stage");
const cv = document.getElementById("cv");
const result = document.getElementById("result");
const show = (text) => { result.textContent = text; };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const key = (a) => JSON.stringify(a);

async function main() {
  if (!data) { show("demo/out/data.js is missing: run `npm run demo -- <scene.json> <layout.json> --page` and `npm run demo:build`."); return; }
  let model;
  try { model = await buildRenderModel(unb64(data.sceneB64), unb64(data.layoutB64)); }
  catch (e) { show(`cannot build the model: ${e && e.message ? e.message : e} (hashing needs a secure context: https: or localhost)`); return; }
  const size = data.size;
  const renderer = createHeadlessRenderer();
  await renderer.initialize({ host: "headless", size, reducedMotion: false, onError: (e) => show(`error: ${e && e.message ? e.message : e}`) });
  await renderer.loadScene(model, initialState(model, size));
  const ctx = cv.getContext("2d");
  let lasso;
  const log = [];

  const paint = () => {
    const st = renderer.getState();
    const p = renderer.probe();
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.lineWidth = 1; ctx.strokeStyle = "#667";
    const at = (n) => layoutToScreen(st.viewport, n);
    const drawnE = new Set(p.drawn.edges.map(key)), drawnN = new Set(p.drawn.nodes.map(key));
    for (const e of model.edges) {
      if (!drawnE.has(key(e.ref))) continue;
      const a = at(model.nodes[e.src]), b = at(model.nodes[e.tgt]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const sel = new Set(st.selection.nodes.map(key));
    const selE = new Set(st.selection.edges.map(key));
    for (const e of model.edges) {
      if (!selE.has(key(e.ref))) continue;
      const a = at(model.nodes[e.src]), b = at(model.nodes[e.tgt]);
      ctx.lineWidth = 3; ctx.strokeStyle = "#c60"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const n of model.nodes) {
      if (!drawnN.has(key(n.ref))) continue;
      const c = at(n);
      ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, 2 * Math.PI);
      ctx.fillStyle = sel.has(key(n.ref)) ? "#c60" : "#9ab"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "#223"; ctx.stroke();
      if (st.focus && "node" in st.focus && key(st.focus.node) === key(n.ref)) { ctx.lineWidth = 3; ctx.strokeStyle = "#06c"; ctx.beginPath(); ctx.arc(c.x, c.y, 15, 0, 2 * Math.PI); ctx.stroke(); }
    }
    if (st.focus && "edge" in st.focus) {
      const e = model.edges.find((x) => key(x.ref) === key(st.focus.edge));
      const a = at(model.nodes[e.src]), b = at(model.nodes[e.tgt]);
      ctx.lineWidth = 2; ctx.strokeStyle = "#06c"; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }
    if (lasso) { ctx.lineWidth = 1; ctx.strokeStyle = "#06c"; ctx.setLineDash([4, 3]); ctx.strokeRect(lasso.x0 / 1000, lasso.y0 / 1000, (lasso.x1 - lasso.x0) / 1000, (lasso.y1 - lasso.y0) / 1000); ctx.setLineDash([]); }
  };

  const target = {
    model: () => model,
    state: () => renderer.getState(),
    dispatch: (intent) => renderer.dispatch(intent),
    pick: (pt) => hitTest(model, renderer.getState(), pt),
    addressOfElement: () => undefined, // the demo has no accessible element surface (no companion)
    focusElement: () => {},
    onCommit: (info) => { log.unshift({ events: info.events.map((e) => e.type), nav: info.nav.map((e) => e.type), mode: info.mode }); log.length = Math.min(log.length, 6); paint(); show(JSON.stringify(log[0])); },
    onOutput: (o) => {
      if (o.kind === "lasso-preview") { lasso = o.rect; paint(); }
      else if (o.kind === "lasso-end") { lasso = undefined; paint(); }
      else show(JSON.stringify(o));
    },
    onError: (e) => show(`error: ${e && e.message ? e.message : e}`),
  };
  const binding = bindInteraction(stage, target, { adapterPointer: "none", adapterFocusRestore: "none", surface: cv });
  document.getElementById("fit").addEventListener("click", () => { try { renderer.dispatch({ type: "fit" }); paint(); } catch (e) { show(`error: ${e && e.message ? e.message : e}`); } });
  paint();
  show(`${model.nodes.length} nodes, ${model.edges.length} edges (${data.name}); click, drag, wheel, or Tab and use the keys`);
  window.__demo = { renderer, model, binding, log, screenOf: (n) => layoutToScreen(renderer.getState().viewport, n) };
}
main().catch((e) => show(`error: ${e && e.message ? e.message : e}`));
