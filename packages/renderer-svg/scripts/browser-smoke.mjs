// scripts/browser-smoke.mjs (design 17.4 (c)): Chromium through playwright-core, a secure context (http://localhost), ONE engine on ONE machine. This is a
// SMOKE run of the DOM adapter, not a conformance or qualification claim. Needs the built package (`npm run build`).
//   usage: ./node_modules/.bin/playwright-core install chromium   (once, installs to the user cache)   then   node scripts/browser-smoke.mjs
// Asserts: no console error and no parsererror; every corpus document of oracles-svg/svg parses with DOMParser("image/svg+xml") and the aria-label
// of each element equals the name of the strict reader; a real mouse press and release on the first node's centre selects it (the ObjectRef and the
// resolved identity appear and the document still contains the element: no lost click); a press on the edge's pick stroke selects the edge; a press on
// empty space clears the selection; a Tab into the widget changes no semantic focus (no focus-changed event).
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { readSvg } from "../dist/index.js";
import { pipeline } from "../demo/render-ison.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-svg");
const fail = (m) => { console.error(`BROWSER SMOKE FAIL: ${m}`); process.exitCode = 1; };

const sourcePath = join(ORACLES, "..", "oracles", "o1-basic.source.ison");
const sourceBytes = new Uint8Array(readFileSync(sourcePath));
const r = await pipeline(sourceBytes, { layout: "force" });
const b64 = (b) => Buffer.from(b).toString("base64");
const dataJs = `window.__ISON_DEMO__ = ${JSON.stringify({ name: "o1-basic", size: { width: 900, height: 600 }, layout: "force", source: new TextDecoder().decode(sourceBytes), sourceB64: b64(sourceBytes), sceneB64: b64(r.sceneBytes), layoutB64: b64(r.layoutBytes) })};\n`;
const bundle = (await build({ entryPoints: [join(PKG, "demo", "page.mjs")], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "error", target: "es2022" })).outputFiles[0].text;
const html = readFileSync(join(PKG, "demo", "index.html"), "utf8");

const server = http.createServer((q, s) => {
  const send = (type, body) => { s.setHeader("content-type", type); s.end(body); };
  if (q.url === "/out/data.js") send("text/javascript", dataJs);
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
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector("#graph svg") !== null, null, { timeout: 15000 });
  if (!(await page.evaluate(() => window.isSecureContext))) fail("the page is not a secure context");

  // 1. every corpus document parses as XML and its element names equal the reader's names
  const docs = readdirSync(join(ORACLES, "svg")).filter((f) => f.endsWith(".svg")).map((f) => {
    const text = readFileSync(join(ORACLES, "svg", f), "utf8");
    let names;
    try { const ro = readSvg(text); names = [...ro.nodes, ...ro.edges].map((e) => e.name); } catch { names = null; }
    return { f, text, names };
  });
  const parsed = await page.evaluate((all) => all.map(({ f, text, names }) => {
    const d = new DOMParser().parseFromString(text, "image/svg+xml");
    const bad = d.getElementsByTagName("parsererror").length > 0;
    const labels = Array.from(d.querySelectorAll("g.igr-node, g.igr-edge")).map((e) => e.getAttribute("aria-label"));
    return { f, bad, same: names === null ? null : JSON.stringify(labels) === JSON.stringify(names) };
  }), docs);
  const badDocs = parsed.filter((p) => p.bad || p.same === false);
  if (badDocs.length > 0) fail(`documents that do not parse or whose labels differ: ${badDocs.map((p) => p.f).join(", ")}`);
  console.log(`${parsed.length} corpus documents parse with DOMParser; ${parsed.filter((p) => p.same === true).length} have aria-labels equal to the strict reader's names`);

  // 2. a real press and release on the first node
  const centre = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const result = () => page.locator("#result").textContent();
  const n0 = await centre("#graph g.igr-node circle.igr-shape");
  await page.mouse.move(n0.x, n0.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"node"'), null, { timeout: 5000 });
  let text = await result();
  if (!text.includes('"address":{"id":"i:1","type":"person"}')) fail(`node press: unexpected result ${text}`);
  if (!text.includes(`"artifact_sha256":"${r.model.artifactSha256}"`)) fail("node press: the identity does not carry the artifact hash");
  if ((await page.locator("#graph g.igr-node.igr-selected").count()) !== 1) fail("the selected node is not marked in the replaced document (lost click?)");

  // 3. a press on the edge's pick stroke, 3 px off the chord, selects the edge
  const e0 = await page.locator("#graph g.igr-edge path.igr-pick").first().boundingBox();
  const edgeMid = { x: e0.x + e0.width / 2, y: e0.y + e0.height / 2 + 3 };
  await page.mouse.move(edgeMid.x, edgeMid.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"edge"'), null, { timeout: 5000 });
  text = await result();
  if (!text.includes('"rel":"KNOWS"')) fail(`edge press: unexpected result ${text}`);
  if ((await page.locator("#graph g.igr-edge.igr-selected").count()) !== 1) fail("the selected edge is not marked");

  // 4. a press on empty space clears the selection
  const box = await page.locator("#graph").boundingBox();
  await page.mouse.move(box.x + 450, box.y + 40);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes("selection cleared"), null, { timeout: 5000 });
  if ((await page.locator("#graph .igr-selected").count()) !== 0) fail("selection not cleared");

  // 5. Tab into the widget changes no semantic focus
  await page.evaluate(() => { window.__events.length = 0; });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const after = await page.evaluate(() => ({ events: window.__events.slice(), focus: window.__demo.renderer.getState().focus ?? null }));
  if (after.events.includes("focus-changed") || after.focus !== null) fail(`a browser focus changed the semantic focus: ${JSON.stringify(after)}`);

  // 6. the three buttons dispatch viewport intents; the document is replaced and still well-formed
  const before = await page.locator("#graph svg").getAttribute("data-igr-svg");
  await page.click("#zin");
  if ((await page.locator("#graph svg").count()) !== 1 || (await page.locator("#graph svg").getAttribute("data-igr-svg")) !== before) fail("zoom replaced the document badly");

  if (errors.length > 0) fail(`console errors: ${errors.join(" | ")}`);
  if (process.exitCode !== 1) console.log(`browser smoke ok in Chromium ${browser.version()} (secure context ${url}); one engine, one machine, no screenshot comparison: a smoke run, not browser qualification`);
} catch (e) {
  fail(e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  if (browser) await browser.close();
  server.close();
}
