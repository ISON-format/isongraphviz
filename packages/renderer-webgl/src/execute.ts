// src/execute.ts - the WebGL2 executor and its call sequence (design 7.5): resource creation with fail-closed cleanup, one frame of a plan, deletion and
// release. The executor replays; it decides nothing (Law 6): no record is added, dropped or reordered, and `shaderSource` receives only the constants of
// SHADER_SOURCES (H-4, 11.3).
import { IgrError } from "isongraph-visualize-renderer-core";
import { ownData } from "./own.js";
import { LAYER_PROGRAM, PROGRAMS, STRIDE, VERTS, type GlProgram } from "./constants.js";
import type { Gl2Like, GlHandle } from "./gl.js";
import type { GlPlan } from "./plan.js";
import { SHADER_SOURCES } from "./shaders.js";

/** One attribute of a program (7.4): its offset, component count and whether it is read as an integer attribute. */
interface AttribSpec { readonly name: string; readonly size: number; readonly offset: number; readonly int: boolean }
const ATTRIBS: Readonly<Record<GlProgram, readonly AttribSpec[]>> = {
  arrow: [{ name: "a_tb1", size: 4, offset: 0, int: false }, { name: "a_b2", size: 2, offset: 16, int: false }],
  disc: [{ name: "a_center", size: 2, offset: 0, int: false }, { name: "a_meta", size: 4, offset: 12, int: true }],
  edge: [{ name: "a_ab", size: 4, offset: 0, int: false }, { name: "a_cb", size: 4, offset: 16, int: false }, { name: "a_meta", size: 4, offset: 36, int: true }],
};

export interface GlProgramResources {
  readonly program: GlHandle;
  readonly vao: GlHandle;
  readonly buffer: GlHandle;
  readonly attribs: readonly number[];
  readonly uView: GlHandle | null;
  readonly uInk: GlHandle | null;
}
/** The GL objects of one context (7.5): created once per context, rebuilt after a restore. */
export interface GlResources { readonly programs: Readonly<Record<GlProgram, GlProgramResources>> }

export interface GlFrame { widthPx: number; heightPx: number; ink: readonly [number, number, number] }

const MODE = { arrow: "TRIANGLES", disc: "TRIANGLE_STRIP", edge: "TRIANGLE_STRIP" } as const;
/** At most 120 characters of the driver's log, cut at a scalar boundary (a surrogate pair is never split, audit N-2). */
function cutLog(log: string): string {
  const s = log.slice(0, 120);
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s;
}
const failure = (token: string, log?: string | null): IgrError => new IgrError("INVALID_INPUT", "INVALID_VALUE", "gl", token + (log === undefined || log === null || log === "" ? "" : ":" + cutLog(log)));

interface Created { kind: "shader" | "program" | "vao" | "buffer"; handle: GlHandle; alive: boolean }

/**
 * createGlResources(gl) (7.5): for each program in the order arrow, disc, edge the two shaders, the program, the attribute and uniform locations and the
 * vertex array; then the three buffers. A false status, or a context that is lost after a status check, stops creation. On failure every object created
 * so far and still alive is deleted in reverse creation order (none if the context is lost), the driver's info log is read once (before the cleanup, only
 * if the context is usable), and the error is `INVALID_INPUT/INVALID_VALUE` with `detail` `COMPILE_FAILED`, `LINK_FAILED` or `CONTEXT_LOST`, a colon and at
 * most 120 characters of the log.
 */
export function createGlResources(gl: Gl2Like): GlResources {
  const created: Created[] = [];
  const cleanup = (): void => {
    if (gl.isContextLost()) return;
    for (let i = created.length - 1; i >= 0; i--) {
      const c = created[i]!;
      if (!c.alive) continue;
      if (c.kind === "shader") gl.deleteShader(c.handle);
      else if (c.kind === "vao") gl.deleteVertexArray(c.handle);
      else if (c.kind === "program") gl.deleteProgram(c.handle);
      else gl.deleteBuffer(c.handle);
    }
  };
  const make = (kind: Created["kind"], handle: GlHandle | null): Created => {
    if (handle === null) throw failure("CONTEXT_LOST");
    const c: Created = { kind, handle, alive: true };
    created.push(c);
    return c;
  };
  const programs: Partial<Record<GlProgram, GlProgramResources>> = {};
  try {
    for (const p of PROGRAMS) {
      const shaders: Created[] = [];
      for (const stage of ["vs", "fs"] as const) {
        const s = make("shader", gl.createShader(stage === "vs" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER));
        shaders.push(s);
        gl.shaderSource(s.handle, SHADER_SOURCES[p][stage]);
        gl.compileShader(s.handle);
        const ok = gl.getShaderParameter(s.handle, gl.COMPILE_STATUS) === true;
        if (gl.isContextLost()) throw failure("CONTEXT_LOST");
        if (!ok) throw failure("COMPILE_FAILED", gl.getShaderInfoLog(s.handle));
      }
      const prog = make("program", gl.createProgram());
      for (const s of shaders) gl.attachShader(prog.handle, s.handle);
      gl.linkProgram(prog.handle);
      const linked = gl.getProgramParameter(prog.handle, gl.LINK_STATUS) === true;
      if (gl.isContextLost()) throw failure("CONTEXT_LOST");
      if (!linked) throw failure("LINK_FAILED", gl.getProgramInfoLog(prog.handle));
      for (const s of shaders) { gl.deleteShader(s.handle); s.alive = false; }
      const attribs = ATTRIBS[p].map((a) => gl.getAttribLocation(prog.handle, a.name));
      const uView = gl.getUniformLocation(prog.handle, "u_view"), uInk = gl.getUniformLocation(prog.handle, "u_ink");
      const vao = make("vao", gl.createVertexArray());
      programs[p] = { program: prog.handle, vao: vao.handle, buffer: undefined as unknown as GlHandle, attribs, uView, uInk };
    }
    for (const p of PROGRAMS) {
      const b = make("buffer", gl.createBuffer());
      programs[p] = { ...programs[p]!, buffer: b.handle };
    }
  } catch (e) {
    if (e instanceof IgrError && e.detail?.startsWith("CONTEXT_LOST") === true) throw e;
    cleanup();
    throw e;
  }
  return { programs: programs as Record<GlProgram, GlProgramResources> };
}

