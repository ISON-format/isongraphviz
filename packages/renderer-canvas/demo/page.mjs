// demo/page.mjs - the page logic of demo/index.html (NON-NORMATIVE; bundled by demo/build-demo.mjs into demo/out/demo.js).
// model -> display list painted on a <canvas> (DOM adapter) -> click -> pickDrawn -> typed address (ObjectRef) -> source identity (resolveSelection over the
// embedded source). No network, no storage, no innerHTML: every text goes through textContent.
import { buildRenderModel, resolveSelection } from "isongraph-visualize-renderer-core";
import { createDomCanvasRenderer } from "../dist/dom/index.js";

const data = window.__ISON_DEMO__;
const graph = document.getElementById("graph");
const result = document.getElementById("result");
const show = (text) => { result.textContent = text; };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function main() {
  if (!data) { show("demo/out/data.js is missing: run `npm run demo -- <file.ison> --demo` and `npm run demo:build`."); return; }
  const sceneBytes = unb64(data.sceneB64), layoutBytes = unb64(data.layoutB64), sourceBytes = unb64(data.sourceB64);
  let model;
  try { model = await buildRenderModel(sceneBytes, layoutBytes); }
  catch (e) { show(`cannot build the model: ${e && e.message ? e.message : e} (hashing needs a secure context: https: or localhost)`); return; }

  const renderer = createDomCanvasRenderer();
  window.__events = [];
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
  await renderer.initialize({ host: graph, size: data.size, reducedMotion: false, onEvent, onError: (e) => show(`error: ${e && e.message ? e.message : e}`) });
  await renderer.loadScene(model);
  show(`click a node or an edge (${model.nodes.length} nodes, ${model.edges.length} edges, source ${data.name}.ison)`);
  const dispatch = (intent) => { try { renderer.dispatch(intent); } catch (e) { show(`error: ${e && e.message ? e.message : e}`); } };
  document.getElementById("fit").addEventListener("click", () => dispatch({ type: "fit" }));
  document.getElementById("zin").addEventListener("click", () => dispatch({ type: "zoom", factor_milli: 1250 }));
  document.getElementById("zout").addEventListener("click", () => dispatch({ type: "zoom", factor_milli: 800 }));
  window.__demo = { renderer, model };
}
main().catch((e) => show(`error: ${e && e.message ? e.message : e}`));
