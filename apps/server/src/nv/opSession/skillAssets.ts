import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeURL from "node:url";

const skillPaths = ["SKILL.md", "scripts/op-session", "scripts/op-session.mjs"] as const;
declare const __NV_OP_SESSION_SKILL__: ReadonlyArray<string>;

export const loadSkillAssets = Effect.fn("OpSession.loadSkillAssets")(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.forEach(skillPaths, (relativePath, index) =>
    Effect.map(
      typeof __NV_OP_SESSION_SKILL__ === "undefined"
        ? fs.readFileString(
            NodeURL.fileURLToPath(new URL(`./skill/${relativePath}`, import.meta.url)),
          )
        : Effect.succeed(__NV_OP_SESSION_SKILL__[index]!),
      (contents) => ({ relativePath, contents, mode: relativePath === "SKILL.md" ? 0o644 : 0o755 }),
    ),
  );
});
