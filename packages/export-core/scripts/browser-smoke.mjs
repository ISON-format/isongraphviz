// scripts/browser-smoke.mjs (design 17.4): Chromium through playwright-core, a secure context (http://localhost), ONE engine on ONE machine. A SMOKE run of
// the demo page (Canvas renderer with pointer/liveRegion/canvasLabel off + bindInteraction + mountCompanion + export + gate); not a conformance or qualification
// claim. Needs `npm run build` and `npm run demo:build` first, and a Chromium for playwright-core.
// Asserted: no console error; a press on empty space with a selection and with shift, ctrl and alt keeps the selection (the adapter's own press handling is
// off); Tab enters the companion (exactly one [role=option][tabindex=0], DOM focus on it, semantic focus agrees); ArrowRight moves the semantic focus, the
// companion's tab stop agrees and the live region does not repeat the focused name; Space sets aria-selected=true; m, ArrowRight, Enter select the marquee;
// Escape clears; Tab again leaves the widget; the export button builds a bundle whose PNG carries the binding chunk; the gate button reports a verdict.
// NOT claimed: cross-browser behaviour, assistive technology, touch, visual quality, performance, the toggle-to-SVG page of design 17.2 (not built).
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
  await page.focus("#gate"); // the last control before the widget
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
  if (errors.length > 0) fail(`console errors: ${errors.join(" | ")}`);
  if (!process.exitCode) console.log(`browser smoke ok (Chromium ${browser.version()}, one engine, smoke only)`);
} catch (e) { fail(String(e && e.stack ? e.stack : e)); } finally { if (browser) await browser.close(); server.close(); }
