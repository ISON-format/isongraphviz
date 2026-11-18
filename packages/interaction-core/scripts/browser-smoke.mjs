// scripts/browser-smoke.mjs (design 17.4): Chromium through playwright-core, a secure context (http://localhost), ONE engine on ONE machine. This is a SMOKE run of
// the DOM binder (bindInteraction) on the demo page, not a conformance or qualification claim: it shows that real pointer, wheel and key events reach the machine
// and become dispatched intents. Needs `npm run build` here (the page imports dist/) and a Chromium: `./node_modules/.bin/playwright-core install chromium` once.
//
// Asserted: no console error; a real click selects, shift adds, ctrl toggles; a PRESS on empty space with a selection and with each of shift, ctrl, alt changes
// nothing (the selection is kept until the release; there is no press-time handler: the adapter's own is off), a release keeps the selection for shift and
// ctrl and clears it for none and alt (5.3: a modified click on empty space is inert, alt is ignored); alt-drag selects the lasso rectangle of row I23; one wheel
// notch zooms in through a dispatched zoom intent; a real drag pans; a double click fits; Tab enters the widget (one tab stop, DOM focus on it), the arrows move the
// SEMANTIC focus, the reveal pan keeps the focused node inside the margin box, Space selects, m + arrows + Enter selects the marquee, Escape clears, ctrl+a selects
// all, Tab again leaves the widget (no trap); clicking the canvas gives the container DOM focus. NOT claimed: cross-browser behaviour, touch or pinch on a real
// device, assistive technology, visual quality, performance, IME or non-US layouts, that a real wheel maps to the grammar identically in every engine.
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-ia");
const fail = (m) => { console.error(`BROWSER SMOKE FAIL: ${m}`); process.exitCode = 1; };
const b64 = (rel) => readFileSync(join(ORACLES, rel)).toString("base64");

const data = `window.__IA_DEMO__ = ${JSON.stringify({ name: "G9", size: { width: 900, height: 600 }, sceneB64: b64("scenes/G9.scene.json"), layoutB64: b64("layouts/G9.layout.json") })};\n`;
const bundle = (await build({ entryPoints: [join(PKG, "demo", "page.mjs")], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "error", target: "es2022" })).outputFiles[0].text;
const html = readFileSync(join(PKG, "demo", "index.html"), "utf8");
const server = http.createServer((q, s) => {
  const send = (type, body) => { s.setHeader("content-type", type); s.end(body); };
  if (q.url === "/out/data.js") send("text/javascript", data);
  else if (q.url === "/out/demo.js") send("text/javascript", bundle);
  else if (q.url === "/" || q.url === "/index.html") send("text/html", html);
  else { s.statusCode = 404; s.end("not found"); }
}).listen(0, "127.0.0.1");
await new Promise((res) => server.once("listening", res));
const url = `http://localhost:${server.address().port}/`;

