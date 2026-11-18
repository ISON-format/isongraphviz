// src/theme.ts - the theme igr-theme/1 (design 4.9): a fixed constant table shared by every executor. No byte of a display list depends on it.
import { THEME_FORMAT } from "./constants.js";

export type Rgb = readonly [number, number, number];
export type ThemeSlotName = "halo-sel" | "halo-foc" | "line" | "arrow" | "ring-sel" | "ring-foc" | "disc" | "label";
export interface ThemeSlot { readonly width?: number; readonly alpha: number; readonly dash?: readonly number[]; readonly radius?: number }
export interface Theme {
  readonly format: typeof THEME_FORMAT;
  readonly slots: Readonly<Record<ThemeSlotName, Readonly<ThemeSlot>>>;
  readonly palette: readonly Rgb[];
  readonly ink: Rgb;
  readonly white: Rgb;
  readonly font: string;
  readonly textAlign: string;
  readonly textBaseline: string;
  readonly direction: string;
}

const rgb = (r: number, g: number, b: number): Rgb => Object.freeze([r, g, b] as const) as Rgb;
const slot = (s: ThemeSlot): Readonly<ThemeSlot> => Object.freeze(s.dash === undefined ? { ...s } : { ...s, dash: Object.freeze([...s.dash]) });

/** PALETTE k0..k8: the light palette of V5's CSS; k8 is `igr-kx` (4.9). */
export const PALETTE: readonly Rgb[] = Object.freeze([
  rgb(42, 120, 214), rgb(235, 104, 52), rgb(27, 175, 122), rgb(237, 161, 0), rgb(232, 123, 164), rgb(0, 131, 0), rgb(74, 58, 167), rgb(227, 73, 72), rgb(122, 121, 117),
]);

export const THEME: Readonly<Theme> = Object.freeze({
  format: THEME_FORMAT,
  slots: Object.freeze({
    "halo-sel": slot({ width: 6, alpha: 0.35, dash: [] }),
    "halo-foc": slot({ width: 10, alpha: 0.25, dash: [6, 4] }),
    "line": slot({ width: 2, alpha: 0.6, dash: [] }),
    "arrow": slot({ alpha: 0.6 }),
    "ring-sel": slot({ width: 3, alpha: 1, dash: [], radius: 14 }),
    "ring-foc": slot({ width: 2, alpha: 1, dash: [4, 3], radius: 18 }),
    "disc": slot({ width: 2, alpha: 1, dash: [], radius: 10 }),
    "label": slot({ alpha: 1 }),
  }),
  palette: PALETTE,
  ink: rgb(34, 34, 34),
  white: rgb(255, 255, 255),
  font: "12px sans-serif",
  textAlign: "center",
  textBaseline: "alphabetic",
  direction: "ltr",
});
