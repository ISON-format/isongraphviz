// scripts/browser-smoke.mjs (design 17.4): Chromium through playwright-core, a secure context (http://localhost), ONE engine on ONE machine. A SMOKE run of
// the demo page (Canvas renderer with pointer/liveRegion/canvasLabel off + bindInteraction + mountCompanion + export + gate, and the `toggle SVG` host of 17.2
// and 9.7: the V5 adapter with pointer/liveRegion/focusRestore off, no companion, the svg-native gate); not a conformance or qualification claim. Needs
// `npm run build` and `npm run demo:build` first, and a Chromium for playwright-core.
// Asserted on Canvas: no console error; a press on empty space with a selection and with shift, ctrl and alt keeps the selection (the adapter's own press handling
// is off); Tab enters the companion (exactly one [role=option][tabindex=0], DOM focus on it, semantic focus agrees); ArrowRight moves the semantic focus, the
// companion's tab stop agrees and the live region does not repeat the focused name; Space sets aria-selected=true; m, ArrowRight, Enter select the marquee;
// Escape clears; Tab again leaves the widget; the export button builds a bundle whose PNG carries the binding chunk; the gate button reports a verdict.
// Asserted on the SVG host (after toggle SVG; a selection and the focus survive the toggle): no canvas, no companion, one SVG document, one live region, one Tab
// stop that is an element of the SVG; Tab enters it with DOM focus equal to the semantic focus; a DOM focus on another element moves the semantic focus (focus
// entry); after EVERY arrow step DOM focus, semantic focus and the one tabindex=0 name the same element; Space selects (class igr-selected, NO aria-selected: it is
// not valid on graphics-symbol, 9.7), Escape clears; a shift+arrow step leaves the live text `1 selected.`; the marquee keys work; a click on a node selects it and a
// press with a selection and any modifier keeps it; the gate (svg-native: G9-MAP and G11-PAGE pass) and the export (no PNG) run; Tab leaves; toggling back restores
// the companion with one Tab stop and working keys.
// NOT claimed: cross-browser behaviour, assistive technology, touch, visual quality, performance, that a press on an SVG node moves the semantic focus (it does not in this
// Chromium run, finding C-2: reported by the script, not asserted), that the focusRestore option has an observable effect through the binder's flow (it does not: the page
// source test pins the option), the pan reveal with a zoomed-in viewport, reduced motion, a real wheel, a real drag, or the click-to-focus-container step of 17.4.
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`BROWSER SMOKE FAIL: ${m}`); process.exitCode = 1; };
const html = readFileSync(join(PKG, "demo", "index.html"), "utf8");
const files = { "/out/data.js": ["text/javascript", readFileSync(join(PKG, "demo", "out", "data.js"))], "/out/demo.js": ["text/javascript", readFileSync(join(PKG, "demo", "out", "demo.js"))], "/": ["text/html", html] };
const server = http.createServer((q, s) => { const f = files[q.url]; if (!f) { s.statusCode = 404; s.end("not found"); return; } s.setHeader("content-type", f[0]); s.end(f[1]); }).listen(0, "127.0.0.1");
await new Promise((res) => server.once("listening", res));
const url = `http://localhost:${server.address().port}/`;
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 15000 });
  const st = () => page.evaluate(() => window.__demo.renderer.getState());
  const sel = async () => { const s = await st(); return [...s.selection.nodes.map((n) => n.id), ...s.selection.edges.map((e) => e.ord)].sort(); };
  const focusId = async () => { const f = (await st()).focus; return f === undefined ? null : "node" in f ? f.node.id : "edge"; };
  const check = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
  const box = await page.locator("#graph canvas").boundingBox();
  const tabStops = () => page.evaluate(() => document.querySelectorAll('#graph [role="option"][tabindex="0"]').length);
  const activeIsStop = () => page.evaluate(() => document.activeElement && document.activeElement.getAttribute("role") === "option" && document.activeElement.getAttribute("tabindex") === "0");
  const live = () => page.evaluate(() => document.querySelector('#graph [role="status"]').textContent);

  // select node a by Tab + Space, then press on empty space with each modifier: the selection is kept
  await page.focus("#toggle"); // the last control before the widget
  await page.keyboard.press("Tab");
  check("one tab stop", await tabStops(), 1);
  check("DOM focus on the tab stop", await activeIsStop(), true);
  check("semantic focus after Tab (focus entry)", await focusId(), "s:a");
  await page.keyboard.press("Space");
  check("Space selects", await sel(), ["s:a"]);
  check("aria-selected", await page.evaluate(() => document.querySelector('#graph [role="option"][tabindex="0"]').getAttribute("aria-selected")), "true");
  for (const mod of [null, "Shift", "Control", "Alt"]) {
    if (mod) await page.keyboard.down(mod);
    await page.mouse.move(box.x + 880, box.y + 590); await page.mouse.down();
    check(`selection kept at the press with ${mod ?? "no modifier"}`, await sel(), ["s:a"]);
    await page.mouse.up();
    if (mod) await page.keyboard.up(mod);
    if (mod === null) check("a plain click on empty space clears (release)", await sel(), []);
    if (mod === null) { await page.evaluate(() => document.querySelector('#graph [role="option"][tabindex="0"]').focus()); await page.keyboard.press("Space"); }
  }
  // keys
  await page.evaluate(() => document.querySelector('#graph [role="option"][tabindex="0"]').focus());
  const before = await focusId();
  await page.keyboard.press("ArrowRight");
  const after = await focusId();
  if (after === before) fail("ArrowRight did not move the semantic focus");
  check("one tab stop after the move", await tabStops(), 1);
  check("DOM focus follows semantic focus", await activeIsStop(), true);
  if ((await live()).includes("p ")) fail(`the live region repeats the focused name: ${await live()}`);
  await page.keyboard.press("Escape");
  check("Escape clears the selection", await sel(), []);
  await page.keyboard.press("m"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  if ((await sel()).length === 0) fail("the marquee selected nothing");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  check("Tab leaves the widget (no trap)", await page.evaluate(() => document.activeElement.closest("#graph") === null), true);
  // export and gate
  await page.click("#export");
  await page.waitForFunction(() => window.__export !== undefined || /export refused/.test(document.getElementById("result").textContent), null, { timeout: 15000 });
  const ex = await page.evaluate(() => window.__export);
  if (!ex) fail(`export refused: ${await page.evaluate(() => document.getElementById("result").textContent)}`);
  else { check("export files", ex.names.sort(), ["layout", "png", "scene", "state", "svg"]); if (!ex.binding || ex.binding.scene.length !== 64) fail("the PNG binding chunk is missing"); }
  await page.click("#gate");
  const gate = await page.evaluate(() => window.__gate && window.__gate.verdict);
  console.log(`gate verdict on the page: ${gate}`);
  // ---- the SVG host (design 17.2 item four, 9.7, 17.4 last sentence): the V5 adapter (pointer, liveRegion and focusRestore off) in place of Canvas + companion ----
  // a selection made on Canvas must survive the toggle (the page loads the new renderer with the current state)
  await page.evaluate(() => document.querySelector('#graph [role="option"][tabindex="0"]').focus());
  await page.keyboard.press("Space");
  const selCanvas = await sel();
  if (selCanvas.length !== 1) fail(`one element selected on Canvas before the toggle, got ${JSON.stringify(selCanvas)}`);
  const focusCanvas = await page.evaluate(() => JSON.stringify(window.__demo.renderer.getState().focus));
  await page.click("#toggle");
  await page.waitForFunction(() => window.__demo.kind === "svg", null, { timeout: 15000 });
  check("no canvas, no companion, one SVG document in the host", await page.evaluate(() => [document.querySelectorAll("#graph canvas").length, document.querySelectorAll('#graph [role="option"]').length, document.querySelectorAll("#graph svg").length]), [0, 0, 1]);
  check("the selection and the focus survive the toggle", [await sel(), await page.evaluate(() => JSON.stringify(window.__demo.renderer.getState().focus))], [selCanvas, focusCanvas]);
  const svgStops = () => page.evaluate(() => document.querySelectorAll('#graph [tabindex]:not([tabindex="-1"])').length);
  const svgStopIsG = () => page.evaluate(() => [...document.querySelectorAll('#graph [tabindex]:not([tabindex="-1"])')].every((e) => e.matches("svg g.igr-node, svg g.igr-edge")));
  const domFocusMatchesSemantic = () => page.evaluate(() => { const a = document.activeElement; return a !== null && a.matches("svg g.igr-node, svg g.igr-edge") && a.getAttribute("id") === window.__demo.focusedDomId(); });
  const svgSelectedIds = () => page.evaluate(() => [...document.querySelectorAll("#graph g.igr-selected")].map((e) => e.getAttribute("id")).sort());
  const svgLive = () => page.evaluate(() => document.querySelector('#graph [role="status"]').textContent);
  const noAriaSelected = () => page.evaluate(() => document.querySelectorAll("#graph [aria-selected]").length);
  check("one live region only (the adapter's own status div is off; the page's own element is the one)", await page.evaluate(() => [document.querySelectorAll('#graph [role="status"], #graph [aria-live]').length, document.querySelector('#graph [role="status"]').getAttribute("class")]), [1, "demo-status"]);
  check("the selected element carries the class igr-selected (and only it)", (await svgSelectedIds()).length, 1);
  check("aria-selected is on no SVG element (30 8.4: not valid on graphics-symbol; 9.7 not_claimed selection-state-in-svg)", await noAriaSelected(), 0);
  check("one tab stop, an element of the SVG (its own tabindex 0)", [await svgStops(), await svgStopIsG()], [1, true]);
  await page.focus("#toggle");
  await page.keyboard.press("Tab");
  check("Tab enters the SVG: DOM focus on the tab stop, equal to the semantic focus", await domFocusMatchesSemantic(), true);
  check("still one tab stop after Tab", await svgStops(), 1);
  // the focus entry rule on the SVG host: DOM focus on another element moves the semantic focus there
  const other = await page.evaluate(() => { const e = document.querySelector('#graph g.igr-node[tabindex="-1"]'); if (!e) return null; e.focus(); return e.getAttribute("id"); });
  if (other === null) fail("no second node to focus");
  check("focus entry: the semantic focus follows a DOM focus, DOM focus stays on that element", [await page.evaluate(() => window.__demo.focusedDomId()), await domFocusMatchesSemantic(), await svgStops()], [other, true, 1]);
  // arrows: after EVERY one DOM focus and semantic focus name the same element (the adapter's restoration is off, the binder moves DOM focus)
  // arrows are spatial: a step toward nothing does not move, so each step tries ArrowRight then ArrowLeft and needs one of them to move
  for (let step = 1; step <= 4; step++) {
    const prev = await page.evaluate(() => window.__demo.focusedDomId());
    let moved = null;
    for (const key of ["ArrowRight", "ArrowLeft"]) {
      await page.keyboard.press(key);
      check(`DOM focus follows semantic focus after ${key} (step ${step})`, await domFocusMatchesSemantic(), true);
      if ((await page.evaluate(() => window.__demo.focusedDomId())) !== prev) { moved = key; break; }
    }
    if (moved === null) fail(`step ${step}: neither ArrowRight nor ArrowLeft moved the semantic focus on the SVG host`);
    check(`one tab stop, an SVG element, after ${moved} (step ${step})`, [await svgStops(), await svgStopIsG()], [1, true]);
    check(`the tab stop is the focused element after ${moved} (step ${step})`, await page.evaluate(() => document.querySelector('#graph [tabindex="0"]').getAttribute("id") === window.__demo.focusedDomId()), true);
  }
  // Escape clears, Space selects (the same keys as on Canvas)
  await page.keyboard.press("Escape");
  check("Escape clears the selection (SVG host)", [await sel(), await svgSelectedIds()], [[], []]);
  await page.keyboard.press("Space");
  const focusedNow = await page.evaluate(() => window.__demo.focusedDomId());
  check("Space selects the focused element (SVG host): the semantic state and the igr-selected class agree", [(await sel()).length, await svgSelectedIds()], [1, [focusedNow]]);
  check("Space: still no aria-selected on the SVG host", await noAriaSelected(), 0);
  check("DOM focus survives the select commit (the SVG document is replaced)", await domFocusMatchesSemantic(), true);
  await page.keyboard.press("Escape");
  // one onCommit per step: a shift+arrow step leaves the live text of that step
  let shiftText = "";
  for (const key of ["Shift+ArrowRight", "Shift+ArrowLeft"]) { // spatial: the focus may be at the right-most node
    await page.keyboard.press(key);
    shiftText = await svgLive();
    check(`${key}: DOM focus equals semantic focus`, await domFocusMatchesSemantic(), true);
    if ((await sel()).length > 0) break;
  }
  check("a shift+arrow step on the SVG host: the live text of that step (one onCommit per step)", shiftText, "1 selected.");
  await page.keyboard.press("Escape");
  // the corner marquee
  await page.keyboard.press("m"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  if ((await sel()).length === 0) fail("the marquee selected nothing on the SVG host");
  await page.keyboard.press("Escape");
  check("Escape clears the marquee selection (SVG host)", await sel(), []);
  check("DOM focus equals semantic focus after the marquee", await domFocusMatchesSemantic(), true);
  // pointer: a click on a node selects and focuses it; a press with a selection and any modifier keeps it (the adapter's own press handling is off)
  const nodeBox = await page.locator("#graph g.igr-node").first().boundingBox();
  const nodeId = await page.locator("#graph g.igr-node").first().getAttribute("id");
  await page.mouse.click(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
  check("a click on a node selects exactly that node (SVG host)", await svgSelectedIds(), [nodeId]);
  // design 5.8/9.7 say a press on an SVG g focuses it semantically; in Chromium the binder's preventDefault on the handled pointerdown suppresses the browser's focus
  // move (finding C-2), so this is reported and NOT asserted; what is asserted is that DOM focus and semantic focus agree (DOM focus was inside the widget)
  console.log(`SVG host click on a node: the semantic focus is ${(await page.evaluate(() => window.__demo.focusedDomId())) === nodeId ? "the clicked node" : "NOT the clicked node (finding C-2)"}`);
  check("after a click on a node: DOM focus and semantic focus agree", await domFocusMatchesSemantic(), true);
  let kept = await sel();
  const sbox = await page.locator("#graph svg").boundingBox();
  for (const mod of [null, "Shift", "Control", "Alt"]) {
    if (mod) await page.keyboard.down(mod);
    await page.mouse.move(sbox.x + 880, sbox.y + 590); await page.mouse.down();
    check(`SVG host: selection kept at the press with ${mod ?? "no modifier"}`, await sel(), kept);
    await page.mouse.up();
    if (mod) await page.keyboard.up(mod);
    if (mod === null) check("SVG host: a plain click on empty space clears (release)", await sel(), []);
    if (mod === null) { await page.evaluate(() => document.querySelector('#graph [tabindex="0"]').focus()); await page.keyboard.press("Space"); kept = await sel(); }
  }
  // the gate and the export on the SVG host
  await page.click("#gate");
  const svgGate = await page.evaluate(() => window.__gate);
  console.log(`gate verdict on the SVG host (svg-native): ${svgGate && svgGate.verdict}`);
  for (const id of ["G9-MAP", "G11-PAGE"]) check(`svg-native ${id}`, svgGate && svgGate.checks.find((c) => c.id === id).verdict, "pass");
  await page.evaluate(() => { window.__export = undefined; });
  await page.click("#export");
  await page.waitForFunction(() => window.__export !== undefined || /export refused/.test(document.getElementById("result").textContent), null, { timeout: 15000 });
  const exSvg = await page.evaluate(() => window.__export);
  if (!exSvg) fail(`export refused on the SVG host: ${await page.evaluate(() => document.getElementById("result").textContent)}`);
  else check("export files on the SVG host (no PNG: there is no canvas)", exSvg.names.sort(), ["layout", "scene", "state", "svg"]);
  // Tab leaves the widget (no trap)
  await page.evaluate(() => document.querySelector('#graph [tabindex="0"]').focus());
  await page.keyboard.press("Tab");
  check("Tab leaves the SVG widget (no trap)", await page.evaluate(() => document.activeElement.closest("#graph") === null), true);
  // toggle back to Canvas: the companion returns, one tab stop, the keys work again
  await page.click("#toggle");
  await page.waitForFunction(() => window.__demo.kind === "canvas", null, { timeout: 15000 });
  check("back on Canvas: one canvas, no SVG, a companion", await page.evaluate(() => [document.querySelectorAll("#graph canvas").length, document.querySelectorAll("#graph svg").length, document.querySelectorAll('#graph [role="option"]').length > 0]), [1, 0, true]);
  await page.focus("#toggle");
  await page.keyboard.press("Tab");
  check("back on Canvas: one tab stop, DOM focus on it", [await tabStops(), await activeIsStop()], [1, true]);
  const beforeBack = await focusId();
  await page.keyboard.press("ArrowRight");
  if ((await focusId()) === beforeBack) await page.keyboard.press("ArrowLeft"); // spatial: the carried focus may be the right-most node
  if ((await focusId()) === beforeBack) fail("back on Canvas: neither ArrowRight nor ArrowLeft moved the semantic focus");
  check("back on Canvas: DOM focus follows semantic focus", await activeIsStop(), true);
  if (errors.length > 0) fail(`console errors: ${errors.join(" | ")}`);
  if (!process.exitCode) console.log(`browser smoke ok (Chromium ${browser.version()}, one engine, smoke only)`);
} catch (e) { fail(String(e && e.stack ? e.stack : e)); } finally { if (browser) await browser.close(); server.close(); }
