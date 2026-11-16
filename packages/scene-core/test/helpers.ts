// packages/scene-core/test/helpers.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IgsError } from "../src/errors.js";

/** The frozen oracles are read in place: one source of truth. */
export const ORACLES = fileURLToPath(new URL("../../../docs/isongraph-visualize-blueprint/oracles/", import.meta.url));
export const bytesOf = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(ORACLES, rel)));
export const textOf = (rel: string): string => readFileSync(join(ORACLES, rel), "utf8");

export function igsError(fn: () => unknown): IgsError {
  try { fn(); } catch (e) { if (e instanceof IgsError) return e; throw e; }
  throw new Error("expected an IgsError, but nothing was thrown");
}
export async function igsErrorAsync(fn: () => Promise<unknown>): Promise<IgsError> {
  try { await fn(); } catch (e) { if (e instanceof IgsError) return e; throw e; }
  throw new Error("expected an IgsError, but nothing was thrown");
}
export const hex = (u: Uint8Array): string => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
