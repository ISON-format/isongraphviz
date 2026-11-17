// src/work.ts — the work model of design 29 section 11 (a PROPOSAL validated by test, not an upper bound on time; provisional, unmeasured).
import { LODError } from "./errors.js";

export type WorkClass =
  | "stateBytes" | "nodes" | "edges" | "members" | "pins" | "aggSort" | "itemSort" | "relSort" | "keys"
  | "idHash" | "stateHash" | "viewHash" | "serialize" | "rules";

const CLASSES: readonly WorkClass[] = ["stateBytes", "nodes", "edges", "members", "pins", "aggSort", "itemSort", "relSort", "keys", "idHash", "stateHash", "viewHash", "serialize", "rules"];

/** The instrumented counter: one tick per elementary step of the classes of the formula. Never an input of any result. */
export class Meter {
  readonly ticks: Record<WorkClass, number> = Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<WorkClass, number>;
  add(c: WorkClass, k = 1): void { this.ticks[c] += k; }
  total(): number { let s = 0; for (const c of CLASSES) s += this.ticks[c]; return s; }
}

export const ceilDiv = (a: number, b: number): number => Math.ceil(a / b);
/** Bit length; `lg(0) = 0`. */
export const lg = (x: number): number => (x <= 0 ? 0 : x.toString(2).length);
/** UTF-8 byte length of a JS string without allocating when ASCII. */
const enc = new TextEncoder();
export const utf8Len = (s: string): number => { for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0x7f) return enc.encode(s).length; return s.length; };
/** SHA-256 blocks of an `L`-byte message: ceil((L + 9) / 64). */
export const shaBlocks = (len: number): number => ceilDiv(len + 9, 64);

export interface WorkInputs {
  Hs: number; n: number; m: number; M: number; T: number; G: number; R: number; Lrel: number; Lkey: number;
  Hids: number; Hscene: number; Hlayout: number;
}

/** `Hv`: the bound on the view's byte size used by the formula. */
export const viewBound = (w: WorkInputs): number => 6 * w.Hscene + w.Hlayout + 160 * (w.n + w.m) + 2048 * w.G + 4096;

/** The per-class terms of the deriveView formula. */
export function classTerms(w: WorkInputs): Record<WorkClass, bigint> {
  const B = (x: number): bigint => BigInt(x);
  const Hv = viewBound(w);
  const kl = ceilDiv(w.Lkey, 64), rl = ceilDiv(w.Lrel, 64);
  const t = {} as Record<WorkClass, bigint>;
  t.stateBytes = B(ceilDiv(w.Hs, 8));
  t.nodes = 4n * B(w.n);
  t.edges = 6n * B(w.m);
  t.members = 8n * B(w.M);
  t.pins = 4n * B(w.T);
  t.aggSort = 2n * B(w.G) * B(lg(w.G));
  t.itemSort = 3n * B(w.m) * B(lg(w.m));
  t.relSort = 3n * B(w.R) * B(lg(w.R)) * B(1 + 2 * rl);
  t.keys = B(w.m) * B(3 + 2 * kl + rl) + B(w.n + w.M) * B(kl);
  t.idHash = B(ceilDiv(w.Hids, 64) + w.G);
  t.viewHash = B(ceilDiv(Hv + 9, 64));
  t.stateHash = B(ceilDiv(w.Hs + 9, 64));
  t.serialize = B(ceilDiv(Hv, 8));
  t.rules = 0n;
  return t;
}

/** W of `deriveView`: the sum of the class terms (equal to the formula printed in section 11). */
export function workDeriveView(w: WorkInputs): bigint {
  const t = classTerms(w);
  let s = 0n;
  for (const c of CLASSES) s += t[c];
  return s;
}

/** W of `suggestGroups` for `r` rule specs: `10(n + m) r + r (n + 2m) ceil(Lkey / 64)`. */
export function workSuggest(n: number, m: number, r: number, Lkey: number): bigint {
  return 10n * BigInt(n + m) * BigInt(r) + BigInt(r) * BigInt(n + 2 * m) * BigInt(ceilDiv(Lkey, 64));
}

export interface ViewWorkInputs { n: number; m: number; V: number; Lkey: number; Hidsp: number; Gp: number }
/** W of `resolveAggregateEdge` (hash terms omitted) and `checkViewConservation` (with them). */
export function workView(w: ViewWorkInputs, withHashes: boolean): bigint {
  let s = 6n * BigInt(w.n) + 8n * BigInt(w.m) + 8n * BigInt(w.V) + BigInt(w.n + 2 * w.m) * BigInt(ceilDiv(w.Lkey, 64));
  if (withHashes) s += BigInt(ceilDiv(w.Hidsp, 64) + w.Gp);
  return s;
}

/** Step 7 assertion: an exceedance is INTERNAL/WORK_MODEL, never a silent overrun. */
export function assertWithinTerms(m: Meter, terms: Record<WorkClass, bigint>): void {
  for (const c of CLASSES) if (BigInt(m.ticks[c]) > terms[c]) throw new LODError("INTERNAL", "WORK_MODEL", undefined, `${c}: ${m.ticks[c]} > ${terms[c]}`);
}
