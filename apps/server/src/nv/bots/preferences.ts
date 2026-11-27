import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ServerConfig from "../../config.ts";

// Bot ids can contain path separators and reserved characters.
export const botMemoryDirectoryName = (threadId: ThreadId) =>
  `thread-${threadId.replace(
    /[^A-Za-z0-9_-]/gu,
    (char) => `~${char.codePointAt(0)!.toString(16).padStart(2, "0")}`,
  )}`;

export const readOrchestratorPreferences = Effect.fn("NvBot.readPromptPreferences")(function* (
  threadId: ThreadId,
) {
  const { baseDir } = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const preferencesFile = path.resolve(
    baseDir,
    "bots",
    botMemoryDirectoryName(threadId),
    "preferences.md",
  );
  return yield* Effect.scoped(
    fs.open(preferencesFile).pipe(Effect.flatMap((file) => file.readAlloc(32_000))),
  ).pipe(
    Effect.map((bytes) =>
      Option.match(bytes, {
        onNone: () => "",
        onSome: (value) => new TextDecoder().decode(value).trim().slice(0, 8_000),
      }),
    ),
    Effect.catchTags({
      PlatformError: (error) =>
        error.reason._tag === "NotFound"
          ? Effect.succeed("")
          : Effect.logWarning("Could not read Orchestrator preferences", {
              threadId,
              error,
            }).pipe(Effect.as("")),
    }),
  );
});
