// Test doubles for the executor, the probe and the controller (design 7.5-7.7, 13.2): a fake Gl2Like that records the call log of 7.5, a fake canvas that fires
// context events, and a probe factory. A double throws on every member that is not in Gl2Like (7.5: "nothing else is called"), so a call outside the
// interface is a test failure. Test code: nothing here is imported by src/.
import { createHash } from "node:crypto";
import type { Gl2Like, GlCanvasLike, GlEventLike } from "../src/gl.js";

export function canon(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (typeof v === "object" && v !== null) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(v);
}
export const sha16 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex").slice(0, 16);

const NAMES = ["arrow", "disc", "edge"] as const;
const CONST = {
  VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82, ARRAY_BUFFER: 0x8892, DYNAMIC_DRAW: 0x88e8, FLOAT: 0x1406,
  UNSIGNED_BYTE: 0x1401, TRIANGLES: 4, TRIANGLE_STRIP: 5, BLEND: 0xbe2, ONE: 1, ONE_MINUS_SRC_ALPHA: 0x303, COLOR_BUFFER_BIT: 0x4000,
  MAX_VERTEX_ATTRIBS: 0x8869, MAX_VIEWPORT_DIMS: 0xd3a, HIGH_FLOAT: 0x8df2,
} as const;
const CONST_NAME = new Map<number, string>(Object.entries(CONST).map(([k, v]) => [v, k] as const));
const sym = (n: number): string => CONST_NAME.get(n) ?? String(n);

interface Handle { readonly kind: string; readonly name: string }

export interface FakeGlOptions {
  log: string[];
  /** The shader (e.g. `disc.fs`) whose compilation fails. */
  failCompile?: string;
  /** The program (e.g. `edge`) whose link fails. */
  failLink?: string;
  infoLog?: string;
  /** Extensions the context offers. */
  extensions?: readonly string[];
  /** Probe parameters. */
  vertexPrecision?: number; fragmentPrecision?: number; maxVertexAttribs?: number; maxViewportDims?: readonly [number, number];
  /** The drawing-buffer size the context reports (the adapter test makes it differ from the canvas). */
  drawingBuffer?: () => readonly [number, number];
  /** Throws from the named probe call (row P12). */
  throws?: "getParameter" | "getShaderPrecisionFormat" | "getContext" | null;
}
export interface FakeGl extends Gl2Like {
  lost: boolean;
  /** Arms a loss that happens right after the next `getShaderParameter` of `arrow.vs` (the controller convention of 7.6). */
  loseAfterArrowVs: boolean;
}

