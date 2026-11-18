export interface Patch { pkg: "gl"; file: string; find: string; replace: string; count: number }
export interface Mutant { id: string; desc: string; patches: Patch[]; heavy?: string[] }
export const EXTRA_MUTANTS: Mutant[];
