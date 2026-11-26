import type { EnvironmentTheme } from "@t3tools/contracts";

import type { ThemeAppearance, ThemeColors, ThemeDefinition } from "../../themePalette";
import { TAKO_INK_CSS } from "./takoInk.css.generated";

export const TAKO_INK_THEME_ID = "tako-ink";

const LIGHT_CANVAS = "#f0eeec";
const LIGHT_ACCENT = "#2d5cd7";

/**
 * Tako Ink in the published-theme shape. The CSS comes from scripts/nv-tako-ink.ts
 * (`vp run theme:nv`), which also writes a standalone copy for stock T3 Code.
 */
export const TAKO_INK_THEME_FILE: EnvironmentTheme = {
  id: TAKO_INK_THEME_ID,
  name: "Tako Ink",
  appearance: "dark",
  canvas: "#0b1124",
  accent: "#3c6dec",
  colors: {
    focus: "#3c6dec",
    terminalCursor: "#7f9ef0",
    terminalSelection: "#1842b466",
    searchMatchActiveBackground: "#3c6dec",
  },
  variants: { light: { canvas: LIGHT_CANVAS, accent: LIGHT_ACCENT, focus: LIGHT_ACCENT } },
  css: TAKO_INK_CSS,
};

/** Themes NV-CODE ships beside upstream's built-ins, in card order. */
export const NV_BUILT_IN_THEME_IDS: ReadonlySet<string> = new Set([TAKO_INK_THEME_ID]);

/**
 * NV-CODE's built-in definitions. themePalette passes its helpers in, avoiding an import cycle.
 * A published light variant would start from upstream's pink stock palette, so Tako Ink's is
 * generated from its own canvas and accent.
 */
export function nvBuiltInThemeDefinitions(palette: {
  readonly environmentThemeDefinition: (theme: EnvironmentTheme) => ThemeDefinition;
  readonly createVividThemeColors: (
    appearance: ThemeAppearance,
    canvas: string,
    accent: string,
  ) => ThemeColors;
}): ReadonlyArray<ThemeDefinition> {
  const takoInk = palette.environmentThemeDefinition(TAKO_INK_THEME_FILE);
  return [
    {
      ...takoInk,
      variants: {
        light: palette.createVividThemeColors("light", LIGHT_CANVAS, LIGHT_ACCENT),
      },
    },
  ];
}