/** A fake context that logs the calls of 7.5 in the form of the corpus; any member outside Gl2Like throws. */
export function createFakeGl(o: FakeGlOptions): FakeGl {
  const counts = { shader: 0, program: 0, vao: 0, buffer: 0 };
  const names = new Map<unknown, string>();
  const put = (...line: unknown[]): void => { o.log.push(canon(line)); };
  const nameOf = (h: unknown): string => (h === null ? "null" : (h as Handle).name);
  const attribNames = new WeakMap<object, string>();
  const state = { lost: false, loseAfterArrowVs: false };
  // Object names are the structural names of the corpus (arrow.vs, ... edge; 7.5), assigned in creation order within one creation GENERATION. A generation starts at
  // the first creation call after (a) a restore (below) or (b) every object of the previous generation was deleted (a failed creation cleans up after itself, so a
  // second initialize without a restore begins at arrow.vs again: gl:U53; a lost context cleans up nothing and only a restore starts the next generation).
  const live = new Set<Handle>();
  const born = <T extends Handle>(h: T): T => { live.add(h); return h; };
  const gone = (h: Handle): void => { live.delete(h); };
  const newGeneration = (): void => { counts.shader = 0; counts.program = 0; counts.vao = 0; counts.buffer = 0; };
  const startIfDrained = (): void => { if (live.size === 0) newGeneration(); };
  const shaderName = (n: number): string => `${NAMES[n >> 1]}.${n & 1 ? "fs" : "vs"}`;
  const api = {
    ...CONST,
    createShader: (t: number) => { startIfDrained(); const h: Handle = born({ kind: "shader", name: shaderName(counts.shader++) }); put("createShader", h.name, sym(t)); return h; },
    shaderSource: (s: Handle, src: string) => put("shaderSource", s.name, sha16(src)),
    compileShader: (s: Handle) => put("compileShader", s.name),
    getShaderParameter: (s: Handle, p: number) => {
      put("getShaderParameter", s.name, sym(p));
      const ok = o.failCompile !== s.name;
      if (s.name === "arrow.vs" && state.loseAfterArrowVs) { state.loseAfterArrowVs = false; state.lost = true; }
      return ok;
    },
    getShaderInfoLog: (s: Handle) => { put("getShaderInfoLog", s.name); return o.infoLog ?? ""; },
    createProgram: () => { const h: Handle = born({ kind: "program", name: NAMES[counts.program++]! }); put("createProgram", h.name); return h; },
    attachShader: (p: Handle, s: Handle) => put("attachShader", p.name, s.name),
    linkProgram: (p: Handle) => put("linkProgram", p.name),
    getProgramParameter: (p: Handle, n: number) => { put("getProgramParameter", p.name, sym(n)); return o.failLink !== p.name; },
    getProgramInfoLog: (p: Handle) => { put("getProgramInfoLog", p.name); return o.infoLog ?? ""; },
    deleteShader: (s: Handle) => { gone(s); put("deleteShader", s.name); },
    deleteProgram: (p: Handle) => { gone(p); put("deleteProgram", p.name); },
    getAttribLocation: (p: Handle, n: string) => { put("getAttribLocation", p.name, n); const loc = names.size; names.set(loc, `${p.name}.${n}`); return loc; },
    getUniformLocation: (p: Handle, n: string) => { put("getUniformLocation", p.name, n); const h: Handle = { kind: "uniform", name: `${p.name}.${n}` }; attribNames.set(h, h.name); return h; },
    createVertexArray: () => { const h: Handle = born({ kind: "vao", name: NAMES[counts.vao++]! }); put("createVertexArray", h.name); return h; },
    deleteVertexArray: (v: Handle) => { gone(v); put("deleteVertexArray", v.name); },
    createBuffer: () => { const h: Handle = born({ kind: "buffer", name: NAMES[counts.buffer++]! }); put("createBuffer", h.name); return h; },
    deleteBuffer: (b: Handle) => { gone(b); put("deleteBuffer", b.name); },
    viewport: (x: number, y: number, w: number, h: number) => put("viewport", x, y, w, h),
    clearColor: (r: number, g: number, b: number, a: number) => put("clearColor", r, g, b, a),
    clear: (m: number) => put("clear", sym(m)),
    enable: (c: number) => put("enable", sym(c)),
    blendFunc: (s: number, d: number) => put("blendFunc", sym(s), sym(d)),
    bindBuffer: (t: number, b: Handle | null) => put("bindBuffer", sym(t), b === null ? null : nameOf(b)),
    bufferData: (t: number, data: Uint8Array, u: number) => put("bufferData", sym(t), data.length, sha16(data), sym(u)),
    useProgram: (p: Handle | null) => put("useProgram", p === null ? null : nameOf(p)),
    uniform2f: (l: Handle, x: number, y: number) => put("uniform2f", l.name, x, y),
    uniform3f: (l: Handle, x: number, y: number, z: number) => put("uniform3f", l.name, Math.round(x * 255), Math.round(y * 255), Math.round(z * 255)),
    bindVertexArray: (v: Handle | null) => put("bindVertexArray", v === null ? null : nameOf(v)),
    enableVertexAttribArray: (i: number) => put("enableVertexAttribArray", names.get(i)),
    vertexAttribPointer: (i: number, size: number, type: number, norm: boolean, stride: number, off: number) => put("vertexAttribPointer", names.get(i), size, sym(type), norm, stride, off),
    vertexAttribIPointer: (i: number, size: number, type: number, stride: number, off: number) => put("vertexAttribIPointer", names.get(i), size, sym(type), stride, off),
    vertexAttribDivisor: (i: number, d: number) => put("vertexAttribDivisor", names.get(i), d),
    drawArraysInstanced: (m: number, f: number, c: number, n: number) => put("drawArraysInstanced", sym(m), f, c, n),
    isContextLost: () => state.lost,
    getExtension: (n: string) => {
      if (n !== "WEBGL_lose_context") throw new Error(`the probe and the adapter ask for WEBGL_lose_context only, not ${n}`);
      put("getExtension", n);
      return (o.extensions ?? ["WEBGL_lose_context"]).includes(n) ? { loseContext: () => put("loseContext") } : null;
    },
    getParameter: (p: number) => {
      put("getParameter", sym(p));
      if (o.throws === "getParameter") throw new Error("getParameter threw");
      return p === CONST.MAX_VERTEX_ATTRIBS ? (o.maxVertexAttribs ?? 16) : p === CONST.MAX_VIEWPORT_DIMS ? [...(o.maxViewportDims ?? [16384, 16384])] : undefined;
    },
    getShaderPrecisionFormat: (st: number, pt: number) => {
      put("getShaderPrecisionFormat", sym(st), sym(pt));
      if (o.throws === "getShaderPrecisionFormat") throw new Error("getShaderPrecisionFormat threw");
      return { precision: st === CONST.VERTEX_SHADER ? (o.vertexPrecision ?? 23) : (o.fragmentPrecision ?? 23) };
    },
  };
  return new Proxy(api, {
    get(t, k) {
      if (k === "drawingBufferWidth") return (o.drawingBuffer?.() ?? [300, 150])[0];
      if (k === "drawingBufferHeight") return (o.drawingBuffer?.() ?? [300, 150])[1];
      if (k === "lost") return state.lost;
      if (k === "loseAfterArrowVs") return state.loseAfterArrowVs;
      if (typeof k === "symbol" || k === "then" || k === "toJSON" || k === "asymmetricMatch" || k === "$$typeof" || k === "nodeType") return undefined;
      if (!(k in t)) throw new Error(`Gl2Like double: ${k} is not a member of the interface of 7.5`);
      return (t as Record<string, unknown>)[k];
    },
    set(_t, k, v) {
      if (k === "lost") { state.lost = v as boolean; if (v === false) { live.clear(); newGeneration(); } return true; } // a restore starts a new generation of objects
      if (k === "loseAfterArrowVs") { state.loseAfterArrowVs = v as boolean; return true; }
      throw new Error(`Gl2Like double: ${String(k)} is not assignable`);
    },
  }) as unknown as FakeGl;
}

