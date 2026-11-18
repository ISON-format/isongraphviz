import { createHeadlessRenderer } from "../src/headless/index.js";
import { runConformanceInternal, type ConformanceOptions, type ConformanceReport, type ConformanceSubject } from "../src/conformance/run.js";
import type { Corpus } from "../src/conformance/corpus.js";
import { buildMiniCorpus } from "./minicorpus.js";

export const referenceSubject = (): ConformanceSubject => ({ manifest: createHeadlessRenderer().manifest, create: async () => createHeadlessRenderer() });
let cached: Promise<Corpus> | undefined;
export const miniCorpus = (): Promise<Corpus> => (cached ??= buildMiniCorpus().then((x) => x.corpus));

/** The ids a corpus must contain for a run to count as complete: the mini corpus's own ids (the kit's 341 are for the oracle corpus). */
export const requiredOf = (corpus: Corpus): string[] => corpus.expect.map((r) => r.id);

/** The INTERNAL runner on a corpus with ITS OWN ids as the required list: such a run is always partial, level 0, unpinned, not claimable (N-1). */
export const kit = (subject: ConformanceSubject, corpus: Corpus, options: ConformanceOptions = {}): Promise<ConformanceReport> =>
  runConformanceInternal(subject, corpus, options, { requiredIds: requiredOf(corpus) });
