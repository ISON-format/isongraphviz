// Source-audit tests of the playground page (demo/playground.html, demo/playground.mjs; NON-NORMATIVE demo code). They read the files as text; the behaviour is the job
// of scripts/playground-smoke.mjs (real Chromium). The page must stay a demo layer: no network, no storage, no innerHTML-family API, no eval, no inline handler,
// public package entries only, and no dependence on label coordinates (another change moves the label placement in the libraries).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_DIR } from "./helpers.js";

const html = readFileSync(join(PKG_DIR, "demo", "playground.html"), "utf8");
const pageSource = readFileSync(join(PKG_DIR, "demo", "playground.mjs"), "utf8");
const libSource = readFileSync(join(PKG_DIR, "demo", "playground-lib.mjs"), "utf8");
const buildSource = readFileSync(join(PKG_DIR, "scripts", "build-demo.mjs"), "utf8");
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const page = code(pageSource), lib = code(libSource);

describe("demo/playground.html", () => {
  it("loads exactly the two local scripts: no network, no external script or style", () => {
    expect([...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])).toEqual(['<script src="out/playground-data.js">', '<script src="out/playground.js">']);
    expect(html).not.toMatch(/https?:|\/\/[a-z]|<link\b|@import|url\(/i);
  });
  it("has no inline event handler, no inline script text and no javascript: URL", () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html.replace(/<script\b[^>]*><\/script>/g, "")).not.toMatch(/<script/);
  });
  it("every button has type=button and an accessible name; every input an aria-label; the canvases are named or hidden", () => {
    for (const m of html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)) {
      expect(m[0], m[0]).toMatch(/type="button"/);
      expect(m[0].includes("aria-label=") || m[1]!.trim() !== "", m[0]).toBe(true);
    }
    for (const m of html.matchAll(/<input\b[^>]*>/g)) expect(m[0], m[0]).toMatch(/aria-label="/);
    for (const m of html.matchAll(/<canvas\b[^>]*>/g)) expect(/aria-hidden="true"|aria-label="/.test(m[0]), m[0]).toBe(true);
  });
  it("honours prefers-reduced-motion, has a viewport meta, a language and a visible focus style", () => {
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(html).toMatch(/transition: none !important/);
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1">/);
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/:focus-visible \{/);
  });
  it("is responsive: a media query narrows the layout", () => {
    expect(html).toMatch(/@media \(max-width: \d+px\)/);
  });
  it("has the controls of the four features: host switch, search (combobox + listbox), type and relation filters, toolbar, minimap, tooltip, preview label", () => {
    for (const id of ["host-canvas", "host-svg", "q", "results", "types-set", "rels-set", "clear-filters", "fit", "zoom-in", "zoom-out", "zoom-sel", "minimap", "tooltip", "previewtag", "reset-layout", "graph", "overlay", "message"]) expect(html, id).toMatch(new RegExp(`id="${id}"`));
    expect(html).toMatch(/role="combobox"/);
    expect(html).toMatch(/role="listbox"/);
    expect(html).toMatch(/role="tooltip"/);
    expect(html).toMatch(/aria-live="polite"/);
  });
});

