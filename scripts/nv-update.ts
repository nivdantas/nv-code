#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - install spawns a detached swap that outlives NV-CODE, which effect/process cannot do.

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Argument, Command, Flag } from "effect/cli";
import * as CliError from "effect/cli/CliError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const nightlyPattern = /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;
const catalogs = ":(top,glob)apps/web/src/i18n/translations/*.json";

const appName = "NV-CODE";
/** Commits outside these paths (docs, this script) do not change the built app. */
const appPathspec = [".", ":(exclude,glob)**/*.md", ":(exclude)scripts/nv-update.ts"];
const bundleId = "com.nivdantas.nv-code";
const installedApp = `/Applications/${appName}.app`;

// Runs detached, so it survives NV-CODE quitting even when started from an NV-CODE terminal.
// $1 new app, $2 installed app, $3 where the previous app goes, $4 1 to reopen.
const swapScript = `set -u
new=$1 dest=$2 previous=$3 reopen=$4
echo "$(date) installing $new"
osascript -e 'tell application id "${bundleId}" to quit' >/dev/null 2>&1 || true
i=0
while pgrep -x '${appName}' >/dev/null && [ "$i" -lt 60 ]; do sleep 1; i=$((i + 1)); done
if pgrep -x '${appName}' >/dev/null; then
  echo "${appName} did not quit within 60s; nothing changed"
  exit 1
fi
rm -rf "$previous"
mkdir -p "$(dirname "$previous")"
[ -d "$dest" ] && mv "$dest" "$previous"
if ditto "$new" "$dest"; then
  xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
  echo "installed; the previous app is at $previous"
else
  echo "copy failed; putting the previous app back"
  rm -rf "$dest"
  [ -d "$previous" ] && mv "$previous" "$dest"
fi
rm -rf "$(dirname "$new")"
[ "$reopen" = 1 ] && open "$dest"
exit 0
`;

/** T3 Connect works only when its public config is embedded at build time. */
const hasConnectConfig = (root: string) =>
  Boolean(process.env.T3CODE_CLERK_PUBLISHABLE_KEY?.trim()) ||
  [".env.local", ".env"].some((name) => {
    const file = NodePath.join(root, name);
    return (
      NodeFS.existsSync(file) &&
      /^T3CODE_CLERK_PUBLISHABLE_KEY=\s*\S/m.test(NodeFS.readFileSync(file, "utf8"))
    );
  });

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

  const headNightly = Effect.fn("NvUpdate.headNightly")(function* () {
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
    return tag;
  });

  const buildArtifact = Effect.fn("NvUpdate.buildArtifact")(function* (
    tag: string,
    target: "dmg" | "zip",
  ) {
    if (!hasConnectConfig(root)) {
      yield* Console.warn(
        "T3CODE_CLERK_PUBLISHABLE_KEY is not set, so this build has no T3 Connect. Run cp -n .env.example .env first.",
      );
    }
    yield* requireSuccess("vp", [
      "run",
      "dist:desktop:artifact",
      "--platform",
      "mac",
      "--target",
      target,
      "--arch",
      "arm64",
      "--build-version",
      tag.slice(1),
      "--output-dir",
      "release/nv-code",
    ]);
  });

  const build = Effect.fn("NvUpdate.build")(function* () {
    yield* buildArtifact(yield* headNightly(), "dmg");
  });

  const install = Effect.fn("NvUpdate.install")(function* (options: {
    readonly rebuild: boolean;
    readonly open: boolean;
    readonly dryRun: boolean;
  }) {
    const tag = yield* headNightly();
    const version = tag.slice(1);
    const zip = NodePath.join(root, "release/nv-code", `${appName}-${version}-arm64.zip`);
    // A zip older than the last commit that can change the app misses the fork's newer work.
    const headTime =
      Number((yield* readGit(["log", "-1", "--format=%ct", "--", ...appPathspec])).trim()) * 1000;
    const fresh = NodeFS.existsSync(zip) && NodeFS.statSync(zip).mtimeMs > headTime;
    if (options.rebuild || !fresh) {
      yield* Console.log(`Building ${appName} ${version} (zip only)...`);
      yield* buildArtifact(tag, "zip");
    } else {
      yield* Console.log(`Using the existing build ${zip}`);
    }
    if (!NodeFS.existsSync(zip)) return yield* updateError(`The build did not produce ${zip}.`);

    const stage = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nv-code-install-"));
    yield* requireSuccess("ditto", ["-x", "-k", zip, stage]);
    const app = NodePath.join(stage, `${appName}.app`);
    if (!NodeFS.existsSync(app)) return yield* updateError(`${zip} has no ${appName}.app.`);
    yield* requireSuccess("codesign", ["--verify", "--deep", app]);

    const state = NodePath.join(NodeOS.homedir(), ".nv-code");
    const previous = NodePath.join(state, "previous", `${appName}.app`);
    const log = NodePath.join(state, "install.log");
    if (options.dryRun) {
      NodeFS.rmSync(stage, { recursive: true, force: true });
      yield* Console.log(
        `Dry run: ${appName} ${version} is ready. A real run quits ${appName}, replaces ${installedApp}, keeps the old one at ${previous}${options.open ? " and reopens it" : ""}.`,
      );
      return;
    }
    const script = NodePath.join(stage, "swap.sh");
    NodeFS.writeFileSync(script, swapScript);
    NodeFS.mkdirSync(state, { recursive: true });
    const out = NodeFS.openSync(log, "a");
    NodeChildProcess.spawn(
      "/bin/sh",
      [script, app, installedApp, previous, options.open ? "1" : "0"],
      {
        detached: true,
        stdio: ["ignore", out, out],
      },
    ).unref();
    yield* Console.log(
      `${appName} will quit, update to ${version}${options.open ? " and reopen" : ""}. Log: ${log}`,
    );
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
      Command.make(
        "install",
        {
          rebuild: Flag.Boolean("rebuild").pipe(
            Flag.withDefault(false),
            Flag.withDescription("Build again even when a zip newer than HEAD exists."),
          ),
          noOpen: Flag.Boolean("no-open").pipe(
            Flag.withDefault(false),
            Flag.withDescription("Leave NV-CODE closed after installing."),
          ),
          dryRun: Flag.Boolean("dry-run").pipe(
            Flag.withDefault(false),
            Flag.withDescription("Build and check the app, but do not quit or replace NV-CODE."),
          ),
        },
        ({ rebuild, noOpen, dryRun }) => install({ rebuild, open: !noOpen, dryRun }),
      ).pipe(
        Command.withDescription(
          "Build HEAD's nightly as a zip if needed, then replace /Applications/NV-CODE.app with it.",
        ),
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
