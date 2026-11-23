// scripts/playground-smoke.mjs: Chromium through playwright-core on http://localhost (a secure context), ONE engine on ONE machine. A SMOKE run of demo/playground.html
// (NON-NORMATIVE; no conformance or qualification claim). Needs `npm run build` and `npm run demo:build` first and a Chromium for playwright-core. Run by
// scripts/browser-smoke.mjs after the demo page, or alone: `node scripts/playground-smoke.mjs`. With PLAYGROUND_SHOTS=<dir> it also saves screenshots of the page
// states (default, hover, filter, search, zoomed with the minimap, mid-drag) at 1100 x 800 and 600 x 800 into that directory.
// Asserted, each by real mouse and keyboard events and a read of the page state (window.__playground), on the Canvas host, and the hover and filter items again on the SVG host:
//   hover: a node gives the highlight overlay (its edges and neighbours, the ring on it, a veil over the rest) and a tooltip with kind, label, type, id and degree; an edge gives
//     the edge and its two ends; leaving clears both; semantic focus (keys) gives the same highlight while the graph has DOM focus;
//   drag: a press and move on a node shows a preview (overlay mode drag, the node follows the pointer), the release commits a NEW layout (new layout hash, the node moved by the
//     pointer displacement, every other node unchanged) while the original layout hash is unchanged, selection, hidden set and viewport are carried across, Escape cancels,
//     a click without movement selects, Alt+Shift+arrow nudges, Reset layout restores the original hash and positions;
//   search: case-insensitive match by id, label and type, at most 8 listed, arrow keys move the active row, Enter selects and centres, hidden elements are not listed;
//   filter: unchecking a type or a relation hides through set-hidden (state.hidden, the count line), Clear filters restores;
//   pan, zoom, minimap: wheel zoom about the pointer (the layout point under the pointer stays put), background drag pans, double-click fits, the buttons and the keys +, -, 0,
//     zoom to selection, a click and a drag in the minimap move the viewport centre;
//   also: reduced motion removes the transitions, no horizontal scroll at 600 px, no console error and no page error.
// NOT claimed: other browsers, touch, assistive technology, performance, pixel-exact output, the WebGL host.
import { mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`PLAYGROUND SMOKE FAIL: ${m}`); process.exitCode = 1; };
const read = (rel) => readFileSync(join(PKG, rel));
const files = {
  "/playground.html": ["text/html", read("demo/playground.html")],
  "/out/playground.js": ["text/javascript", read("demo/out/playground.js")],
  "/out/playground-data.js": ["text/javascript", read("demo/out/playground-data.js")],
};
const server = http.createServer((q, s) => { const f = files[q.url]; if (!f) { s.statusCode = 404; s.end("not found"); return; } s.setHeader("content-type", f[0]); s.end(f[1]); }).listen(0, "127.0.0.1");
await new Promise((res) => server.once("listening", res));
const url = `http://localhost:${server.address().port}/playground.html`;
const shotDir = process.env.PLAYGROUND_SHOTS;
if (shotDir) mkdirSync(shotDir, { recursive: true });
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__playground && window.__playground.ready, null, { timeout: 15000 });

  const check = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
  const near = (what, got, want, tol) => { if (!(Math.abs(got - want) <= tol)) fail(`${what}: expected ${want} +- ${tol}, got ${got}`); };
  const truthy = (what, v) => { if (!v) fail(what); };
  const P = (fn, arg) => page.evaluate(fn, arg);
  const state = () => P(() => window.__playground.state());
  const overlay = () => P(() => window.__playground.overlay());
  const shot = async (name) => { if (shotDir) await page.screenshot({ path: join(shotDir, name) }); };
  const idle = () => P(() => window.__playground.idle());
  /** client coordinates of a node (by label) and the layout facts needed to predict what a gesture does */
  const nodeAt = (name) => P((n) => {
    const p = window.__playground, m = p.model(), st = p.state(), vp = st.viewport, r = document.getElementById("graph").getBoundingClientRect();
    const node = m.nodes.find((x) => x.label === n);
    return { x: r.left + ((node.x - vp.center_x) * vp.zoom) / 1e6 + vp.width / 2, y: r.top + ((node.y - vp.center_y) * vp.zoom) / 1e6 + vp.height / 2, mx: node.x, my: node.y, index: node.index };
  }, name);
  const positions = () => P(() => window.__playground.model().nodes.map((n) => [n.label, n.x, n.y]));
  const hiddenCount = () => P(() => document.getElementById("filtercount").textContent);
  const vpOf = async () => (await state()).viewport;
  /** a client point on the graph far from every node and every edge (for background gestures) */
  const emptySpot = () => P(() => {
    const p = window.__playground, m = p.model(), vp = p.state().viewport, r = document.getElementById("graph").getBoundingClientRect();
    const sx = (n) => ((n.x - vp.center_x) * vp.zoom) / 1e6 + vp.width / 2, sy = (n) => ((n.y - vp.center_y) * vp.zoom) / 1e6 + vp.height / 2;
    const segDist = (px, py, a, b) => { const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b), dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
    let best, bestD = -1;
    for (let x = 30; x < vp.width - 30; x += 20) for (let y = 30; y < vp.height - 30; y += 20) {
      let d = Infinity;
      for (const n of m.nodes) d = Math.min(d, Math.hypot(x - sx(n), y - sy(n)));
      for (const e of m.edges) d = Math.min(d, segDist(x, y, m.nodes[e.src], m.nodes[e.tgt]));
      if (d > bestD) { bestD = d; best = { x: r.left + x, y: r.top + y }; }
    }
    return { ...best, clearance: bestD };
  });
  const move = (x, y) => page.mouse.move(x, y);
  const tipText = () => P(() => { const t = document.getElementById("tooltip"); return t.hidden ? null : t.textContent; });
  const veilAlpha = () => P(() => { const c = document.getElementById("overlay"); const d = c.getContext("2d").getImageData(2, 2, 1, 1).data; return d[3]; });
  const out = async () => { await move(5, 5); };

  // ---------------------------------------------------------------- the page and the sample
  const facts = await P(() => { const m = window.__playground.model(); return { nodes: m.nodes.length, edges: m.edges.length, categories: m.categories, rels: [...new Set(m.edges.map((e) => e.ref.rel))].length, kind: window.__playground.kind() }; });
  truthy(`the sample has 9 to 30 nodes, at least 3 types and 3 relations: ${JSON.stringify(facts)}`, facts.nodes >= 9 && facts.nodes <= 30 && facts.categories.length >= 3 && facts.rels >= 3);
  check("the Canvas host is the default", facts.kind, "canvas");
  check("one canvas for the host, one for the overlay, one for the minimap", await P(() => document.querySelectorAll("canvas").length), 3);
  await shot("1100-default.png");

  // ---------------------------------------------------------------- hover and focus highlight (Canvas host)
  const alice = await nodeAt("alice");
  await move(alice.x, alice.y);
  let ov = await overlay();
  check("hover on a node: mode and ring", [ov.mode, ov.ring], ["hover", "alice"]);
  const expectNeighbours = await P(() => { const m = window.__playground.model(), a = m.nodes.find((n) => n.label === "alice"); const set = new Set(["alice"]); const edges = []; for (const e of m.edges) if (e.src === a.index || e.tgt === a.index) { set.add(m.nodes[e.src].label); set.add(m.nodes[e.tgt].label); edges.push(e.index); } return { nodes: [...set].sort(), edges: edges.length }; });
  check("hover on a node highlights it and its neighbours only", ov.nodes, expectNeighbours.nodes);
  check("... and its incident edges", ov.edges.length, expectNeighbours.edges);
  truthy("the rest is dimmed: a veil is drawn over the host", (await veilAlpha()) > 100);
  const tip = await tipText();
  truthy(`the tooltip shows kind, label, type, id and degree: ${tip}`, tip !== null && /alice/.test(tip) && /node/.test(tip) && /person/.test(tip) && /s:alice/.test(tip) && /degree/.test(tip));
  await shot("1100-hover-node.png");
  // an edge: one whose pair of ends has no other edge and whose middle is clear of every node
  const edgeSpot = await P(() => {
    const p = window.__playground, m = p.model(), vp = p.state().viewport, r = document.getElementById("graph").getBoundingClientRect();
    const sx = (n) => ((n.x - vp.center_x) * vp.zoom) / 1e6 + vp.width / 2, sy = (n) => ((n.y - vp.center_y) * vp.zoom) / 1e6 + vp.height / 2;
    for (const e of m.edges) {
      if (m.edges.some((o) => o !== e && ((o.src === e.src && o.tgt === e.tgt) || (o.src === e.tgt && o.tgt === e.src)))) continue;
      const a = m.nodes[e.src], b = m.nodes[e.tgt], x = (sx(a) + sx(b)) / 2, y = (sy(a) + sy(b)) / 2;
      if (m.nodes.some((n) => Math.hypot(x - sx(n), y - sy(n)) < 30)) continue;
      return { x: r.left + x, y: r.top + y, label: e.label, ends: [a.label, b.label].sort() };
    }
    return null;
  });
  await move(edgeSpot.x, edgeSpot.y);
  ov = await overlay();
  check("hover on an edge: the edge and its two ends", [ov.mode, ov.nodes, ov.edges.length], ["hover", edgeSpot.ends, 1]);
  truthy("the edge tooltip names the relation", /relation/.test((await tipText()) ?? "") && new RegExp(edgeSpot.label).test((await tipText()) ?? ""));
  await out();
  check("pointer leaves: no highlight, no tooltip", [(await overlay()).mode, await tipText(), await veilAlpha()], ["none", null, 0]);
  // selection keeps its semantic styling: a click selects, hover then does not change the selection
  await page.mouse.click(alice.x, alice.y);
  check("a click on a node selects it", (await state()).selection.nodes.map((n) => n.id), ["s:alice"]);
  const dave = await nodeAt("dave");
  await move(dave.x, dave.y);
  check("hover does not touch the selection", (await state()).selection.nodes.map((n) => n.id), ["s:alice"]);
  await out();
  // semantic focus (keyboard) gives the same highlight while the graph has DOM focus
  await P(() => document.querySelector('#graph [role="option"][tabindex="0"]').focus());
  await page.keyboard.press("ArrowRight");
  ov = await overlay();
  check("keyboard focus highlights the focused element and its neighbours", ov.mode, "focus");
  truthy("the focus highlight has a ring on the focused element", ov.ring !== null && ov.nodes.length >= 1);
  await P(() => document.activeElement.blur());
  await page.waitForFunction(() => window.__playground.overlay().mode === "none", null, { timeout: 2000 }).catch(() => {});
  check("the focus highlight goes when the graph loses focus", (await overlay()).mode, "none");
  await page.keyboard.press("Escape");
  await P(() => { document.getElementById("graph").focus(); });
  await page.keyboard.press("Escape");
  check("Escape clears the selection (binder)", (await state()).selection.nodes.length, 0);

  // ---------------------------------------------------------------- pan, zoom
  const vp0 = await vpOf();
  const spot = await emptySpot();
  truthy(`an empty spot exists on the graph (clearance ${spot.clearance})`, spot.clearance > 25);
  // wheel zoom about the pointer: the layout point under the pointer stays where it is
  const under = (vp, cx, cy) => { const r = { left: 0, top: 0 }; return { x: vp.center_x + ((cx - r.left - vp.width / 2) * 1e6) / vp.zoom, y: vp.center_y + ((cy - r.top - vp.height / 2) * 1e6) / vp.zoom }; };
  const rect = await P(() => { const r = document.getElementById("graph").getBoundingClientRect(); return { left: r.left, top: r.top }; });
  const rel = { x: spot.x - rect.left, y: spot.y - rect.top };
  const before = under(vp0, rel.x, rel.y);
  await move(spot.x, spot.y);
  await page.mouse.wheel(0, -100);
  const vp1 = await vpOf();
  near("wheel up zooms in by one notch (x1.25)", vp1.zoom / vp0.zoom, 1.25, 0.01);
  const after = under(vp1, rel.x, rel.y);
  near("the layout point under the pointer stays (x)", after.x, before.x, 60);
  near("the layout point under the pointer stays (y)", after.y, before.y, 60);
  await shot("1100-zoomed-minimap.png");
  await page.mouse.wheel(0, 100);
  near("wheel down zooms back out", (await vpOf()).zoom / vp0.zoom, 1, 0.02);
  // background drag pans (the whole drag is on the background: the press spot is empty and the move stays in the stage)
  const vp2 = await vpOf();
  await page.mouse.move(spot.x, spot.y); await page.mouse.down(); await page.mouse.move(spot.x + 30, spot.y + 20, { steps: 4 }); await page.mouse.up();
  const vp3 = await vpOf();
  near("a background drag of 30 px pans the centre by -30 px (x)", vp3.center_x - vp2.center_x, (-30 * 1e6) / vp2.zoom, 1200);
  near("a background drag of 20 px pans the centre by -20 px (y)", vp3.center_y - vp2.center_y, (-20 * 1e6) / vp2.zoom, 1200);
  check("the pan changed no node", (await P(() => window.__playground.edited())).edited, false);
  await page.mouse.dblclick(spot.x, spot.y);
  const fitNow = await P(() => { const m = window.__playground.model(); return window.__playground.state().viewport; });
  check("a double-click fits (and the reducer's fit is what the buttons give)", [fitNow.center_x, fitNow.center_y, fitNow.zoom], [vp0.center_x, vp0.center_y, vp0.zoom]);
  // buttons and keys
  await page.click("#zoom-in");
  near("Zoom in button: x1.25", (await vpOf()).zoom / fitNow.zoom, 1.25, 0.01);
  await page.click("#zoom-out");
  near("Zoom out button: back", (await vpOf()).zoom / fitNow.zoom, 1, 0.02);
  await P(() => document.getElementById("graph").focus());
  await page.keyboard.press("+");
  near("key +: x1.25 with the graph focused", (await vpOf()).zoom / fitNow.zoom, 1.25, 0.01);
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  near("key - twice: x0.8 x0.8", (await vpOf()).zoom / fitNow.zoom, 0.8 * 0.8 * 1.25, 0.02);
  await page.keyboard.press("0");
  check("key 0 fits", (await vpOf()).zoom, fitNow.zoom);
  await page.click("#zoom-in"); await page.click("#fit");
  check("Fit button fits", (await vpOf()).zoom, fitNow.zoom);
  check("Zoom to selection is disabled with no selection", await P(() => document.getElementById("zoom-sel").disabled), true);
  await page.mouse.click(alice.x, alice.y);
  await page.click("#zoom-sel");
  const vz = await vpOf();
  check("Zoom to selection centres the selected node", [vz.center_x, vz.center_y], [alice.mx, alice.my]);
  truthy("... and zooms in", vz.zoom > fitNow.zoom);
  await page.click("#fit");
  await P(() => document.getElementById("graph").focus()); await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- minimap
  const mm = await P(() => { const m = window.__playground.minimap(); return { left: m.left, top: m.top, width: m.width, height: m.height, box: m.box }; });
  const fromMini = (px, py) => P(({ px, py }) => window.__playground.minimap().fromMini(px, py), { px, py });
  const clickAt = { x: mm.box.w * 0.3, y: mm.box.h * 0.4 };
  const expectWorld = await fromMini(clickAt.x, clickAt.y);
  await page.mouse.click(mm.left + (clickAt.x * mm.width) / mm.box.w, mm.top + (clickAt.y * mm.height) / mm.box.h);
  const vm = await vpOf();
  near("a click in the minimap centres the viewport on that layout point (x)", vm.center_x, expectWorld.x, 2);
  near("a click in the minimap centres the viewport on that layout point (y)", vm.center_y, expectWorld.y, 2);
  check("the minimap click kept the zoom", vm.zoom, fitNow.zoom);
  // a drag: the frame follows the pointer through a frozen mapping
  await page.click("#zoom-in"); await page.click("#zoom-in");
  const m2 = await P(() => { const m = window.__playground.minimap(); return { left: m.left, top: m.top, width: m.width, height: m.height, box: m.box }; });
  const a = { x: m2.box.w * 0.25, y: m2.box.h * 0.5 }, b = { x: m2.box.w * 0.7, y: m2.box.h * 0.45 };
  const wa = await fromMini(a.x, a.y), wb = await fromMini(b.x, b.y);
  const px = (p) => ({ x: m2.left + (p.x * m2.width) / m2.box.w, y: m2.top + (p.y * m2.height) / m2.box.h });
  await page.mouse.move(px(a).x, px(a).y); await page.mouse.down();
  near("minimap drag, press: the centre is at the pressed point (x)", (await vpOf()).center_x, wa.x, 2);
  await page.mouse.move(px(b).x, px(b).y, { steps: 5 });
  const vd = await vpOf();
  near("minimap drag: the centre follows the pointer (x)", vd.center_x, wb.x, 2);
  near("minimap drag: the centre follows the pointer (y)", vd.center_y, wb.y, 2);
  await page.mouse.up();
  await shot("1100-minimap-drag.png");
  await page.click("#fit");

  // ---------------------------------------------------------------- search
  await page.fill("#q", "");
  await page.click("#q");
  await page.keyboard.type("ALI");
  let s = await P(() => window.__playground.search());
  truthy(`the search finds alice case-insensitively and lists her first: ${JSON.stringify(s)}`, s.titles[0] === "alice" && s.total >= 1);
  check("the combobox is expanded and lists options", await P(() => [document.getElementById("q").getAttribute("aria-expanded"), document.querySelectorAll('#results [role="option"]').length > 0]), ["true", true]);
  check("the search highlights the matches on the overlay", (await overlay()).mode, "search");
  await shot("1100-search.png");
  await page.keyboard.press("ArrowDown");
  s = await P(() => window.__playground.search());
  check("ArrowDown moves the active row (to the second match, or stays on the only one)", s.active, Math.min(1, s.titles.length - 1));
  check("aria-activedescendant names the active option", await P(() => document.getElementById("q").getAttribute("aria-activedescendant")), `res-${s.active}`);
  await page.keyboard.press("ArrowUp");
  check("ArrowUp moves it back", (await P(() => window.__playground.search())).active, 0);
  await page.keyboard.press("Enter");
  check("Enter selects the first match", (await state()).selection.nodes.map((n) => n.id), ["s:alice"]);
  const vs = await vpOf();
  check("... and centres it", [vs.center_x, vs.center_y], [alice.mx, alice.my]);
  check("... and gives it the semantic focus", (await state()).focus, { node: { id: "s:alice", type: "person" } });
  check("... the list closes (the combobox collapses) and the matches stay highlighted", await P(() => [document.getElementById("q").getAttribute("aria-expanded"), window.__playground.overlay().mode]), ["false", "search"]);
  await page.keyboard.press("ArrowDown");
  check("ArrowDown reopens the list", await P(() => document.getElementById("q").getAttribute("aria-expanded")), "true");
  await page.fill("#q", "company");
  s = await P(() => window.__playground.search());
  check("a type name finds every node of that type", [s.total >= 4, s.titles.slice(0, 4).sort()], [true, ["acme", "globex", "initech", "umbrella"]]);
  await page.fill("#q", "works_at");
  s = await P(() => window.__playground.search());
  truthy(`a relation name finds its edges (7), at most 8 listed: ${JSON.stringify(s)}`, s.total >= 7 && s.titles.length <= 8);
  await page.fill("#q", "zzzz-nothing");
  check("no match: nothing listed, a note says so", await P(() => [window.__playground.search().total, document.querySelector("#results .note").textContent]), [0, "No match."]);
  await page.fill("#q", "p");
  s = await P(() => window.__playground.search());
  truthy(`at most 8 rows are listed and the note says how many more: ${s.total} matches`, s.titles.length <= 8 && s.total > 8 && (await P(() => /more not listed/.test(document.getElementById("results").textContent))));
  await page.keyboard.press("Escape");
  check("Escape clears the query and closes the list", await P(() => [document.getElementById("q").value, document.getElementById("results").hidden]), ["", true]);
  await P(() => document.getElementById("graph").focus()); await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- filter (set-hidden)
  const totals = await P(() => { const m = window.__playground.model(); return { nodes: m.nodes.length, company: m.nodes.filter((n) => n.category === "company").length, edges: m.edges.length }; });
  await page.uncheck('#types-set input[aria-label="Show nodes of type company"]');
  let st = await state();
  check("hiding a type hides its nodes through set-hidden", st.hidden.nodes.length, totals.company);
  const effective = await P(() => { const m = window.__playground.model(); const h = new Set(window.__playground.state().hidden.nodes.map((n) => n.id)); return { edges: m.edges.filter((e) => h.has(m.nodes[e.src].ref.id) || h.has(m.nodes[e.tgt].ref.id)).length }; });
  const fc = await hiddenCount();
  check("the count line", fc, `Hidden: ${totals.company} of ${totals.nodes} nodes, ${effective.edges} of ${totals.edges} edges.`);
  check("the clear button is enabled", await P(() => document.getElementById("clear-filters").disabled), false);
  await page.fill("#q", "acme");
  s = await P(() => window.__playground.search());
  check("a hidden element is not listed but counted", [s.total, s.hidden >= 1], [0, true]);
  await page.fill("#q", "");
  await shot("1100-filter.png");
  await page.uncheck('#rels-set input[aria-label="Show relation KNOWS"]');
  st = await state();
  truthy("hiding a relation hides its edges (explicit set-hidden edges)", st.hidden.edges.length === 5);
  await page.click("#clear-filters");
  st = await state();
  check("Clear filters restores everything", [st.hidden.nodes.length, st.hidden.edges.length, await hiddenCount()], [0, 0, "Nothing hidden."]);
  check("... and the boxes", await P(() => [...document.querySelectorAll('#types-set input, #rels-set input')].every((b) => b.checked)), true);
  check("... and disables the clear button", await P(() => document.getElementById("clear-filters").disabled), true);

  // ---------------------------------------------------------------- drag (a new FIXED layout; the original is untouched)
  const origSha = await P(() => window.__playground.originalLayoutSha());
  const posBefore = await positions();
  // state to carry: a selection (carol), a hidden type (project), a zoomed viewport
  const carol = await nodeAt("carol");
  await page.mouse.click(carol.x, carol.y);
  await page.uncheck('#types-set input[aria-label="Show nodes of type project"]');
  await page.click("#zoom-in");
  const carried = await state();
  const bob = await nodeAt("bob");
  await page.mouse.move(bob.x, bob.y); await page.mouse.down();
  check("a press on a node starts nothing visible before the pointer moves", (await P(() => window.__playground.drag())).moved, false);
  await page.mouse.move(bob.x + 25, bob.y + 12, { steps: 3 });
  await page.mouse.move(bob.x + 60, bob.y + 40, { steps: 3 });
  await page.waitForFunction(() => window.__playground.overlay().mode === "drag", null, { timeout: 5000 });
  const dragging = await P(() => ({ drag: window.__playground.drag(), ov: window.__playground.overlay(), tag: !document.getElementById("previewtag").hidden, committed: window.__playground.model().nodes.find((n) => n.label === "bob").x }));
  check("mid-drag: the drag state, the preview overlay and the preview label", [dragging.drag.moved, dragging.ov.mode, dragging.ov.ring, dragging.tag], [true, "drag", "bob", true]);
  const zoomNow = carried.viewport.zoom;
  near("mid-drag: the preview position is the pointer displacement at the zoom (x)", dragging.ov.pos.x - bob.mx, (60 * 1e6) / zoomNow, 1500);
  near("mid-drag: the preview position is the pointer displacement at the zoom (y)", dragging.ov.pos.y - bob.my, (40 * 1e6) / zoomNow, 1500);
  check("mid-drag: the committed model is untouched", dragging.committed, bob.mx);
  await shot("1100-mid-drag.png");
  await page.mouse.up();
  await idle();
  const done = await P(() => ({ sha: window.__playground.model().layoutSha256, edited: window.__playground.edited(), orig: window.__playground.originalLayoutSha(), msg: document.getElementById("message").textContent }));
  truthy(`the release commits a new layout hash: ${done.sha}`, done.sha !== origSha && done.edited.edited === true && done.edited.moves === 1);
  check("the original layout hash is unchanged", done.orig, origSha);
  const posAfter = await positions();
  const diff = posAfter.filter((p, i) => p[1] !== posBefore[i][1] || p[2] !== posBefore[i][2]).map((p) => p[0]);
  check("only the dragged node moved", diff, ["bob"]);
  const bobAfter = posAfter.find((p) => p[0] === "bob");
  near("bob moved by the pointer displacement (x)", bobAfter[1] - bob.mx, (60 * 1e6) / zoomNow, 1500);
  near("bob moved by the pointer displacement (y)", bobAfter[2] - bob.my, (40 * 1e6) / zoomNow, 1500);
  const stAfter = await state();
  check("selection, hidden set, focus and viewport are carried across by address", [stAfter.selection, stAfter.hidden, stAfter.focus, stAfter.viewport], [carried.selection, carried.hidden, carried.focus, carried.viewport]);
  check("the state is bound to the new layout", stAfter.layout_sha256, done.sha);
  truthy(`the message names the new layout and the unchanged original: ${done.msg}`, /Moved bob/.test(done.msg) && done.msg.includes(origSha.slice(0, 12)));
  check("the layout panel says edited", await P(() => /^Edited: 1 move/.test(document.getElementById("layoutinfo").textContent)), true);
  check("the host canvas shows the new layout: the companion and the picker follow (bob is picked at its new place)", await P(() => document.querySelectorAll('#graph [role="option"]').length > 0), true);
  const bobNew = await nodeAt("bob");
  await move(bobNew.x, bobNew.y);
  check("hover after the commit picks the moved node", (await overlay()).ring, "bob");
  await out();
  // Escape cancels a drag
  await page.mouse.move(bobNew.x, bobNew.y); await page.mouse.down(); await page.mouse.move(bobNew.x + 50, bobNew.y + 50, { steps: 3 });
  await page.waitForFunction(() => window.__playground.overlay().mode === "drag", null, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await idle();
  check("Escape cancels the drag: nothing committed", [await P(() => window.__playground.drag()), (await P(() => window.__playground.edited())).moves, (await positions()).find((p) => p[0] === "bob")[1]], [null, 1, bobAfter[1]]);
  // a second drag, then Reset layout: the original hash and positions return
  await page.mouse.move(bobNew.x, bobNew.y); await page.mouse.down(); await page.mouse.move(bobNew.x - 40, bobNew.y + 10, { steps: 3 }); await page.mouse.up();
  await idle();
  check("a second drag: a second move", (await P(() => window.__playground.edited())).moves, 2);
  // the keyboard alternative: Alt+Shift+arrow nudges the selected node
  await page.click("#clear-filters");
  await page.click("#fit");
  const erin = await nodeAt("erin");
  await page.mouse.click(erin.x, erin.y);
  const erinBefore = (await positions()).find((p) => p[0] === "erin");
  await P(() => document.getElementById("graph").focus());
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await idle();
  const erinAfter = (await positions()).find((p) => p[0] === "erin");
  near("Alt+Shift+ArrowRight nudges the selected node to the right by 16 px", erinAfter[1] - erinBefore[1], (16 * 1e6) / (await vpOf()).zoom, 1200);
  check("... and not up or down", erinAfter[2], erinBefore[2]);
  await page.click("#reset-layout");
  await idle();
  const reset = await P(() => ({ sha: window.__playground.model().layoutSha256, edited: window.__playground.edited(), dis: document.getElementById("reset-layout").disabled }));
  check("Reset layout: the original hash, not edited, the button disabled again", [reset.sha, reset.edited.edited, reset.dis], [origSha, false, true]);
  check("... and the original positions", await positions(), posBefore);
  // a click without movement selects (binder-equivalent) and a drag with a modifier is the binder's, not ours
  await page.click("#fit");
  const grace = await nodeAt("grace");
  await page.mouse.move(grace.x, grace.y); await page.mouse.down(); await page.mouse.move(grace.x + 2, grace.y + 1); await page.mouse.up();
  check("a press and release below the drag threshold is a click: it selects", [(await state()).selection.nodes.map((n) => n.id), (await P(() => window.__playground.edited())).edited], [["s:grace"], false]);
  await P(() => document.getElementById("graph").focus()); await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- the SVG host: the same hover and filter, the carried state
  await page.click("#host-svg");
  await page.waitForFunction(() => window.__playground.kind() === "svg", null, { timeout: 15000 });
  check("SVG host: one svg, no host canvas (overlay and minimap remain)", await P(() => [document.querySelectorAll("#graph svg").length, document.querySelectorAll("#graph canvas").length, document.getElementById("host-svg").getAttribute("aria-pressed")]), [1, 0, "true"]);
  const aliceS = await nodeAt("alice");
  await move(aliceS.x, aliceS.y);
  ov = await overlay();
  check("SVG host hover: the same highlight", [ov.mode, ov.ring, ov.nodes], ["hover", "alice", expectNeighbours.nodes]);
  truthy("SVG host hover: the veil is drawn", (await veilAlpha()) > 100);
  await shot("1100-svg-hover.png");
  await out();
  await page.uncheck('#types-set input[aria-label="Show nodes of type company"]');
  check("SVG host filter: the nodes are hidden and the svg has no element for them", await P(() => [window.__playground.state().hidden.nodes.length, document.querySelectorAll("#graph g.igr-node").length]), [totals.company, totals.nodes - totals.company]);
  await page.click("#clear-filters");
  // a drag on the SVG host
  const daveS = await nodeAt("dave");
  await page.mouse.move(daveS.x, daveS.y); await page.mouse.down(); await page.mouse.move(daveS.x + 40, daveS.y + 30, { steps: 4 }); await page.mouse.up();
  await idle();
  check("SVG host drag: a new layout, one node changed", [(await P(() => window.__playground.edited())).moves, (await P(() => window.__playground.model().layoutSha256)) !== origSha], [1, true]);
  check("SVG host drag: the svg shows the new layout (the node's circle moved)", await P(() => { const g = document.querySelector('#graph g.igr-node[aria-label="person dave"] circle.igr-shape'); const m = window.__playground.model(), vp = window.__playground.state().viewport, n = m.nodes.find((x) => x.label === "dave"); const x = ((n.x - vp.center_x) * vp.zoom) / 1e6 + vp.width / 2; return Math.abs(Number(g.getAttribute("cx")) - x) < 0.01; }), true);
  await page.click("#reset-layout"); await idle();
  await page.click("#host-canvas");
  await page.waitForFunction(() => window.__playground.kind() === "canvas", null, { timeout: 15000 });
  check("back on Canvas: the companion is back", await P(() => document.querySelectorAll('#graph [role="option"]').length > 0), true);

  // ---------------------------------------------------------------- reduced motion, accessible names, the narrow page
  await page.emulateMedia({ reducedMotion: "reduce" });
  check("prefers-reduced-motion: no transition on the buttons", await P(() => getComputedStyle(document.getElementById("fit")).transitionDuration), "0s");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const unnamed = await P(() => [...document.querySelectorAll("button, input, canvas[role]")].filter((e) => !(e.getAttribute("aria-label") || (e.labels && e.labels.length) || e.textContent.trim())).map((e) => e.id || e.tagName));
  check("every control has an accessible name", unnamed, []);
  check("keyboard: Tab from the search box reaches Fit, Zoom in, Zoom out in order (Zoom to selection is disabled with no selection)", await (async () => { await page.focus("#q"); const ids = []; for (let i = 0; i < 3; i++) { await page.keyboard.press("Tab"); ids.push(await P(() => document.activeElement.id)); } return ids; })(), ["fit", "zoom-in", "zoom-out"]);
  await context.close();

  // the narrow page: 600 px
  const narrow = await browser.newContext({ viewport: { width: 600, height: 800 } });
  const np = await narrow.newPage();
  np.on("console", (m) => { if (m.type() === "error") errors.push(`narrow: ${m.text()}`); });
  np.on("pageerror", (e) => errors.push(`narrow: ${String(e)}`));
  await np.goto(url);
  await np.waitForFunction(() => window.__playground && window.__playground.ready, null, { timeout: 15000 });
  const nf = await np.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, gw: document.getElementById("graph").getBoundingClientRect().width, vp: window.__playground.state().viewport.width, mini: document.getElementById("minimap").getBoundingClientRect().width }));
  truthy(`600 px: no horizontal scroll: ${JSON.stringify(nf)}`, nf.sw <= nf.iw);
  truthy("600 px: the viewport follows the container", Math.abs(nf.gw - nf.vp) <= 1 && nf.gw > 400);
  truthy("600 px: the minimap is visible", nf.mini > 100);
  const nshot = async (name) => { if (shotDir) await np.screenshot({ path: join(shotDir, name) }); };
  await nshot("600-default.png");
  const nalice = await np.evaluate(() => { const p = window.__playground, m = p.model(), vp = p.state().viewport, r = document.getElementById("graph").getBoundingClientRect(), n = m.nodes.find((x) => x.label === "alice"); return { x: r.left + ((n.x - vp.center_x) * vp.zoom) / 1e6 + vp.width / 2, y: r.top + ((n.y - vp.center_y) * vp.zoom) / 1e6 + vp.height / 2 }; });
  await np.mouse.move(nalice.x, nalice.y);
  check("600 px: hover works", (await np.evaluate(() => window.__playground.overlay())).ring, "alice");
  await nshot("600-hover-node.png");
  await np.mouse.move(2, 2);
  await np.uncheck('#types-set input[aria-label="Show nodes of type person"]');
  await nshot("600-filter.png");
  await np.click("#clear-filters");
  await np.fill("#q", "ali");
  await nshot("600-search.png");
  await np.fill("#q", "");
  await np.click("#zoom-in"); await np.click("#zoom-in");
  await nshot("600-zoomed-minimap.png");
  await np.click("#fit");
  await np.setViewportSize({ width: 520, height: 800 });
  await np.waitForFunction(() => window.__playground.state().viewport.width === Math.floor(document.getElementById("graph").getBoundingClientRect().width) && window.__playground.state().viewport.width < 520, null, { timeout: 5000 });
  check("a window resize resizes the viewport (resize intent) and, as the view was at fit, fits again", await np.evaluate(() => { const st = window.__playground.state(); return [st.viewport.width === Math.floor(document.getElementById("graph").getBoundingClientRect().width), document.documentElement.scrollWidth <= window.innerWidth, window.__playground.atFit()]; }), [true, true, true]);
  await np.setViewportSize({ width: 600, height: 800 });
  await np.waitForFunction(() => window.__playground.state().viewport.width > 520, null, { timeout: 5000 });
  const nb = await np.evaluate(() => { const p = window.__playground, m = p.model(), vp = p.state().viewport, r = document.getElementById("graph").getBoundingClientRect(), n = m.nodes.find((x) => x.label === "dave"); return { x: r.left + ((n.x - vp.center_x) * vp.zoom) / 1e6 + vp.width / 2, y: r.top + ((n.y - vp.center_y) * vp.zoom) / 1e6 + vp.height / 2 }; });
  await np.mouse.move(nb.x, nb.y); await np.mouse.down(); await np.mouse.move(nb.x + 40, nb.y + 40, { steps: 4 });
  await np.waitForFunction(() => window.__playground.overlay().mode === "drag", null, { timeout: 5000 });
  await nshot("600-mid-drag.png");
  await np.mouse.up();
  await narrow.close();

  if (errors.length > 0) fail(`console or page errors: ${errors.join(" | ")}`);
  if (!process.exitCode) console.log(`playground smoke ok (Chromium ${browser.version()}, one engine, smoke only)`);
} catch (e) { fail(String(e && e.stack ? e.stack : e)); } finally { if (browser) await browser.close(); server.close(); }
