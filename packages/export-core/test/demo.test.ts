// Design 17.2: source-audit tests of the demo page (demo/index.html, demo/page.mjs). They read the two files as text; nothing here is a browser behaviour (the
// behaviour is the job of scripts/browser-smoke.mjs). The page is not part of src/, so surface.test.ts does not see it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_DIR } from "./helpers.js";

const html = readFileSync(join(PKG_DIR, "demo", "index.html"), "utf8");
const pageSource = readFileSync(join(PKG_DIR, "demo", "page.mjs"), "utf8");
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const page = code(pageSource);

describe("demo/index.html (17.2): four buttons", () => {
  it("has the buttons fit, export, gate and toggle (labelled `toggle SVG`), in this order, and nothing else interactive", () => {
    const buttons = [...html.matchAll(/<button id="([a-z]+)">([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
    expect(buttons).toEqual([["fit", "fit"], ["export", "export bundle"], ["gate", "gate"], ["toggle", "toggle SVG"]]);
    expect((html.match(/<button\b/g) ?? []).length).toBe(4);
    expect(html).not.toMatch(/<(?:a|input|select|textarea|summary)\b|tabindex="0"/);
  });
  it("loads exactly the two local scripts: no network, no external script", () => {
    expect([...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])).toEqual(['<script src="out/data.js">', '<script src="out/demo.js">']);
    expect(html).not.toMatch(/https?:|\/\/[a-z]/i);
  });
});

describe("demo/page.mjs (17.2): the toggle SVG item", () => {
  it("imports the V5 DOM adapter and the SVG core functions it needs, and no other package entry beyond the declared dependencies", () => {
    expect(page).toMatch(/from "isongraph-visualize-renderer-svg\/dom"/);
    expect(page).toMatch(/createDomSvgRenderer/);
    expect(page).toMatch(/from "isongraph-visualize-renderer-svg"/);
    for (const m of page.matchAll(/from "(isongraph-visualize-[a-z0-9-]+)(?:\/[a-z0-9]+)?"/g)) {
      expect(["a11y-companion", "interaction-core", "renderer-canvas", "renderer-core", "renderer-svg"].map((n) => `isongraph-visualize-${n}`), m[0]).toContain(m[1]);
    }
  });
  it("wires the toggle button and swaps hosts: the binder, the companion and the renderer are disposed, a new renderer is initialised and loaded", () => {
    expect(page).toMatch(/getElementById\("toggle"\)/);
    expect(page).toMatch(/binding\.dispose\(\)/);
    expect(page).toMatch(/companion\.dispose\(\)/);
    expect(page).toMatch(/renderer\.dispose\(\)/);
    expect(page).toMatch(/createDomSvgRenderer\(/);
  });
  it("builds the Canvas renderer and the SVG renderer with the adapter's own pointer handling, live region, canvas label and focus restoration all off (5.8, 9.7)", () => {
    expect(page).toMatch(/createDomCanvasRenderer\(\{ pointer: "none", liveRegion: "none", canvasLabel: "none" \}\)/);
    expect(page).toMatch(/createDomSvgRenderer\(\{ pointer: "none", liveRegion: "none", focusRestore: "none" \}\)/);
    expect((page.match(/adapterPointer: "none"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((page.match(/adapterFocusRestore: "none"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("runs the gate with the svg-native composition on the SVG host (the names, tabindex values and root title and description of a readSvg result) and the companion composition on Canvas", () => {
    expect(page).toMatch(/composition: "svg-native"/);
    expect(page).toMatch(/readSvg\(/);
    expect(page).toMatch(/runAccessibilityGate\(/);
    expect(page).toMatch(/buildCompanionTree\(/);
  });
  it("mounts no companion for the SVG host: mountCompanion is called only on the Canvas path", () => {
    expect((page.match(/mountCompanion\(/g) ?? []).length).toBe(1);
  });
  it("the SVG host's input path of 9.7: elements are found by their decoded ids, DOM focus is moved by the binder's focusElement, the own status text comes from liveText", () => {
    expect(page).toMatch(/decodeElementId\(/);
    expect(page).toMatch(/elementDomId\(/);
    expect(page).toMatch(/pickElement\(/);
    expect(page).toMatch(/liveText\(/);
    expect(page).toMatch(/omitFocusAnnouncement: true/);
  });
  it("no innerHTML-family API, eval, document.write, style or href attribute text, no network, no storage, no timer-driven code", () => {
    expect(page).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setAttribute\(\s*["'](?:style|href|on[a-z]+)["']|\.style\b|dangerouslySetInnerHTML|DOMParser/);
    expect(page).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\bimport\(|importScripts|Worker\(/);
    expect(page).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\b/);
    expect(page).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|\bDate\b|Math\.random/);
  });
});
