export interface Patch { pkg: "dl" | "cv" | "core"; file: string; find: string; replace: string; count: number }
export interface Mutant { id: string; desc: string; patches: Patch[]; heavy?: string[] }
export const MUTANTS: Mutant[];
export const EXTRA_MUTANTS: Mutant[];
