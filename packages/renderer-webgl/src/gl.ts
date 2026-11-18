// src/gl.ts - the structural WebGL2 interface (design 7.5): exactly the calls the executor, the probe and the controller make, so that the core entry needs
// no DOM lib and a real WebGL2RenderingContext satisfies it. Nothing else is ever called or read.
/** An opaque GL object (a shader, program, buffer, vertex array or uniform location). */
export type GlHandle = object;

export interface Gl2Like {
  // constants read from the context (a real context carries them; a fake supplies its own values)
  readonly VERTEX_SHADER: number; readonly FRAGMENT_SHADER: number; readonly COMPILE_STATUS: number; readonly LINK_STATUS: number;
  readonly ARRAY_BUFFER: number; readonly DYNAMIC_DRAW: number; readonly FLOAT: number; readonly UNSIGNED_BYTE: number;
  readonly TRIANGLES: number; readonly TRIANGLE_STRIP: number; readonly BLEND: number; readonly ONE: number; readonly ONE_MINUS_SRC_ALPHA: number;
  readonly COLOR_BUFFER_BIT: number; readonly MAX_VERTEX_ATTRIBS: number; readonly MAX_VIEWPORT_DIMS: number; readonly HIGH_FLOAT: number;
  /** The size of the drawing buffer the context actually has (7.5, 7.9: the adapter fails closed unless it equals the planned backing size). */
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  // resource creation, failure detail and deletion (7.5)
  createShader(type: number): GlHandle | null;
  shaderSource(shader: GlHandle, source: string): void;
  compileShader(shader: GlHandle): void;
  getShaderParameter(shader: GlHandle, pname: number): unknown;
  getShaderInfoLog(shader: GlHandle): string | null;
  createProgram(): GlHandle | null;
  attachShader(program: GlHandle, shader: GlHandle): void;
  linkProgram(program: GlHandle): void;
  getProgramParameter(program: GlHandle, pname: number): unknown;
  getProgramInfoLog(program: GlHandle): string | null;
  deleteShader(shader: GlHandle | null): void;
  deleteProgram(program: GlHandle | null): void;
  getAttribLocation(program: GlHandle, name: string): number;
  getUniformLocation(program: GlHandle, name: string): GlHandle | null;
  createVertexArray(): GlHandle | null;
  deleteVertexArray(vao: GlHandle | null): void;
  createBuffer(): GlHandle | null;
  deleteBuffer(buffer: GlHandle | null): void;
  // the frame
  viewport(x: number, y: number, w: number, h: number): void;
  clearColor(r: number, g: number, b: number, a: number): void;
  clear(mask: number): void;
  enable(cap: number): void;
  blendFunc(src: number, dst: number): void;
  bindBuffer(target: number, buffer: GlHandle | null): void;
  bufferData(target: number, data: Uint8Array, usage: number): void;
  useProgram(program: GlHandle | null): void;
  uniform2f(loc: GlHandle | null, x: number, y: number): void;
  uniform3f(loc: GlHandle | null, x: number, y: number, z: number): void;
  bindVertexArray(vao: GlHandle | null): void;
  enableVertexAttribArray(index: number): void;
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void;
  vertexAttribIPointer(index: number, size: number, type: number, stride: number, offset: number): void;
  vertexAttribDivisor(index: number, divisor: number): void;
  drawArraysInstanced(mode: number, first: number, count: number, instances: number): void;
  // loss, release and the probe
  isContextLost(): boolean;
  getExtension(name: string): { loseContext(): void } | null | undefined;
  getParameter(pname: number): unknown;
  getShaderPrecisionFormat(shaderType: number, precisionType: number): { precision: number } | null;
}

/** The context type a canvas-like hands out (the probe asks for "webgl2" and, for the label layer, "2d"). */
export interface GlCanvasLike {
  getContext(type: string, attributes?: unknown): unknown;
  addEventListener(type: string, listener: (event: GlEventLike) => void): void;
  removeEventListener(type: string, listener: (event: GlEventLike) => void): void;
  width: number;
  height: number;
}
export interface GlEventLike { preventDefault(): void }