const ids = (set) => [...set.nodes.map((n) => n.id), ...set.edges.map((e) => `${e.src.id}>${e.tgt.id}`)].sort();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 15000 });
  if (!(await page.evaluate(() => window.isSecureContext))) fail("the page is not a secure context");

  const state = () => page.evaluate(() => window.__demo.renderer.getState());
  const box = await page.locator("#cv").boundingBox();
  const at = (x, y) => [box.x + x, box.y + y];
  const move = (x, y) => page.mouse.move(...at(x, y));
  const click = async (x, y, mods = []) => { for (const m of mods) await page.keyboard.down(m); await move(x, y); await page.mouse.down(); await page.mouse.up(); for (const m of mods) await page.keyboard.up(m); };
  const check = async (what, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) fail(`${what}: expected ${w}, got ${g}`); };
  const selected = async () => ids((await state()).selection);
  const focus = async () => { const f = (await state()).focus; return f === undefined ? null : "node" in f ? f.node.id : `${f.edge.src.id}>${f.edge.tgt.id}`; };
  const fit = () => page.evaluate(() => { window.__demo.renderer.dispatch({ type: "fit" }); });
  const active = () => page.evaluate(() => document.activeElement && document.activeElement.id);
  // the node centres of the initial state: columns 182, 450, 718 and rows 32, 300, 568 (Appendix A.12)
  const A = [182, 32], B = [450, 32], E = [450, 300];

  // non-blank: the node centres are painted
  const painted = await page.evaluate(() => { const c = document.getElementById("cv"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++; return n; });
  if (painted < 500) fail(`the canvas is nearly blank: ${painted} painted pixels`);
  const initial = await state();
  await check("initial selection", await selected(), []);

  // pointer: click, shift-click, ctrl-click
  await click(...A);
  await check("click a", await selected(), ["s:a"]);
  if ((await active()) !== "stage") fail(`a primary press on the canvas left DOM focus on ${await active()}, not on the container`);
  await click(...B, ["Shift"]);
  await check("shift-click b", await selected(), ["s:a", "s:b"]);
  await click(...A, ["Control"]);
  await check("ctrl-click a", await selected(), ["s:b"]);

  // a press on empty space keeps the selection until the release; shift and ctrl clicks on empty space are inert; none and alt clear
  for (const [mods, keptAfterRelease] of [[[], false], [["Shift"], true], [["Control"], true], [["Alt"], false]]) {
    await click(...B); // select b
    for (const m of mods) await page.keyboard.down(m);
    await move(600, 480);
    await page.mouse.down();
    await check(`press on empty space with ${mods.join("+") || "no modifier"}: selection kept at the press`, await selected(), ["s:b"]);
    await page.mouse.up();
    for (const m of mods) await page.keyboard.up(m);
    await check(`release on empty space with ${mods.join("+") || "no modifier"}`, await selected(), keptAfterRelease ? ["s:b"] : []);
  }

  // alt-drag lasso (row I23): the rectangle (150, 1) to (500, 350) holds a b d e and the edges between them
  await page.keyboard.down("Alt");
  await move(150, 1); await page.mouse.down(); await move(300, 150); await move(500, 350); await page.mouse.up();
  await page.keyboard.up("Alt");
  await check("alt-drag lasso", await selected(), ["s:a", "s:a>s:b", "s:a>s:d", "s:b", "s:b>s:e", "s:d", "s:e", "s:e>s:e"]);

  // wheel: one notch zooms in through a dispatched zoom intent
  await fit();
  const z0 = (await state()).viewport.zoom;
  await move(450, 300);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction((z) => window.__demo.renderer.getState().viewport.zoom > z, z0, { timeout: 5000 });
  const z1 = (await state()).viewport.zoom;
  if (z1 !== Math.round((z0 * 1250) / 1000) && Math.abs(z1 - z0 * 1.25) > 2) fail(`one wheel notch: zoom ${z0} -> ${z1}`);

  // a real drag pans; a double click fits
  await fit();
  const c0 = (await state()).viewport;
  await move(600, 500); await page.mouse.down(); await move(620, 505); await move(640, 510); await page.mouse.up();
  const c1 = (await state()).viewport;
  if (!(c1.center_x < c0.center_x) || c1.zoom !== c0.zoom) fail(`a drag of 40 px right did not pan the viewport: ${JSON.stringify(c0)} -> ${JSON.stringify(c1)}`);
  await page.mouse.dblclick(...at(600, 500));
  const v2 = (await state()).viewport;
  for (const k of ["center_x", "center_y", "width", "height", "zoom"]) if (v2[k] !== initial.viewport[k]) fail(`double click fits: ${k} is ${v2[k]}, expected ${initial.viewport[k]}`);

  // keyboard: Tab enters the widget (one tab stop), arrows move the semantic focus, Space selects, Escape clears
  await click(...[600, 500]); // empty space: clears, container focused
  await page.evaluate(() => document.getElementById("fit").focus());
  await page.keyboard.press("Tab");
  if ((await active()) !== "stage") fail(`Tab did not enter the widget: ${await active()}`);
  await page.keyboard.press("ArrowRight");
  await check("first arrow lands on the first element", await focus(), "s:a");
  await page.keyboard.press("ArrowRight");
  await check("ArrowRight", await focus(), "s:b");
  await page.keyboard.press("ArrowDown");
  await check("ArrowDown", await focus(), "s:e");
  await page.keyboard.press("e");
  await check("e: first incident edge of e", await focus(), "s:b>s:e");
  await page.keyboard.press("t");
  await check("t: the target node of the edge", await focus(), "s:e");
  await page.keyboard.press("Space");
  await check("Space selects the focused node", await selected(), ["s:e"]);
  await page.keyboard.press("Home");
  await check("Home", await focus(), "s:a");
  await page.keyboard.press("PageDown");
  await check("PageDown", await focus(), "s:b");
  await page.keyboard.press("Escape");
  await check("Escape clears the selection", await selected(), []);

  // the reveal rule: zoom in so that the next node is off-screen; the focus move appends a pan and the node ends inside the margin box
  await page.evaluate(() => { window.__demo.renderer.dispatch({ type: "set-viewport", center_x: 0, center_y: 0, zoom: 2680 }); window.__demo.renderer.dispatch({ type: "focus", target: { node: { id: "s:b", type: "p" } } }); });
  await page.keyboard.press("ArrowRight");
  await check("ArrowRight at the edge of the view", await focus(), "s:c");
  const where = await page.evaluate(() => { const m = window.__demo.model; const n = m.nodes.find((x) => x.ref.id === "s:c"); return window.__demo.screenOf(n); });
  if (!(where.x >= 24 - 1 && where.x <= 900 - 24 + 1)) fail(`the revealed node c is at x ${where.x}, outside the margin box`);

  // the marquee: m, arrows, Enter (rows L01 on the corner nodes a and e)
  await fit();
  await page.keyboard.press("Home");
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await check("marquee focus", await focus(), "s:e");
  await page.keyboard.press("Enter");
  await check("marquee commit", await selected(), ["s:a", "s:a>s:b", "s:a>s:d", "s:b", "s:b>s:e", "s:d", "s:e", "s:e>s:e"]);
  await page.keyboard.press("Control+a");
  const all = await selected();
  if (all.length !== 18) fail(`ctrl+a selected ${all.length} elements, expected 18`);

  // Tab leaves the widget: no trap
  await page.keyboard.press("Tab");
  if ((await active()) === "stage") fail("Tab did not leave the widget (a keyboard trap)");

  if (errors.length > 0) fail(`console errors: ${errors.join(" | ")}`);
  if (process.exitCode !== 1) console.log(`browser smoke ok in Chromium ${browser.version()} (secure context ${url}); one engine, one machine, no screenshot comparison: a smoke run, not browser qualification`);
} catch (e) {
  fail(e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  if (browser) await browser.close();
  server.close();
}