// ---- the canvas and the probe factory ----------------------------------------------------------------------------------------------------------------
export interface FakeCanvasOptions {
  log: string[];
  /** The context of "webgl2" for the default request (`null`: refuses) and for the relaxed request (`undefined`: the same as the default). */
  webgl2: Gl2Like | null;
  webgl2Relaxed?: Gl2Like | null;
  /** "2d": true answers a 2D context, null refuses. */
  ctx2d?: boolean | null;
  oneContextType?: boolean;
  throws?: "getContext" | null;
  /** Whether getContext("webgl2") is logged (the probe and adapter rows log it; the controller rows do not). */
  logGetContext?: boolean;
}
export interface FakeCanvas extends GlCanvasLike {
  /** Fires the listeners of a type with an event that logs `preventDefault`. */
  fire(type: string): void;
  listeners(): string[];
}

export function createFakeCanvas(o: FakeCanvasOptions): FakeCanvas {
  const handlers = new Map<string, (e: GlEventLike) => void>();
  // The last handler ever registered per type. `fire` delivers to a REMOVED listener too (a late or queued event, or a browser that has not yet dropped it): after
  // `dispose` the controller must ignore L and R by itself (7.6, R31-11 (b); gl:U54-U57, mutants K168, K169), and a double that stopped delivering on removal would
  // make that rule untestable. Registered listeners are exactly `handlers` (`listeners()`).
  const lastOf = new Map<string, (e: GlEventLike) => void>();
  let first: string | undefined;
  const put = (...line: unknown[]): void => { o.log.push(canon(line)); };
  const c = {
    width: 300, height: 150,
    getContext(type: string, attrs?: unknown): unknown {
      if (o.throws === "getContext") throw new Error("getContext threw");
      if (o.oneContextType === true && first !== undefined && first !== type) return null;
      first ??= type;
      if (type === "webgl2") {
        if (o.logGetContext !== false) put("getContext", "webgl2", attrs);
        const relaxed = (attrs as { failIfMajorPerformanceCaveat?: boolean } | undefined)?.failIfMajorPerformanceCaveat === false;
        return relaxed && o.webgl2Relaxed !== undefined ? o.webgl2Relaxed : o.webgl2;
      }
      if (type === "2d") { put("getContext", "2d"); return o.ctx2d === false || o.ctx2d === null ? null : {}; }
      return null;
    },
    addEventListener(type: string, h: (e: GlEventLike) => void): void { handlers.set(type, h); lastOf.set(type, h); put("addEventListener", type); },
    removeEventListener(type: string): void { handlers.delete(type); put("removeEventListener", type); },
    fire(type: string): void { (handlers.get(type) ?? lastOf.get(type))?.({ preventDefault: () => put("preventDefault") }); },
    listeners: () => [...handlers.keys()],
  };
  return c as FakeCanvas;
}
