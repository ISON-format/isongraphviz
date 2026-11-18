// scripts/browser-smoke.mjs (design 15.3 (c)): Chromium through playwright-core, a secure context (http://localhost), ONE engine on ONE machine. This is a
// SMOKE run of the DOM adapter, not a conformance or qualification claim. Needs the built packages (`npm run build` here and in ../display-list).
//   usage: ./node_modules/.bin/playwright-core install chromium   (once, installs to the user cache)   then   node scripts/browser-smoke.mjs
// Asserts: no console error; the canvas is NOT blank (non-blankness only, never identity: it samples a few pixels at the node centres and asserts they are not
// transparent); a real mouse press and release on the first node's centre makes pre#result contain the address {"id":"i:1","type":"person"} and its resolved
// identity; a press on empty space clears the selection; a press on a self-loop's apex selects the loop (the frozen hitTest cannot); a Tab into the page
// emits no semantic focus-changed event; a viewport button repaints without error.
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { buildPickBuffer } from "isongraph-visualize-display-list";
import { pipeline } from "./render-ison.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles");
const fail = (m) => { console.error(`BROWSER SMOKE FAIL: ${m}`); process.exitCode = 1; };
const b64 = (b) => Buffer.from(b).toString("base64");

async function demoData(file, layout) {
  const sourceBytes = new Uint8Array(readFileSync(join(ORACLES, file)));
  const r = await pipeline(sourceBytes, { layout });
  const js = `window.__ISON_DEMO__ = ${JSON.stringify({ name: file.replace(/\.source\.ison$/, ""), size: { width: 900, height: 600 }, layout, source: new TextDecoder().decode(sourceBytes), sourceB64: b64(sourceBytes), sceneB64: b64(r.sceneBytes), layoutB64: b64(r.layoutBytes) })};\n`;
  return { js, r };
}
const o1 = await demoData("o1-basic.source.ison", "force");
const o4 = await demoData("o4-undirected.source.ison", "fixed");
const bundle = (await build({ entryPoints: [join(PKG, "demo", "page.mjs")], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "error", target: "es2022" })).outputFiles[0].text;
const html = readFileSync(join(PKG, "demo", "index.html"), "utf8");

let current = o1.js;
const server = http.createServer((q, s) => {
  const send = (type, body) => { s.setHeader("content-type", type); s.end(body); };
  if (q.url === "/out/data.js") send("text/javascript", current);
  else if (q.url === "/out/demo.js") send("text/javascript", bundle);
  else if (q.url === "/" || q.url === "/index.html") send("text/html", html);
  else { s.statusCode = 404; s.end("not found"); }
}).listen(0, "127.0.0.1");
await new Promise((res) => server.once("listening", res));
const url = `http://localhost:${server.address().port}/`;

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const result = () => page.locator("#result").textContent();
  const canvasBox = async () => page.locator("#graph canvas").boundingBox();
  const press = async (x, y) => { const b = await canvasBox(); await page.mouse.move(b.x + x, b.y + y); await page.mouse.down(); await page.mouse.up(); };
  const pixel = (x, y) => page.evaluate(([px, py]) => {
    const c = document.querySelector("#graph canvas");
    const k = c.width / 900;
    return Array.from(c.getContext("2d").getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data);
  }, [x, y]);

  // ---- page 1: the O1 example ------------------------------------------------------------------------------------------------------------------
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector("#graph canvas") !== null, null, { timeout: 15000 });
  if (!(await page.evaluate(() => window.isSecureContext))) fail("the page is not a secure context");

  // non-blankness: the centre of each node is not transparent (the disc is painted)
  for (const n of o1.r.list.records.filter((x) => x[0] === "N")) {
    const px = await pixel(n[4] / 1000, n[5] / 1000);
    if (px[3] === 0) fail(`the canvas is blank at the centre of node ${n[1]}: ${px}`);
  }
  const blank = await page.evaluate(() => {
    const c = document.querySelector("#graph canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) painted++;
    return painted;
  });
  if (blank < 500) fail(`too few painted pixels on the canvas: ${blank}`);
  console.log(`canvas non-blank: ${blank} painted pixels; node centres opaque (a smoke check of non-blankness, not of identity)`);

  // a real press and release on the first node's centre
  const n0 = o1.r.list.records.find((x) => x[0] === "N");
  await press(n0[4] / 1000, n0[5] / 1000);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"node"'), null, { timeout: 5000 });
  let text = await result();
  if (!text.includes('"address":{"id":"i:1","type":"person"}')) fail(`node press: unexpected result ${text}`);
  if (!text.includes(`"artifact_sha256":"${o1.r.model.artifactSha256}"`)) fail("node press: the identity does not carry the artifact hash");
  const selectedPx = await pixel(n0[4] / 1000 + 14, n0[5] / 1000); // the selection ring (radius 14) is painted
  if (selectedPx[3] === 0) fail("the selection ring is not painted after the press");

  // a press on the edge, 3 px off the chord
  await press(450, 296 + 3);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"edge"'), null, { timeout: 5000 });
  text = await result();
  if (!text.includes('"rel":"KNOWS"')) fail(`edge press: unexpected result ${text}`);

  // a press on empty space clears the selection
  await press(450, 40);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes("selection cleared"), null, { timeout: 5000 });

  // Tab into the page changes no semantic focus
  await page.evaluate(() => { window.__events.length = 0; });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const after = await page.evaluate(() => ({ events: window.__events.slice(), focus: window.__demo.renderer.getState().focus ?? null }));
  if (after.events.includes("focus-changed") || after.focus !== null) fail(`a browser focus changed the semantic focus: ${JSON.stringify(after)}`);

  // the viewport buttons repaint
  await page.click("#zin");
  const afterZoom = await page.evaluate(() => {
    const c = document.querySelector("#graph canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) painted++;
    return painted;
  });
  if (afterZoom < 100) fail(`the canvas is blank after zoom in: ${afterZoom} painted pixels`);

  // ---- page 2: the self-loop of the O4 example ---------------------------------------------------------------------------------------------------
  current = o4.js;
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector("#graph canvas") !== null && document.querySelector("#result").textContent.startsWith("click"), null, { timeout: 15000 });
  const loop = buildPickBuffer(o4.r.list).edges.find((e) => e.points.length === 34).points; // the 17-point polyline of the loop: its apex is the middle point
  const apex = { x: loop[16] / 1000, y: loop[17] / 1000 };
  await press(apex.x, apex.y);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"edge"'), null, { timeout: 5000 });
  text = await result();
  if (!text.includes('"src":{"id":"i:2","type":"p"}') || !text.includes('"tgt":{"id":"i:2","type":"p"}')) fail(`loop press: unexpected result ${text}`);
  const hitTestAtApex = await page.evaluate(([x, y]) => window.__demo.renderer.hitTest({ x, y }) ?? null, [apex.x, apex.y]);
  if (hitTestAtApex !== null) fail("the frozen hitTest found the loop apex (the demo would not need pickDrawn)");

  if (errors.length > 0) fail(`console errors: ${errors.join(" | ")}`);
  if (process.exitCode !== 1) console.log(`browser smoke ok in Chromium ${browser.version()} (secure context ${url}); one engine, one machine, no screenshot comparison: a smoke run, not browser qualification`);
} catch (e) {
  fail(e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  if (browser) await browser.close();
  server.close();
}
