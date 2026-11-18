// src/browser.ts - the optional browser mode: playwright-core drives headless Chromium over the artifacts the Node pass wrote, and the page script measures the
// real DOM insertion of the SVG, the Canvas 2D replay and the WebGL2 draw. ONE machine, ONE engine; the GL is labelled software or hardware by the string the
// browser reports (UNMASKED_RENDERER, read here and never by the libraries). A measurement, not a qualification.
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarize, type Summary } from "./stats.js";

export interface BrowserCase { shape: string; size: string; nodes: number; edges: number; dir: string }
export interface SeriesSummary { [name: string]: Summary }
export interface BrowserCaseResult {
  shape: string; size: string; nodes: number; edges: number;
  svg?: SeriesSummary; svgElements?: number;
  canvas?: SeriesSummary;
  webgl?: SeriesSummary;
  errors: { renderer: "svg" | "canvas" | "webgl"; message: string }[];
}
export interface GlInfo { webgl2: boolean; renderer?: string; vendor?: string; version?: string; software: boolean | null; debugExtension?: boolean }
export interface BrowserProfileReport { name: string; launchArgs: string[]; gl: GlInfo; cases: BrowserCaseResult[] }
export interface BrowserReport { engine: string; version: string; userAgent: string; headless: true; viewport: { width: number; height: number }; reps: number; warmup: number; profiles: BrowserProfileReport[]; notes: string[] }

export interface BrowserOptions { reps: number; warmup: number; caseTimeoutMs?: number; log?: (line: string) => void }

const SOFTWARE_RE = /swiftshader|software|llvmpipe|basic render|microsoft basic/i;
export const isSoftwareRenderer = (renderer: string | undefined): boolean | null => (renderer === undefined ? null : SOFTWARE_RE.test(renderer));

/** The launch profiles tried: Chromium's default headless GL (SwiftShader here) and ANGLE on Direct3D 11 (the machine's own GPU, if it has one). */
export const GL_PROFILES: readonly { name: string; args: string[] }[] = [
  { name: "default-gl", args: [] },
  { name: "angle-d3d11", args: ["--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-gpu-rasterization"] },
];

const summarizeSeries = (s: Record<string, number[]>): SeriesSummary => {
  const out: SeriesSummary = {};
  for (const [k, v] of Object.entries(s)) if (k !== "elements" && k !== "contextLost" && v.length > 0) out[k] = summarize(v);
  return out;
};