describe("demo/playground.mjs", () => {
  it("imports only the declared packages (and the local lib), by their public entries", () => {
    const allowed = ["a11y-companion", "display-list", "interaction-core", "layout-core", "renderer-canvas", "renderer-core", "renderer-svg"].map((n) => `isongraph-visualize-${n}`);
    const froms = [...page.matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
    expect(froms.length).toBeGreaterThan(8);
    for (const f of froms) {
      if (f.startsWith("./")) { expect(f).toBe("./playground-lib.mjs"); continue; }
      const pkg = f.match(/^(isongraph-visualize-[a-z0-9-]+)(\/[a-z0-9]+)?$/);
      expect(pkg, f).not.toBeNull();
      expect(allowed, f).toContain(pkg![1]);
    }
    for (const f of froms) expect(f, f).not.toMatch(/\/src\/|\/dist\//);
  });
  it("is DOM-safe: no innerHTML-family API, eval, document.write, DOMParser, inline handler attribute, markup string or style attribute text", () => {
    expect(page).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|DOMParser|dangerouslySetInnerHTML/);
    expect(page).not.toMatch(/setAttribute\(\s*["'](?:style|href|src|on[a-z]+)["']/);
    expect(page).not.toMatch(/["'`]<[a-z]+[ >]/i);
    expect(page).not.toMatch(/setTimeout\(\s*["'`]/);
  });
  it("uses no network, no storage, no worker, no dynamic import", () => {
    expect(page).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\bimport\(|importScripts|Worker\(|navigator\./);
    expect(page).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\b/);
  });
  it("changes the view only through the frozen intents and the host renderer (dispatch), never the renderer's internals", () => {
    for (const t of ["select", "focus", "set-hidden", "set-viewport", "resize", "fit", "zoom"]) expect(page, t).toMatch(new RegExp(`type: "${t}"`));
    expect(page).toMatch(/\.dispatch\(/);
    expect(page).toMatch(/bindInteraction\(/);
    expect(page).toMatch(/adapterPointer: "none"/);
    expect(page).toMatch(/createDomCanvasRenderer\(\{ pointer: "none", liveRegion: "none", canvasLabel: "none" \}\)/);
    expect(page).toMatch(/createDomSvgRenderer\(\{ pointer: "none", liveRegion: "none", focusRestore: "none" \}\)/);
  });
  it("builds a dragged layout through layout-core's public FIXED API and rebuilds the model; it writes no layout byte itself", () => {
    expect(page).toMatch(/computeFixedLayout\(/);
    expect(page).toMatch(/buildRenderModel\(/);
    expect(page).toMatch(/normalizeState\(/);
    expect(page).not.toMatch(/layoutToBytes|canonicalBytes|serializeLayout|JSON\.stringify\(\s*\{\s*(?:igl|address_scheme)/);
    expect(page).not.toMatch(/layoutBytes\s*\[|layoutBytes\.(?:set|fill|copyWithin)\(/);
  });
  it("draws the highlight and the drag preview from the libraries' display list; it computes no label position and draws no label", () => {
    expect(page).toMatch(/buildDisplayList\(/);
    expect(page).toMatch(/replayCanvas\(/);
    expect(page).not.toMatch(/fillText|strokeText|measureText|LABEL_DY|ELABEL_DY|r\[0\] === "T"|"T"/);
    expect(lib).not.toMatch(/label.*(?:\.x|\.y)\b.*offset|LABEL_DY/);
  });
  it("respects reduced motion: no animation API, no animated transition driven from script", () => {
    expect(page).toMatch(/prefers-reduced-motion: reduce/);
    expect(page).toMatch(/setReducedMotion\(/);
    expect(page).not.toMatch(/\.animate\(|requestAnimationFrame|transition|@keyframes/);
  });
  it("sets graph-derived text only through textContent (labels, ids, types, search rows, tooltip)", () => {
    expect(page).toMatch(/\.textContent = /);
    expect((page.match(/\.textContent = /g) ?? []).length).toBeGreaterThan(15);
  });
});

describe("demo/playground-lib.mjs", () => {
  it("is pure: no DOM, no timer, no randomness, no clock, no import", () => {
    expect(lib).not.toMatch(/\bdocument\b|\bwindow\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|\bDate\b|\bimport\b|\brequire\(/);
  });
});

describe("scripts/build-demo.mjs", () => {
  it("bundles the playground beside the demo page and writes its data from the sample source", () => {
    expect(buildSource).toMatch(/playground\.mjs/);
    expect(buildSource).toMatch(/playground\.js/);
    expect(buildSource).toMatch(/playground-sample\.ison/);
    expect(buildSource).toMatch(/playground-data\.js/);
  });
});
