// scripts/browser-smoke.mjs (design 15.3 (c)): Chromium through playwright-core, a secure context (http://localhost), ONE engine on ONE machine. This is a
// SMOKE run of the real WebGL2 adapter, not a conformance or qualification claim. Needs the built packages (`npm run build` here and in ../display-list,
// ../renderer-canvas, ../renderer-svg).
//   usage: ./node_modules/.bin/playwright-core install chromium   (once, installs to the user cache)   then   node scripts/browser-smoke.mjs
// It reports whether the GL is a GPU or software (read here, in the smoke script only: the library never reads the unmasked renderer, 11.6), COMPILES and
// LINKS the six shader sources of Appendix B on that context and reports every info log and GL error, then draws the demo graph through the adapter and
// asserts NON-BLANKNESS ONLY (never identity): a screenshot crop of the composited canvas is decoded and the pixels at the node centres are not the page
// background. Further: a real mouse press selects a node and its identity resolves, a press on empty space clears, a press on a loop's apex selects the
// loop, a Tab emits no semantic focus event, WEBGL_lose_context loses and restores the context (status().contextLost, an unchanged probe(), no console
// error, non-blank again), and a layout with coordinates of about +-10^9 px at identity zoom is drawn and the offset of its line from the ideal line is
// RECORDED (design 7.3 P3: expected below 0.1 px; recorded, not asserted as exact).
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { buildPickBuffer } from "isongraph-visualize-display-list";
import { pipeline } from "./plan-ison.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles");
const fail = (m) => { console.error(`BROWSER SMOKE FAIL: ${m}`); process.exitCode = 1; };
const b64 = (b) => Buffer.from(b).toString("base64");

async function demoData(file, layout, positions) {
  const sourceBytes = new Uint8Array(readFileSync(join(ORACLES, file)));
  const r = await pipeline(sourceBytes, { layout, ...(positions ? { positions } : {}) });
  const js = `window.__ISON_DEMO__ = ${JSON.stringify({ name: file.replace(/\.source\.ison$/, ""), size: { width: 900, height: 600 }, layout, source: new TextDecoder().decode(sourceBytes), sourceB64: b64(sourceBytes), sceneB64: b64(r.sceneBytes), layoutB64: b64(r.layoutBytes) })};\n`;
  return { js, r };
}
const o1 = await demoData("o1-basic.source.ison", "force");
const o4 = await demoData("o4-undirected.source.ison", "fixed");
const far = await demoData("o1-basic.source.ison", "fixed", [{ x: -1_000_000_000, y: 300 }, { x: 1_000_000_000, y: 301 }]);
const bundle = (await build({ entryPoints: [join(PKG, "demo", "page.mjs")], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "error", target: "es2022" })).outputFiles[0].text;
const html = readFileSync(join(PKG, "demo", "index.html"), "utf8");

let current = o1.js;
const server = http.createServer((q, s) => {
  const send = (type, body) => { s.setHeader("content-type", type); s.end(body); };
  const path = (q.url ?? "/").split("?")[0];
  if (path === "/out/data.js") send("text/javascript", current);
  else if (path === "/out/demo.js") send("text/javascript", bundle);
  else if (path === "/" || path === "/index.html") send("text/html", html);
  else { s.statusCode = 404; s.end("not found"); }
}).listen(0, "127.0.0.1");
await new Promise((res) => server.once("listening", res));
const url = `http://localhost:${server.address().port}/?software=1`;

// decodes a PNG buffer in the page and returns a pixel reader (RGBA) for the listed points and the number of non-transparent-or-non-background pixels
const sampler = (page) => async (png, points, bg) => page.evaluate(async ([b, pts, background]) => {
  const blob = await (await fetch("data:image/png;base64," + b)).blob();
  const img = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const at = (x, y) => { const i = (Math.round(y) * c.width + Math.round(x)) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  let different = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - background[0]) + Math.abs(d[i + 1] - background[1]) + Math.abs(d[i + 2] - background[2]) > 30) different++;
  return { width: c.width, height: c.height, different, samples: pts.map(([x, y]) => at(x, y)) };
}, [png.toString("base64"), points, bg]);