export async function runBrowser(cases: BrowserCase[], o: BrowserOptions): Promise<BrowserReport> {
  const log = o.log ?? ((): void => undefined);
  const { chromium } = await import("playwright-core");
  const { build } = await import("esbuild");
  const here = dirname(fileURLToPath(import.meta.url));
  const pageSrc = resolve(here, "..", "src", "browser-page.ts");
  const bundle = (await build({ entryPoints: [pageSrc], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "error", target: "es2022" })).outputFiles[0]!.text;
  const html = '<!doctype html><meta charset="utf-8"><title>bench</title><body style="margin:0"><div id="host"></div><script src="/page.js"></script>';
  const byUrl = new Map(cases.map((c, i) => [`/data/${i}/`, c] as const));
  const server = http.createServer((q, s) => {
    const path = (q.url ?? "/").split("?")[0]!;
    const send = (type: string, body: Buffer | string): void => { s.setHeader("content-type", type); s.setHeader("cache-control", "no-store"); s.end(body); };
    if (path === "/" || path === "/index.html") return send("text/html", html);
    if (path === "/page.js") return send("text/javascript", bundle);
    for (const [prefix, c] of byUrl) {
      if (path.startsWith(prefix)) {
        const file = path.slice(prefix.length);
        if (file === "svg.txt" || file === "dl.bin" || file === "plan.bin") { try { return send(file === "svg.txt" ? "image/svg+xml" : "application/octet-stream", readFileSync(join(c.dir, file))); } catch { /* fall through */ } }
      }
    }
    s.statusCode = 404; s.end("not found");
  }).listen(0, "127.0.0.1");
  await new Promise<void>((res) => server.once("listening", () => res()));
  const port = (server.address() as { port: number }).port;
  const viewport = { width: 1280, height: 800 };
  const report: BrowserReport = {
    engine: "chromium", version: "", userAgent: "", headless: true, viewport, reps: o.reps, warmup: o.warmup, profiles: [],
    notes: ["One machine, one engine, one run: figures are noisy and not a qualification.", "Headless Chromium paints into an offscreen surface; frame times include the compositor's vsync wait (about 16.7 ms floor)."],
  };
  const timeout = o.caseTimeoutMs ?? 300_000;
  try {
    for (const prof of GL_PROFILES) {
      const browser = await chromium.launch({ args: prof.args });
      try {
        report.version = browser.version();
        const page = await browser.newPage({ viewport });
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(`http://localhost:${port}/`);
        await page.waitForFunction(() => (window as unknown as { __bench?: unknown }).__bench !== undefined, null, { timeout: 30_000 });
        const env = (await page.evaluate(() => (window as unknown as { __bench: { env(): Record<string, unknown> } }).__bench.env())) as Record<string, unknown>;
        report.userAgent = String(env["userAgent"] ?? "");
        const gl: GlInfo = { webgl2: env["webgl2"] === true, software: null };
        if (typeof env["renderer"] === "string") { gl.renderer = env["renderer"]; gl.software = isSoftwareRenderer(gl.renderer); }
        if (typeof env["vendor"] === "string") gl.vendor = env["vendor"];
        if (typeof env["version"] === "string") gl.version = env["version"];
        if (typeof env["debugExtension"] === "boolean") gl.debugExtension = env["debugExtension"];
        log(`browser ${prof.name}: ${browser.version()}, GL ${gl.renderer ?? "none"} (${gl.software === null ? "unknown" : gl.software ? "software" : "hardware"})`);
        const pr: BrowserProfileReport = { name: prof.name, launchArgs: prof.args, gl, cases: [] };
        const run = async (name: "svg" | "canvas" | "webgl", i: number, c: BrowserCase): Promise<Record<string, number[]>> => {
          const file = name === "svg" ? "svg.txt" : name === "canvas" ? "dl.bin" : "plan.bin";
          const call = page.evaluate(
            ([n, url, w, h, wu, rp]) => (window as unknown as { __bench: Record<string, (...a: unknown[]) => Promise<Record<string, number[]>>> }).__bench[n as string]!(url, w, h, wu, rp),
            [name, `/data/${i}/${file}`, viewport.width, viewport.height, o.warmup, o.reps] as const,
          );
          let timer: NodeJS.Timeout | undefined;
          const guard = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${timeout} ms`)), timeout); });
          try { return await Promise.race([call, guard]); } finally { if (timer) clearTimeout(timer); void c; }
        };
        for (let i = 0; i < cases.length; i++) {
          const c = cases[i]!;
          const res: BrowserCaseResult = { shape: c.shape, size: c.size, nodes: c.nodes, edges: c.edges, errors: [] };
          for (const name of ["svg", "canvas", "webgl"] as const) {
            if (name === "webgl" && !gl.webgl2) { res.errors.push({ renderer: name, message: "no WebGL2 context" }); continue; }
            try {
              const series = await run(name, i, c);
              if (name === "svg") { res.svg = summarizeSeries(series); res.svgElements = series["elements"]?.[0] ?? 0; }
              else if (name === "canvas") res.canvas = summarizeSeries(series);
              else res.webgl = summarizeSeries(series);
              log(`  ${prof.name} ${c.shape}/${c.size} ${name}: ${Object.entries(summarizeSeries(series)).map(([k, v]) => `${k} ${v.median.toFixed(1)}`).join(", ")}`);
            } catch (e) {
              res.errors.push({ renderer: name, message: e instanceof Error ? e.message.split("\n")[0]! : String(e) });
              log(`  ${prof.name} ${c.shape}/${c.size} ${name}: FAILED ${res.errors[res.errors.length - 1]!.message}`);
            }
          }
          pr.cases.push(res);
        }
        if (errors.length > 0) report.notes.push(`${prof.name}: page errors: ${errors.slice(0, 3).join(" | ")}`);
        report.profiles.push(pr);
      } finally { await browser.close(); }
    }
  } finally { server.close(); }
  return report;
}
