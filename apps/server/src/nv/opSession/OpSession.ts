import type { OpSessionStatus } from "@t3tools/contracts";
import { collectUint8StreamText } from "@t3tools/provider-core/server/collectStreamText";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { loadSkillAssets } from "./skillAssets.ts";

export class OpSessionHostError extends Schema.TaggedError<OpSessionHostError>()(
  "OpSessionHostError",
  {
    reason: Schema.Literals(["unsupported", "filesystem"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export class OpSession extends Context.Service<
  OpSession,
  {
    readonly status: () => Effect.Effect<OpSessionStatus, OpSessionHostError>;
    readonly setEnabled: (enabled: boolean) => Effect.Effect<void, OpSessionHostError>;
  }
>()("t3/nv/opSession/OpSession") {}

const MARKER = ".nv-code-managed";
const OWNERSHIP = "NV-CODE op-session\n";
const STANDARD_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
const TOOL_VERSION = /^v?(\d{1,4})\.\d{1,6}\.\d{1,6}(?:[-+][\w.-]{1,40})?$/;
const NODE_INSTALL_PATTERNS = [
  ".nvm/versions/node/*/bin/node",
  ".local/share/fnm/node-versions/*/installation/bin/node",
  "Library/Application Support/fnm/node-versions/*/installation/bin/node",
  ".local/share/mise/installs/node/*/bin/node",
];

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const home = yield* HostProcess.HomeDirectory;
  const platform = yield* HostProcess.Platform;
  const environment = yield* HostProcess.Environment;
  const lock = yield* Semaphore.make(1);
  const assets = yield* Effect.cached(
    loadSkillAssets().pipe(Effect.provideService(FileSystem.FileSystem, fs)),
  );
  const supported = platform === "darwin" || platform === "linux";
  const stateFile = path.join(home, ".op-session", ".nv-code-enabled");
  const configHome = environment.XDG_CONFIG_HOME;
  const xdg = configHome && path.isAbsolute(configHome) ? configHome : path.join(home, ".config");
  const targets = [
    { provider: "Claude Code", root: path.join(home, ".claude", "skills") },
    { provider: "Codex / Pi / Grok", root: path.join(home, ".agents", "skills") },
    { provider: "Cursor", root: path.join(home, ".cursor", "skills") },
    { provider: "OpenCode / fx", root: path.join(xdg, "opencode", "skills") },
    { provider: "Antigravity", root: path.join(home, ".gemini", "config", "skills") },
    { provider: "Kiro", root: path.join(home, ".kiro", "skills") },
    { provider: "Muse Code", root: path.join(xdg, "muse", "skills") },
  ].map(({ provider, root }) => ({ provider, destination: path.join(root, "op-session") }));
  const pathDirs = (environment.PATH ?? "").split(":").filter(path.isAbsolute);

  const ifPresent = <A>(effect: Effect.Effect<A, PlatformError.PlatformError>) =>
    Effect.catchIf(
      effect,
      (error) => error.reason._tag === "NotFound",
      () => Effect.succeed(null),
    );

  const readMatches = Effect.fn("OpSession.readMatches")(function* (
    file: string,
    contents: string,
    executable = false,
  ) {
    const info = yield* ifPresent(fs.lstat(file));
    return (
      info?.type === "File" &&
      (!executable || (info.mode & 0o777) === 0o755) &&
      info.size === BigInt(Buffer.byteLength(contents)) &&
      (yield* ifPresent(fs.readFileString(file))) === contents
    );
  });

  const skillState = Effect.fn("OpSession.skillState")(function* (destination: string) {
    const info = yield* ifPresent(fs.lstat(destination));
    if (info === null) return "missing" as const;
    if (
      info.type !== "Directory" ||
      !(yield* readMatches(path.join(destination, MARKER), OWNERSHIP))
    ) {
      return "unmanaged" as const;
    }
    if ((yield* ifPresent(fs.lstat(path.join(destination, "scripts"))))?.type !== "Directory") {
      return "outdated" as const;
    }
    const files = yield* assets;
    const mismatch = yield* Effect.findFirst(files, ({ relativePath, contents, mode }) =>
      Effect.map(
        readMatches(path.join(destination, relativePath), contents, mode === 0o755),
        (matches) => !matches,
      ),
    );
    return mismatch._tag === "None" ? ("current" as const) : ("outdated" as const);
  });

  const findExecutable = Effect.fn("OpSession.findExecutable")(function* (
    candidates: ReadonlyArray<string | undefined>,
  ) {
    return yield* Effect.findFirst(
      candidates.filter((entry): entry is string => !!entry && path.isAbsolute(entry)),
      (file) =>
        fs.stat(file).pipe(
          Effect.map((info) => info.type === "File" && (info.mode & 0o111) !== 0),
          Effect.orElseSucceed(() => false),
        ),
    );
  });

  const probe = Effect.fn("OpSession.probe")(
    function* (executable: string, args: ReadonlyArray<string>) {
      const child = yield* spawner.spawn(
        ChildProcess.make(executable, args, { cwd: home, env: environment, stdin: "ignore" }),
      );
      const [stdout, stderr, code] = yield* Effect.all(
        [
          collectUint8StreamText({ stream: child.stdout, maxBytes: 32_768 }),
          collectUint8StreamText({ stream: child.stderr, maxBytes: 32_768 }),
          child.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      return code === 0 ? { stdout: stdout.text, stderr: stderr.text } : null;
    },
    Effect.scoped,
    Effect.timeout("2 seconds"),
    Effect.orElseSucceed(() => null),
  );

  const checkCli = Effect.fn("OpSession.checkCli")(function* () {
    const candidate = yield* findExecutable([
      environment.OP_SESSION_OP_BIN,
      ...[...pathDirs, ...STANDARD_BIN_DIRS].map((dir) => path.join(dir, "op")),
    ]);
    if (candidate._tag === "None") {
      return { cliFound: false, cliVersion: null, environmentsSupported: false };
    }
    const [version, help] = yield* Effect.all(
      [probe(candidate.value, ["--version"]), probe(candidate.value, ["run", "--help"])],
      { concurrency: 2 },
    );
    const text = version?.stdout.trim() || version?.stderr.trim();
    return {
      cliFound: true,
      cliVersion: text && TOOL_VERSION.test(text) ? text : null,
      environmentsSupported:
        help !== null && /(?:^|\s)--environment(?=[\s=,]|$)/.test(`${help.stdout}\n${help.stderr}`),
    };
  });

  const checkNode = Effect.fn("OpSession.checkNode")(function* () {
    const versionAt = Effect.fn("OpSession.nodeVersionAt")(function* (candidate: string) {
      const result = yield* probe(candidate, ["--version"]);
      const text = result?.stdout.trim() ?? "";
      const major = Number(TOOL_VERSION.exec(text)?.[1]);
      return major >= 18 ? text : null;
    });
    const onPath = yield* findExecutable(pathDirs.map((dir) => path.join(dir, "node")));
    for (const candidate of [
      environment.OP_SESSION_NODE,
      onPath._tag === "Some" ? onPath.value : undefined,
    ]) {
      if (!candidate || !path.isAbsolute(candidate)) continue;
      const version = yield* versionAt(candidate);
      if (version !== null) return version;
    }

    const managedPaths = yield* Effect.forEach(NODE_INSTALL_PATTERNS, (pattern) =>
      fs.glob(pattern, { root: home }).pipe(Effect.orElseSucceed(() => [])),
    );
    for (const candidate of [
      ...managedPaths.flat().map((file) => path.join(home, file)),
      path.join(home, ".volta", "bin", "node"),
      path.join(home, ".asdf", "shims", "node"),
      ...STANDARD_BIN_DIRS.map((dir) => path.join(dir, "node")),
    ]) {
      const version = yield* versionAt(candidate);
      if (version !== null) return version;
    }
    return null;
  });

  const checkDesktop = Effect.fn("OpSession.checkDesktop")(function* () {
    const desktopPaths =
      platform === "darwin"
        ? ["/Applications/1Password.app", path.join(home, "Applications", "1Password.app")]
        : [
            "/usr/bin/1password",
            "/opt/1Password/1password",
            "/usr/share/applications/1password.desktop",
            "/var/lib/flatpak/app/com.onepassword.OnePassword",
            path.join(home, ".local", "share", "flatpak", "app", "com.onepassword.OnePassword"),
            "/snap/bin/1password",
          ];
    const installation = yield* Effect.findFirst(desktopPaths, (entry) =>
      fs.exists(entry).pipe(Effect.orElseSucceed(() => false)),
    );
    return installation._tag === "Some";
  });

  const readInstallations = Effect.fn("OpSession.readInstallations")(function* () {
    const skills = yield* Effect.forEach(
      targets,
      ({ provider, destination }) =>
        Effect.map(skillState(destination), (state) => ({ provider, state })),
      { concurrency: 4 },
    );
    const enabled = yield* fs.exists(stateFile);
    return {
      enabled: enabled || skills.some(({ state }) => state === "current" || state === "outdated"),
      skills,
    };
  }, lock.withPermit);

  const status = Effect.fn("OpSession.status")(
    function* () {
      if (!supported) {
        return {
          supported,
          enabled: false,
          cliFound: false,
          cliVersion: null,
          environmentsSupported: false,
          desktopInstalled: false,
          nodeVersion: null,
          skills: [],
        };
      }
      const [cli, nodeVersion, desktopInstalled, installation] = yield* Effect.all(
        [checkCli(), checkNode(), checkDesktop(), readInstallations()],
        { concurrency: "unbounded" },
      );
      return { supported, ...cli, nodeVersion, desktopInstalled, ...installation };
    },
    Effect.mapError((cause) => new OpSessionHostError({ reason: "filesystem", cause })),
  );

  const install = Effect.fn("OpSession.install")(function* (
    destination: string,
    state: "missing" | "outdated",
  ) {
    if (state === "missing") {
      yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
      const reserved = yield* fs.makeDirectory(destination).pipe(
        Effect.as(true),
        Effect.catchIf(
          (error) => error.reason._tag === "AlreadyExists",
          () => Effect.succeed(false),
        ),
      );
      if (!reserved) return;
      yield* fs.writeFileString(path.join(destination, MARKER), OWNERSHIP, { flag: "wx" });
    }
    const scripts = path.join(destination, "scripts");
    const scriptsInfo = yield* ifPresent(fs.lstat(scripts));
    if (scriptsInfo !== null && scriptsInfo.type !== "Directory") {
      yield* fs.remove(scripts);
    }
    yield* fs.makeDirectory(scripts, { recursive: true });

    const files = yield* assets;
    const staging = yield* fs.makeTempDirectoryScoped({
      directory: destination,
      prefix: ".nv-update-",
    });
    for (const { relativePath, contents, mode } of files) {
      const scratch = path.join(staging, path.basename(relativePath));
      yield* fs.writeFileString(scratch, contents);
      yield* fs.chmod(scratch, mode);
      yield* fs.rename(scratch, path.join(destination, relativePath));
    }
  }, Effect.scoped);

  const setEnabled = Effect.fn("OpSession.setEnabled")(
    function* (enabled: boolean) {
      if (!supported) return yield* new OpSessionHostError({ reason: "unsupported" });
      for (const { destination } of targets) {
        const state = yield* skillState(destination);
        if (enabled && (state === "missing" || state === "outdated")) {
          yield* install(destination, state);
        } else if (!enabled && (state === "current" || state === "outdated")) {
          yield* fs.remove(destination, { recursive: true });
        }
      }
      if (enabled) {
        yield* fs.makeDirectory(path.dirname(stateFile), { recursive: true, mode: 0o700 });
        yield* fs.writeFileString(stateFile, OWNERSHIP, { flag: "wx", mode: 0o600 }).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "AlreadyExists",
            () => Effect.void,
          ),
        );
      } else {
        yield* fs.remove(stateFile, { force: true });
      }
    },
    Effect.mapError((cause) =>
      cause._tag === "OpSessionHostError"
        ? cause
        : new OpSessionHostError({ reason: "filesystem", cause }),
    ),
    Effect.uninterruptible,
    lock.withPermit,
  );

  return OpSession.of({ status, setEnabled });
});

export const layer = Layer.effect(OpSession, make);