let browser;
try {
  browser = await chromium.launch({ args: ["--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [], warnings = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); else if (m.type() === "warning") warnings.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const result = () => page.locator("#result").textContent();
  const glBox = async () => page.locator("#graph canvas").first().boundingBox();
  const press = async (x, y) => { const b = await glBox(); await page.mouse.move(b.x + x, b.y + y); await page.mouse.down(); await page.mouse.up(); };
  // the crop is the GL canvas element itself: the composited pixels of the canvas and the label canvas stacked over it, exactly W x H
  const shot = () => page.locator("#graph canvas").first().screenshot();
  const sample = sampler(page);
  const BG = [255, 255, 255];

  await page.goto(url);
  await page.waitForFunction(() => window.__demo !== undefined || document.querySelector("#result").textContent.startsWith("no renderer"), null, { timeout: 20000 });
  if (!(await page.evaluate(() => window.isSecureContext))) fail("the page is not a secure context");

  // ---- what GL is this? (reported here, never by the library) --------------------------------------------------------------------------------------
  const env = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return { webgl2: false };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return { webgl2: true, version: gl.getParameter(gl.VERSION), renderer: String(renderer), vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)), highpV: gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT).precision, highpF: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision };
  });
  if (!env.webgl2) fail("this Chromium offers no WebGL2 context");
  const software = /swiftshader|software|llvmpipe|basic render/i.test(env.renderer ?? "");
  console.log(`GL: ${env.version}; renderer "${env.renderer}"; vendor "${env.vendor}"; ${software ? "SOFTWARE rendering (no hardware GPU claim)" : "not recognised as software by name (reported, not asserted as a GPU)"}; highp precision vertex ${env.highpV}, fragment ${env.highpF}`);

  // ---- the six shaders compile and link on this context --------------------------------------------------------------------------------------------
  const compile = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const out = { shaders: {}, programs: {}, errors: [] };
    for (const p of ["arrow", "disc", "edge"]) {
      const sh = [];
      for (const [stage, type] of [["vs", gl.VERTEX_SHADER], ["fs", gl.FRAGMENT_SHADER]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, window.__shaders[p][stage]);
        gl.compileShader(s);
        out.shaders[`${p}.${stage}`] = { ok: gl.getShaderParameter(s, gl.COMPILE_STATUS) === true, log: gl.getShaderInfoLog(s) };
        sh.push(s);
      }
      const prog = gl.createProgram();
      for (const s of sh) gl.attachShader(prog, s);
      gl.linkProgram(prog);
      out.programs[p] = { ok: gl.getProgramParameter(prog, gl.LINK_STATUS) === true, log: gl.getProgramInfoLog(prog) };
    }
    for (let e = gl.getError(); e !== gl.NO_ERROR; e = gl.getError()) out.errors.push(e);
    return out;
  });
  for (const [k, v] of Object.entries(compile.shaders)) if (!v.ok) fail(`shader ${k} did not compile: ${v.log}`);
  for (const [k, v] of Object.entries(compile.programs)) if (!v.ok) fail(`program ${k} did not link: ${v.log}`);
  const logs = [...Object.values(compile.shaders), ...Object.values(compile.programs)].map((v) => v.log).filter((l) => l && l.length > 0);
  console.log(`shaders: 6 of 6 compiled, 3 of 3 programs linked; info logs ${logs.length === 0 ? "empty" : JSON.stringify(logs)}; GL errors after compile and link: ${compile.errors.length === 0 ? "none" : compile.errors.join(",")}`);
  if (compile.errors.length > 0) fail(`GL errors after compiling the shaders: ${compile.errors.join(",")}`);

  // ---- the adapter drew the demo graph (page 1: the O1 example) ---------------------------------------------------------------------------------------
  const kind = await page.evaluate(() => window.__demo.kind);
  if (kind !== "webgl") fail(`the page mounted the ${kind} renderer, not the WebGL one: ${await page.evaluate(() => JSON.stringify(window.__demo.reasons))}`);
  const st = await page.evaluate(() => window.__demo.renderer.status());
  console.log(`adapter status: ${JSON.stringify(st)}`);
  if (st.phase !== "ready" || st.contextLost !== false) fail(`unexpected adapter status ${JSON.stringify(st)}`);
  const nodes = o1.r.list.records.filter((x) => x[0] === "N");
  const nodeCentres = nodes.map((n) => [n[4] / 1000, n[5] / 1000]);
  const png = await shot();
  const px = await sample(png, nodeCentres, BG);
  px.samples.forEach((p, i) => { if (Math.abs(p[0] - BG[0]) + Math.abs(p[1] - BG[1]) + Math.abs(p[2] - BG[2]) < 60 || p[3] === 0) fail(`the composited canvas is blank at the centre of node ${i + 1}: ${p}`); });
  if (px.different < 500) fail(`too few non-background pixels in the composited screenshot: ${px.different}`);
  console.log(`non-blank: ${px.different} non-background pixels in the composited ${px.width}x${px.height} crop; node-centre pixels ${JSON.stringify(px.samples)} (palette k0 is 42,120,214; a smoke check of non-blankness, never of identity)`);
  const glErrors = await page.evaluate(() => {
    const gl = document.querySelector("#graph canvas").getContext("webgl2");
    const out = [];
    if (gl) for (let e = gl.getError(); e !== gl.NO_ERROR && out.length < 10; e = gl.getError()) out.push(e);
    return out;
  });
  console.log(`GL errors on the adapter's context after the draw: ${glErrors.length === 0 ? "none" : glErrors.join(",")}`);
  if (glErrors.length > 0) fail(`GL errors after the draw: ${glErrors.join(",")}`);

  // a real press and release on the first node's centre
  await press(...nodeCentres[0]);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"node"'), null, { timeout: 5000 });
  let text = await result();
  if (!text.includes('"address":{"id":"i:1","type":"person"}')) fail(`node press: unexpected result ${text}`);
  if (!text.includes(`"artifact_sha256":"${o1.r.model.artifactSha256}"`)) fail("node press: the identity does not carry the artifact hash");
  const ring = await sample(await shot(), [[nodeCentres[0][0] + 14, nodeCentres[0][1]]], BG);
  if (ring.samples[0][3] === 0 || Math.abs(ring.samples[0][0] - BG[0]) + Math.abs(ring.samples[0][1] - BG[1]) + Math.abs(ring.samples[0][2] - BG[2]) < 60) fail(`the selection ring is not painted after the press: ${ring.samples[0]}`);
  await press(450, 296 + 3);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"edge"'), null, { timeout: 5000 });
  text = await result();
  if (!text.includes('"rel":"KNOWS"')) fail(`edge press: unexpected result ${text}`);
  await press(450, 40);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes("selection cleared"), null, { timeout: 5000 });
  await page.evaluate(() => { window.__events.length = 0; });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const after = await page.evaluate(() => ({ events: window.__events.slice(), focus: window.__demo.renderer.getState().focus ?? null }));
  if (after.events.includes("focus-changed") || after.focus !== null) fail(`a browser focus changed the semantic focus: ${JSON.stringify(after)}`);

  // ---- real context loss and restore (WEBGL_lose_context) ---------------------------------------------------------------------------------------------
  const probeBefore = await page.evaluate(() => JSON.stringify(window.__demo.renderer.probe()));
  const labelPainted = (png2) => sample(png2, [], BG).then((s) => s.different);
  const before = await labelPainted(await shot());
  await page.evaluate(() => { const gl = document.querySelector("#graph canvas").getContext("webgl2"); window.__lose = gl.getExtension("WEBGL_lose_context"); window.__lose.loseContext(); });
  await page.waitForFunction(() => window.__demo.renderer.status().contextLost === true, null, { timeout: 5000 });
  const lost = await page.evaluate(() => ({ status: window.__demo.renderer.status(), label: document.querySelector("#graph canvas").getAttribute("aria-label") }));
  if (lost.status.phase !== "lost" || !lost.label.startsWith("Graph display unavailable.")) fail(`after the loss: ${JSON.stringify(lost)}`);
  if ((await page.evaluate(() => JSON.stringify(window.__demo.renderer.probe()))) !== probeBefore) fail("probe() changed after a context loss");
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForFunction(() => window.__demo.renderer.status().phase === "ready", null, { timeout: 5000 });
  const restored = await labelPainted(await shot());
  if (restored < 500) fail(`the canvas is blank after the restore: ${restored} non-background pixels (before the loss: ${before})`);
  console.log(`context loss and restore: lost -> ${JSON.stringify(lost.status)}, restored -> ready; non-background pixels ${before} before, ${restored} after; probe() unchanged`);

  // the viewport buttons repaint
  await page.click("#zin");
  const afterZoom = await labelPainted(await shot());
  if (afterZoom < 100) fail(`the canvas is blank after zoom in: ${afterZoom} non-background pixels`);

  // ---- page 2: the self-loop of the O4 example --------------------------------------------------------------------------------------------------------
  current = o4.js;
  await page.goto(url);
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 20000 });
  const loop = buildPickBuffer(o4.r.list).edges.find((e) => e.points.length === 34).points;
  const apex = { x: loop[16] / 1000, y: loop[17] / 1000 };
  await press(apex.x, apex.y);
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes('"kind":"edge"'), null, { timeout: 5000 });
  text = await result();
  if (!text.includes('"src":{"id":"i:2","type":"p"}') || !text.includes('"tgt":{"id":"i:2","type":"p"}')) fail(`loop press: unexpected result ${text}`);
  if ((await page.evaluate(([x, y]) => window.__demo.renderer.hitTest({ x, y }) ?? null, [apex.x, apex.y])) !== null) fail("the frozen hitTest found the loop apex (the demo would not need pickDrawn)");

  // ---- page 3: a 10^9-px edge ------------------------------------------------------------------------------------------------------------------------------
  current = far.js;
  await page.goto(url);
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 20000 });
  await page.evaluate(() => window.__demo.renderer.dispatch({ type: "set-viewport", center_x: 0, center_y: 300500, zoom: 1000 }));
  const farStatus = await page.evaluate(() => window.__demo.renderer.status());
  if (farStatus.failure !== undefined) fail(`the far scene was refused: ${JSON.stringify(farStatus)}`);
  const farPlan = await page.evaluate(() => { const p = window.__demo.renderer.plan(); return { cn: p.header.cn, ce: p.header.ce, edge: p.header.sizes.edge, draws: p.header.draws }; });
  // the pixels are read INSIDE the draw task (preserveDrawingBuffer is false, so a later read may be empty on a healthy page): render() draws synchronously and
  // toDataURL of the GL canvas runs before the browser composites; this is the smoke script, never the library (7.9: the adapter never reads pixels)
  const cols = [100, 250, 450, 650, 800];
  // the viewport centre (450, 300) is the layout point (0, 300.5), the midpoint of the two nodes, so the ideal line is y = 300 + (x - 450) / 2e9 (a pixel row r
  // covers r .. r + 1); the line's centroid is taken over the alpha of a window of rows
  const ys = await page.evaluate(async (columns) => {
    const canvas = document.querySelector("#graph canvas");
    const done = window.__demo.renderer.render();
    const url = canvas.toDataURL("image/png");
    await done;
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    return columns.map((x) => {
      let sw = 0, sy = 0;
      for (let y = 292; y < 308; y++) {
        const w = ctx.getImageData(x, y, 1, 1).data[3];
        sw += w; sy += w * (y + 0.5);
      }
      return sw > 0 ? sy / sw : null;
    });
  }, cols);
  const offsets = ys.map((y, i) => (y === null ? null : y - (300 + (cols[i] - 450) / 2e9)));
  if (offsets.some((o) => o === null)) fail(`the 10^9-px edge is not drawn at some sampled column: ${JSON.stringify(ys)}`);
  else console.log(`10^9-px edge: plan edge buffer ${farPlan.edge} bytes, omitted nodes ${JSON.stringify(farPlan.cn)}; measured offsets from the ideal line at columns ${cols.join(",")}: ${offsets.map((o) => o.toFixed(3)).join(", ")} px (expected below 0.1; RECORDED, not asserted as exact; antialiasing and the 2 px stroke limit the measurement)`);

  if (errors.length > 0) fail(`console errors: ${errors.join(" | ")}`);
  if (warnings.length > 0) console.log(`console warnings (${warnings.length}, not asserted): ${warnings.slice(0, 3).join(" | ").slice(0, 300)}`);
  if (process.exitCode !== 1) console.log(`browser smoke ok in Chromium ${browser.version()} (secure context ${url}); one engine, one machine, ${software ? "software GL" : "GL not recognised as software"}; non-blankness only, no pixel-identity comparison: a smoke run, not browser qualification`);
} catch (e) {
  fail(e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  if (browser) await browser.close();
  server.close();
}
