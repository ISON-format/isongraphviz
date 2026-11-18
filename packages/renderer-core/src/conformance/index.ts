// src/conformance/index.ts - the conformance kit (pure: no node:* import; Corpus is in memory).
export { runConformance, checksFor, errName } from "./run.js";
export type { CheckId, ConformanceOptions, ConformanceReport, ConformanceSubject, VectorResult, WitnessReport } from "./run.js";
export { KIT_DIGEST, PINNED_CORPUS_DIGEST, normalizePath, parseExpect, parseSums, verifyCorpus } from "./corpus.js";
export type { Corpus, ExpectRow } from "./corpus.js";
export { compareProjections } from "../report.js";
export { generateModel, MAX_GENERATED_NODES } from "./generate.js";
