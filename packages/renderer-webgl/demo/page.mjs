// demo/page.mjs - the page logic of demo/index.html (NON-NORMATIVE; bundled by demo/build-demo.mjs into demo/out/demo.js). The demo/ pages are exempt from the
// rule that a renderer package imports no other renderer (design 15.3): the try-chain of 7.7 imports all three DOM renderers.
// model -> plan drawn by WebGL2 (DOM adapter) -> click -> pickDrawn -> typed address (ObjectRef) -> source identity (resolveSelection over the embedded source).
// The page first calls probeWebgl; on a refusal it shows the reason and mounts the Canvas renderer, then V5's DOM renderer: fallback is the HOST's, never the
// renderer's. No network, no storage, no innerHTML: every text goes through textContent. `?software=1` accepts software GL (the closed smoke seam).
import { buildRenderModel, resolveSelection } from "isongraph-visualize-renderer-core";
import { SHADER_SOURCES, probeWebgl } from "../dist/index.js";
import { createDomWebglRenderer } from "../dist/dom/index.js";
import { createDomCanvasRenderer } from "../../renderer-canvas/dist/dom/index.js";
import { createDomSvgRenderer } from "../../renderer-svg/dist/dom/index.js";

const data = window.__ISON_DEMO__;
const graph = document.getElementById("graph");
const result = document.getElementById("result");
const show = (text) => { result.textContent = text; };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const software = new URLSearchParams(location.search).get("software") === "1";

async function main() {
  if (!data) { show("demo/out/data.js is missing: run `npm run demo -- <file.ison> --demo` and `npm run demo:build`."); return; }
  const sceneBytes = unb64(data.sceneB64), layoutBytes = unb64(data.layoutB64), sourceBytes = unb64(data.sourceB64);
  let model;
  try { model = await buildRenderModel(sceneBytes, layoutBytes); }
  catch (e) { show(`cannot build the model: ${e && e.message ? e.message : e} (hashing needs a secure context: https: or localhost)`); return; }

  window.__events = [];
  window.__shaders = SHADER_SOURCES;
  const onEvent = (ev) => {
    window.__events.push(ev.type);
    if (ev.type !== "selection-changed") return;
    if (ev.selection.length === 0) { show("selection cleared"); return; }
    const ref = ev.selection[0];
    const address = "ord" in ref.address ? { edge: ref.address } : { node: ref.address };
    resolveSelection(model, address, sourceBytes).then(
      (identity) => show(`${JSON.stringify(ref)}\n${JSON.stringify(identity)}`),
      (e) => show(`${JSON.stringify(ref)}\ncannot resolve: ${e && e.message ? e.message : e}`),
    );
  };
  const env = () => ({ host: graph, size: data.size, reducedMotion: false, onEvent, onError: (e) => show(`error: ${e && e.message ? e.message : e}`) });

  // the host's own try-chain (7.7): WebGL2, then Canvas, then V5's SVG
  const probe = probeWebgl(() => document.createElement("canvas"), undefined, { failIfMajorPerformanceCaveat: !software });
  window.__probe = probe;
  const chain = [
    ["webgl", () => createDomWebglRenderer({ contextAttributes: { failIfMajorPerformanceCaveat: !software } })],
    ["canvas", () => createDomCanvasRenderer()],
    ["svg", () => createDomSvgRenderer({ svg: { idPrefix: "igr" } })],
  ];
  let renderer, kind;
  const reasons = [];
  for (const [name, make] of chain) {
    if (name === "webgl" && !probe.available) { reasons.push(`webgl: probe refused (${probe.reason})`); continue; }
    const candidate = make();
    try { await candidate.initialize(env()); renderer = candidate; kind = name; break; }
    catch (e) { reasons.push(`${name}: ${e && e.detail ? e.detail : e && e.message ? e.message : e}`); }
  }
  if (!renderer) { show(`no renderer could be mounted: ${reasons.join("; ")}`); return; }
  await renderer.loadScene(model);
  window.__demo = { renderer, model, kind, reasons };
  show(`${kind} renderer mounted${reasons.length ? ` (fallback: ${reasons.join("; ")})` : ""}: click a node or an edge (${model.nodes.length} nodes, ${model.edges.length} edges, source ${data.name}.ison)`);
  const dispatch = (intent) => { try { renderer.dispatch(intent); } catch (e) { show(`error: ${e && e.message ? e.message : e}`); } };
  document.getElementById("fit").addEventListener("click", () => dispatch({ type: "fit" }));
  document.getElementById("zin").addEventListener("click", () => dispatch({ type: "zoom", factor_milli: 1250 }));
  document.getElementById("zout").addEventListener("click", () => dispatch({ type: "zoom", factor_milli: 800 }));
}
main().catch((e) => show(`error: ${e && e.message ? e.message : e}`));
