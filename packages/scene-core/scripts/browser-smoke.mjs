// packages/scene-core/scripts/browser-smoke.mjs
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
const url = `http://localhost:${server.address().port}/`;   // localhost is a secure context

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  const r = await page.evaluate(() => window.__smoke());
  if (!r.secure || r.artifact !== "1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a" || r.scene !== "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc") {
    console.error("BROWSER SMOKE FAIL", r); process.exitCode = 1;
  } else console.log(`browser smoke ok in ${browser.version()} (secure context)`);
} finally { await browser.close(); server.close(); }
