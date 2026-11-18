// src/canvas2d/types.ts - the structural 2D context (design 6.1) and the replay source and options. No DOM lib: a real CanvasRenderingContext2D satisfies it.
import type { DlRecord, ElementAddress, WireEdge, WireNode } from "../types.js";

/** Exactly what a replay touches. Nothing else is ever called or assigned (no save, restore, translate, scale, rotate, clip, measureText, drawImage, ...). */
export interface Canvas2DLike {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  setLineDash(segments: number[]): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  direction: string;
}

/** A display list, or the text section of a plan (7.2). */
export interface ReplaySource { readonly width: number; readonly height: number; readonly records: readonly DlRecord[] }

export interface ReplayOptions {
  dprMilli?: number;
  ink?: readonly [number, number, number];
  layers?: readonly number[];
  onElement?: (pid: number, layer: number) => void;
}

/** The kit's WitnessReport (27 13.3), structurally. */
export interface WitnessReport {
  backend: string;
  elements: { nodes: WireNode[]; edges: WireEdge[] };
  texts: { address: ElementAddress; text: string }[];
}
