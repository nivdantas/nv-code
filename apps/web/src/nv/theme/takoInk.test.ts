import { describe, expect, it } from "vite-plus/test";

import indexHtml from "../../../index.html?raw";
import {
  getThemeColorsForMode,
  getThemeDefinition,
  publishedThemeDefinitions,
  resolveThemeAppearance,
  toCanonicalThemeColor,
} from "../../themePalette";
import { TAKO_INK_THEME_FILE, TAKO_INK_THEME_ID } from "./takoInk";

function scriptBody(pattern: RegExp): string {
  const body = indexHtml.match(pattern)?.[1];
  if (!body) throw new Error(`missing script ${pattern}`);
  return body;
}
const seedScript = scriptBody(/<script data-nv-default-theme>([\s\S]*?)<\/script>/);
const bootScript = scriptBody(/<script>([\s\S]*?)<\/script>/);

function boot(storage: Record<string, string>, prefersDark: boolean) {
  const classes = new Set<string>();
  const vars: Record<string, string> = {};
  const root = {
    dataset: {} as Record<string, string | undefined>,
    classList: {
      toggle: (name: string, force?: boolean) => (force ? classes.add(name) : classes.delete(name)),
    },
    style: { backgroundColor: "", setProperty: (n: string, v: string) => void (vars[n] = v) },
  };
  const win = {
    localStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => void (storage[key] = value),
    },
    matchMedia: () => ({ matches: prefersDark }),
  };
  const doc = { documentElement: root, querySelectorAll: () => [] };
  const css = { supports: (_p: string, v: string) => toCanonicalThemeColor(v) !== null };
  new Function("window", "document", "CSS", seedScript + bootScript)(win, doc, css);
  return {
    storage,
    isDark: classes.has("dark"),
    themeId: root.dataset.themeId,
    vars,
    bg: root.style.backgroundColor,
  };
}

describe("Tako Ink default", () => {
  it("is a built-in that no published file can shadow", () => {
    expect(getThemeDefinition(TAKO_INK_THEME_ID)?.css).toBe(TAKO_INK_THEME_FILE.css);
    expect(publishedThemeDefinitions([TAKO_INK_THEME_FILE])).toEqual([]);
  });

  it("seeds a fresh install and paints it before the app mounts", () => {
    const result = boot({}, false);
    expect(result.storage["t3code:theme"]).toBe(TAKO_INK_THEME_ID);
    expect(result.themeId).toBe(TAKO_INK_THEME_ID);
    expect(result.isDark).toBe(true);
  });

  it("leaves an explicit choice of the stock theme alone", () => {
    const result = boot({ "t3code:theme": "system" }, false);
    expect(result.storage["t3code:theme"]).toBe("system");
    expect(result.themeId).toBeUndefined();
  });

  it("keeps the boot splash in sync with the palette", () => {
    const definition = getThemeDefinition(TAKO_INK_THEME_ID)!;
    for (const mode of ["light", "dark"] as const) {
      const colors = getThemeColorsForMode(definition, mode)!;
      const result = boot(
        { "t3code:theme": TAKO_INK_THEME_ID, "t3code:theme-appearance-mode": mode },
        mode === "dark",
      );
      expect(result.isDark).toBe(mode === "dark");
      expect(result.vars["--boot-background"]).toBe(colors.canvas);
      expect(result.vars["--boot-foreground"]).toBe(colors.text);
      expect(result.vars["--boot-accent"]).toBe(colors.accent);
      expect(result.bg).toBe(colors.chrome);
    }
  });

  it("has a blue light variant, not upstream's stock pink", () => {
    const light = getThemeColorsForMode(getThemeDefinition(TAKO_INK_THEME_ID)!, "light")!;
    const hue = (color: string) => Number(color.match(/oklch\([\d.]+ [\d.]+ ([\d.]+)/)?.[1]);
    for (const role of ["text", "accent"] as const) {
      expect(hue(light[role])).toBeGreaterThan(200);
      expect(hue(light[role])).toBeLessThan(300);
    }
  });

  it("resolves its dark base like the runtime when no mode is stored", () => {
    const result = boot({ "t3code:theme": TAKO_INK_THEME_ID }, false);
    expect(result.isDark).toBe(resolveThemeAppearance(TAKO_INK_THEME_ID, false) === "dark");
  });
});

// Tako Ink styles the app only through data-* hooks. If upstream renames one, fail here
// rather than ship a theme that silently stops matching.
const webSource = Object.entries(
  import.meta.glob<string>(["../../**/*.{ts,tsx}", "!../../**/*.test.*", "!./**"], {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)
  .map(([, text]) => text)
  .join("\n");

describe("Tako Ink hooks", () => {
  const hooks = [...new Set(TAKO_INK_THEME_FILE.css!.match(/\[data-[a-z-]+/g))].map((hook) =>
    hook.slice(1),
  );
  it.each(hooks)("%s is still in the web source", (hook) => {
    const name = hook.replace(/^data-/, "");
    const camel = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    expect(webSource).toMatch(new RegExp(`${hook}\\b|data-${name}["']?\\s*[:=]|${camel}\\b`));
  });
});
