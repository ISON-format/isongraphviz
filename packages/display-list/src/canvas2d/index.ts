// src/canvas2d/index.ts - the Canvas 2D replay, the recorded stream and its readers (design 6). DOM-free; structural types only.
export type { Canvas2DLike, ReplaySource, ReplayOptions, WitnessReport } from "./types.js";
export { replayCanvas } from "./replay.js";
export { createRecordingContext, recordCanvasCalls } from "./record.js";
export type { RecordingContext } from "./record.js";
export { canvasStreamWitness, readoutFromCanvasStream } from "./witness.js";
export { resolveReplayOptions } from "./replay.js";
export type { ResolvedReplay } from "./replay.js";
