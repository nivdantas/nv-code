#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - A one-shot fork tool; synchronous Node APIs keep it small.
// Re-applies NV-CODE's own translations after `vp run i18n:generate`, so a rebase can take
// upstream's catalogs as they are. Translations are keyed by their English source text.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const root = NodePath.resolve(import.meta.dirname, "..");
const catalogs = NodePath.join(root, "apps/web/src/i18n/translations");
const readJson = (file: string) => JSON.parse(NodeFS.readFileSync(file, "utf8"));

const overlay: Record<string, Record<string, string>> = readJson(
  NodePath.join(root, "apps/web/src/nv/i18n/translations.json"),
);
const english: Record<string, unknown> = readJson(NodePath.join(catalogs, "en.json"));

for (const [locale, translations] of Object.entries(overlay)) {
  const file = NodePath.join(catalogs, `${locale}.json`);
  const catalog: Record<string, unknown> = readJson(file);
  let applied = 0;
  for (const [key, source] of Object.entries(english)) {
    // Only fill strings still in English, so an upstream translation always wins.
    if (typeof source !== "string" || catalog[key] !== source) continue;
    const translation = Object.hasOwn(translations, source) ? translations[source] : undefined;
    if (translation === undefined || translation === source) continue;
    catalog[key] = translation;
    applied++;
  }
  if (applied > 0) NodeFS.writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`${locale}: ${applied} NV-CODE translations applied`);
}
