// packages/layout-core/scripts/browser-smoke.mjs
// usage: ./node_modules/.bin/playwright-core install chromium   (once, installs to the user cache)  then  node scripts/browser-smoke.mjs
import http from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const out = await build({ entryPoints: ["scripts/browser-entry.mjs"], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "error" });
const js = out.outputFiles[0].text;
const server = http.createServer((q, r) => {
  if (q.url === "/bundle.js") { r.setHeader("content-type", "text/javascript"); r.end(js); return; }
  r.setHeader("content-type", "text/html"); r.end('<!doctype html><meta charset="utf-8"><script src="/bundle.js"></script>');
}).listen(0, "127.0.0.1");
await new Promise((res) => server.once("listening", res));
const url = `http://localhost:${server.address().port}/`; // localhost is a secure context

const EXPECTED = { scene: "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc", layout: "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db" };
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  const r = await page.evaluate(() => window.__smoke());
  if (!r.secure || r.scene !== EXPECTED.scene || r.layout !== EXPECTED.layout || r.again !== "reproduced") {
    console.error("BROWSER SMOKE FAIL", r); process.exitCode = 1;
  } else console.log(`browser smoke ok in ${browser.version()} (secure context), layout ${r.layout.slice(0, 12)}...`);

  // the same bundle on an insecure context (about:blank): WebCrypto SHA-256 is unavailable and the failure is the designed one
  const blank = await browser.newPage();
  await blank.goto("about:blank");
  await blank.addScriptTag({ content: js });
  const i = await blank.evaluate(() => window.__insecure());
  if (!i.rejected || i.name !== "HashUnavailableError" || i.secure) { console.error("INSECURE-CONTEXT CHECK FAIL", i); process.exitCode = 1; }
  else console.log(`insecure context (about:blank): rejected with ${i.name}, as designed`);
} finally { await browser.close(); server.close(); }
