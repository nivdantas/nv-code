#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Argument, Command } from "effect/cli";
import * as CliError from "effect/cli/CliError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const nightlyPattern = /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;
const catalogs = ":(top,glob)apps/web/src/i18n/translations/*.json";

const updateError = (message: string) =>
  new CliError.UserError({ cause: message, userMessage: message });

export const makeUpdateCommands = (root: string) => {
  const readGit = Effect.fn("NvUpdate.readGit")(function* (args: string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make("git", args, { cwd: root, stderr: "inherit" }),
    );
    const [output, code] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(child.stdout)), child.exitCode],
      { concurrency: 2 },
    );
    if (code !== 0) return yield* updateError(`git ${args.join(" ")} exited with status ${code}.`);
    return output;
  }, Effect.scoped);

  const run = Effect.fn("NvUpdate.run")(function* (program: string, args: string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return Number(
      yield* spawner.exitCode(
        ChildProcess.make(program, args, {
          cwd: root,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }),
      ),
    );
  });

  const requireSuccess = Effect.fn("NvUpdate.requireSuccess")(function* (
    program: string,
    args: string[],
  ) {
    const code = yield* run(program, args);
    if (code !== 0)
      return yield* updateError(`${program} ${args.join(" ")} exited with status ${code}.`);
  });

  const resolveTag = Effect.fn("NvUpdate.resolveTag")(function* (requested?: string) {
    const refs = yield* readGit([
      "ls-remote",
      "--refs",
      "--sort=-version:refname",
      "upstream",
      requested ? `refs/tags/${requested}` : "refs/tags/v*-nightly.*",
    ]);
    const tag = refs
      .split("\n")
      .map((line) => line.split("\t")[1]?.slice("refs/tags/".length))
      .find((name) => name !== undefined && nightlyPattern.test(name));
    if (!tag) return yield* updateError("No matching upstream nightly tag found.");
    yield* requireSuccess("git", [
      "fetch",
      "--no-tags",
      "upstream",
      `refs/tags/${tag}:refs/tags/${tag}`,
    ]);
    return tag;
  });

  const merged = Effect.fn("NvUpdate.merged")(function* (tag: string) {
    const code = yield* run("git", ["merge-base", "--is-ancestor", `refs/tags/${tag}`, "HEAD"]);
    if (code > 1) return yield* updateError(`Could not compare HEAD with ${tag}.`);
    return code === 0;
  });

  const finish = Effect.fn("NvUpdate.finish")(function* () {
    const tags = yield* readGit(["tag", "--points-at", "MERGE_HEAD"]);
    const tag = tags.split("\n").find((name) => nightlyPattern.test(name));
    if (!tag) return yield* updateError("The pending merge is missing an upstream nightly tag.");
    const conflicts = yield* readGit(["diff", "--name-only", "--diff-filter=U"]);
    if (conflicts.trim()) {
      return yield* updateError(
        `Resolve and stage these files, then run vp run nv:update finish:\n${conflicts.trim()}`,
      );
    }
    yield* requireSuccess("vp", ["i", "--frozen-lockfile"]);
    yield* requireSuccess("vp", ["run", "--filter", "@t3tools/web", "i18n:generate"]);
    yield* requireSuccess("vp", ["run", "i18n:nv"]);
    yield* requireSuccess("vp", ["run", "i18n:check"]);
    yield* requireSuccess("vp", ["run", "nv:touchpoints", tag]);
    yield* requireSuccess("vp", ["run", "theme:nv:check"]);
    yield* requireSuccess("git", ["add", "--", catalogs]);
    yield* Console.log(
      `${tag} is staged. Review the merge and run git commit --no-edit when ready.`,
    );
  });

  const update = Effect.fn("NvUpdate.update")(function* (
    requested: string | undefined,
    check: boolean,
  ) {
    const tag = yield* resolveTag(requested);
    if (yield* merged(tag)) {
      yield* Console.log(`NV-CODE already includes ${tag}.`);
      return;
    }
    yield* Console.log(`Upstream nightly available: ${tag}.`);
    if (check) return;

    yield* requireSuccess("git", ["symbolic-ref", "--quiet", "HEAD"]);
    if ((yield* readGit(["status", "--porcelain", "--untracked-files=normal"])).length > 0) {
      return yield* updateError(
        "Start the update from a clean checkout. For a pending nightly merge, run vp run nv:update finish.",
      );
    }
    const code = yield* run("git", ["merge", "--no-ff", "--no-commit", `refs/tags/${tag}`]);
    if (
      code !== 0 &&
      (yield* run("git", ["rev-parse", "--quiet", "--verify", "MERGE_HEAD"])) !== 0
    ) {
      return yield* updateError(`Git could not start the merge for ${tag}.`);
    }
    yield* requireSuccess("git", [
      "restore",
      "--source=MERGE_HEAD",
      "--staged",
      "--worktree",
      "--",
      catalogs,
    ]);
    yield* finish();
  });

  const build = Effect.fn("NvUpdate.build")(function* () {
    const tags = yield* readGit([
      "tag",
      "--merged",
      "HEAD",
      "--sort=-version:refname",
      "v*-nightly.*",
    ]);
    const tag = tags.split("\n").find((name) => nightlyPattern.test(name));
    if (!tag) return yield* updateError("Merge an upstream nightly before building the installer.");
    const mergeInProgress =
      (yield* run("git", ["rev-parse", "--quiet", "--verify", "MERGE_HEAD"])) === 0;
    if (mergeInProgress)
      return yield* updateError("Commit the merge before building the installer.");
    yield* requireSuccess("vp", [
      "run",
      "dist:desktop:dmg",
      "--arch",
      "arm64",
      "--build-version",
      tag.slice(1),
      "--output-dir",
      "release/nv-code",
    ]);
  });

  return Command.make(
    "nv:update",
    {
      tag: Argument.String("tag").pipe(
        Argument.withSchema(Schema.String.check(Schema.isPattern(nightlyPattern))),
        Argument.optional,
      ),
    },
    ({ tag }) => update(Option.getOrUndefined(tag), false),
  ).pipe(
    Command.withDescription("Merge the latest upstream nightly into the current NV-CODE branch."),
    Command.withSubcommands([
      Command.make("check", {}, () => update(undefined, true)).pipe(
        Command.withDescription("Check for a new upstream nightly."),
      ),
      Command.make("finish", {}, finish).pipe(
        Command.withDescription("Regenerate and check catalogs after resolving a nightly merge."),
      ),
      Command.make("build", {}, build).pipe(
        Command.withDescription("Build an Apple silicon DMG for the nightly merged into HEAD."),
      ),
    ]),
  );
};

if (import.meta.main) {
  Path.Path.use((path) => path.fromFileUrl(new URL("..", import.meta.url))).pipe(
    Effect.flatMap((root) => Command.run(makeUpdateCommands(root), { version: "0.0.0" })),
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
