import { BOT_WORKER_NOTE_PREFIX } from "@t3tools/contracts";

const SLUG_MAX = 64;

/** A note slug from its title, made unique against the Bot's existing notes. */
export function noteSlugFromTitle(title: string, taken: ReadonlySet<string>): string {
  const normalized =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+/u, "")
      .slice(0, SLUG_MAX)
      .replace(/-+$/u, "") || "note";
  const base = normalized.startsWith(BOT_WORKER_NOTE_PREFIX)
    ? `note-${normalized}`.slice(0, SLUG_MAX).replace(/-+$/u, "")
    : normalized;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/u, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
