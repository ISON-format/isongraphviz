export interface Patch { file: string; find: string; replace: string; count: number }
export interface Mutant { id: string; desc: string; patches: Patch[] }
export const MUTANTS: Mutant[];
export const EXTRA_MUTANTS: Mutant[];