/** deleteGlResources(gl, r) (7.5): in reverse creation order, `deleteBuffer` edge, disc, arrow, then for edge, disc, arrow `deleteVertexArray` and `deleteProgram`. */
export function deleteGlResources(gl: Gl2Like, r: GlResources): void {
  for (const p of ["edge", "disc", "arrow"] as const) gl.deleteBuffer(r.programs[p].buffer);
  for (const p of ["edge", "disc", "arrow"] as const) { gl.deleteVertexArray(r.programs[p].vao); gl.deleteProgram(r.programs[p].program); }
}

/** The release of a context (7.6, 7.7): `WEBGL_lose_context`, when the extension exists. Nothing else is ever asked of `getExtension`. */
export function releaseGlContext(gl: Gl2Like): void {
  const ext = gl.getExtension("WEBGL_lose_context");
  if (ext !== null && ext !== undefined) ext.loseContext();
}

const fail = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);
function checkFrame(frame: unknown): GlFrame {
  const f = ownData(frame, "frame"); // each property is read once (27 14); an accessor is refused
  for (const k of ["widthPx", "heightPx"] as const) {
    if (typeof f[k] !== "number") throw fail("SCHEMA", `frame.${k}`, "number expected");
    if (!Number.isInteger(f[k]) || (f[k] as number) < 1 || (f[k] as number) > 16384) throw fail("OUT_OF_RANGE", `frame.${k}`);
  }
  const ink = f["ink"];
  if (!Array.isArray(ink) || ink.length !== 3) throw fail("SCHEMA", "frame.ink", "an array of three integers expected");
  const rgb = [ink[0], ink[1], ink[2]] as unknown[];
  for (const v of rgb) {
    if (typeof v !== "number" || !Number.isInteger(v)) throw fail("INVALID_VALUE", "frame.ink");
    if (v < 0 || v > 255) throw fail("OUT_OF_RANGE", "frame.ink");
  }
  return { widthPx: f["widthPx"] as number, heightPx: f["heightPx"] as number, ink: [rgb[0] as number, rgb[1] as number, rgb[2] as number] };
}

/**
 * executePlan(gl, plan, resources, frame) (7.5): `viewport` from the frame, `clearColor(0,0,0,0)`, `clear`, `enable(BLEND)`, `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`,
 * each non-empty buffer uploaded (arrow, disc, edge), then every draw in plan order, finally `bindVertexArray(null)`. The CSS size `u_view` is the plan header's
 * `w`, `h`; WebGL2 has no base instance, so the attribute offset carries `first`.
 */
export function executePlan(gl: Gl2Like, plan: GlPlan, resources: GlResources, frame: GlFrame): void {
  const f = checkFrame(frame);
  const [r, g, b] = f.ink;
  gl.viewport(0, 0, f.widthPx, f.heightPx);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  for (const p of PROGRAMS) {
    const bytes = plan.buffers[p];
    if (bytes.length === 0) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.programs[p].buffer);
    gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
  }
  for (const d of plan.header.draws) {
    const p = LAYER_PROGRAM[d.layer]!;
    const res = resources.programs[p];
    gl.useProgram(res.program);
    gl.uniform2f(res.uView, plan.header.w, plan.header.h);
    gl.uniform3f(res.uInk, r / 255, g / 255, b / 255);
    gl.bindVertexArray(res.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, res.buffer);
    ATTRIBS[p].forEach((a, i) => {
      const loc = res.attribs[i]!;
      const offset = d.first * STRIDE[p] + a.offset;
      gl.enableVertexAttribArray(loc);
      if (a.int) gl.vertexAttribIPointer(loc, a.size, gl.UNSIGNED_BYTE, STRIDE[p], offset);
      else gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, STRIDE[p], offset);
      gl.vertexAttribDivisor(loc, 1);
    });
    gl.drawArraysInstanced(MODE[p] === "TRIANGLES" ? gl.TRIANGLES : gl.TRIANGLE_STRIP, 0, VERTS[p], d.count);
  }
  gl.bindVertexArray(null);
}
