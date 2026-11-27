import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as OpSession from "./OpSession.ts";

const setup = Effect.fn("OpSessionTest.setup")(function* (
  platform: NodeJS.Platform = "darwin",
  extraEnv: (home: string) => Record<string, string> = () => ({}),
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "nv-op-session-" });
  const bin = path.join(home, "bin");
  const op = path.join(bin, "op");
  const log = path.join(home, "probe.log");
  yield* fs.makeDirectory(bin);
  yield* fs.makeDirectory(path.join(home, "Applications", "1Password.app"), { recursive: true });
  yield* fs.writeFileString(path.join(bin, "node"), "#!/bin/sh\nprintf 'v22.2.0\\n'\n", {
    mode: 0o755,
  });

  const mockOp = Effect.fn("OpSessionTest.mockOp")(function* ({
    version = "2.32.1",
    help = "  --environment string   Environment ID",
  }: { readonly version?: string; readonly help?: string } = {}) {
    yield* fs.writeFileString(
      op,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/probe.log"
case "$*" in
  --version) printf '%s\\n' '${version}' ;;
  'run --help') printf '%s\\n' '${help}' >&2 ;;
  *) exit 41 ;;
esac
`,
      { mode: 0o755 },
    );
  });
  yield* mockOp();

  const layer = OpSession.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(HostProcess.HomeDirectory, home),
        Layer.succeed(HostProcess.Platform, platform),
        Layer.succeed(HostProcess.Environment, { HOME: home, PATH: bin, ...extraEnv(home) }),
      ),
    ),
  );
  const { status, setEnabled } = yield* Effect.service(OpSession.OpSession).pipe(
    Effect.provide(layer),
  );
  return { fs, path, home, log, mockOp, status, setEnabled, layer };
});

it.live("reports host requirements and only invokes prompt-free 1Password options", () =>
  Effect.gen(function* () {
    const host = yield* setup();
    const status = yield* host.status();
    assert.include(status, {
      supported: true,
      enabled: false,
      cliFound: true,
      cliVersion: "2.32.1",
      environmentsSupported: true,
      desktopInstalled: true,
      nodeVersion: "v22.2.0",
    });
    assert.deepEqual((yield* host.fs.readFileString(host.log)).trim().split("\n").toSorted(), [
      "--version",
      "run --help",
    ]);
    yield* host.mockOp({ version: "unexpected output", help: "  --environment-file string" });
    assert.include(yield* host.status(), {
      cliFound: true,
      cliVersion: null,
      environmentsSupported: false,
    });
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.live("preserves manually installed skills and never follows a symlinked skill directory", () =>
  Effect.gen(function* () {
    const { fs, path, home, status, setEnabled } = yield* setup();
    const claude = path.join(home, ".claude", "skills", "op-session");
    const agents = path.join(home, ".agents", "skills", "op-session");
    const skill = path.join(claude, "SKILL.md");
    yield* fs.makeDirectory(claude, { recursive: true });
    yield* fs.writeFileString(skill, "personal skill");
    yield* fs.makeDirectory(path.dirname(agents), { recursive: true });
    yield* fs.symlink(claude, agents);

    yield* setEnabled(true);
    assert.deepInclude((yield* status()).skills, { provider: "Claude Code", state: "unmanaged" });
    assert.deepInclude((yield* status()).skills, {
      provider: "Codex / Pi / Grok",
      state: "unmanaged",
    });
    yield* setEnabled(false);
    assert.equal(yield* fs.readFileString(skill), "personal skill");
    assert.equal(yield* fs.readLink(agents), claude);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.live("installs executable scripts, repairs them, and removes managed copies on disable", () =>
  Effect.gen(function* () {
    const { fs, path, home, status, setEnabled, layer } = yield* setup();
    const skill = path.join(home, ".agents", "skills", "op-session");
    const launcher = path.join(skill, "scripts", "op-session");
    const script = path.join(skill, "scripts", "op-session.mjs");
    yield* setEnabled(true);
    const installed = yield* Effect.gen(function* () {
      const reloaded = yield* OpSession.OpSession;
      return yield* reloaded.status();
    }).pipe(Effect.provide(layer));
    assert.isTrue(installed.enabled);
    assert.isTrue(installed.skills.every(({ state }) => state === "current"));
    assert.deepEqual(
      installed.skills.map(({ provider }) => provider),
      ["Codex / Pi / Grok"],
    );
    assert.isFalse(yield* fs.exists(path.join(home, ".kiro")));
    assert.isFalse(yield* fs.exists(path.join(home, ".claude")));
    assert.equal((yield* fs.stat(launcher)).mode & 0o777, 0o755);
    assert.equal((yield* fs.stat(script)).mode & 0o777, 0o755);

    yield* fs.chmod(launcher, 0o644);
    assert.deepInclude((yield* status()).skills, {
      provider: "Codex / Pi / Grok",
      state: "outdated",
    });
    yield* setEnabled(true);
    assert.deepInclude((yield* status()).skills, {
      provider: "Codex / Pi / Grok",
      state: "current",
    });
    yield* setEnabled(false);
    yield* setEnabled(false);
    const disabled = yield* status();
    assert.isFalse(disabled.enabled);
    assert.isTrue(disabled.skills.every(({ state }) => state === "missing"));
    assert.isFalse(yield* fs.exists(skill));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("reports Windows as unsupported and performs no probes or installs", () =>
  Effect.gen(function* () {
    const { fs, home, log, path, status, setEnabled } = yield* setup("win32");
    assert.isFalse((yield* status()).supported);
    assert.deepInclude(yield* Effect.flip(setEnabled(true)), { reason: "unsupported" });
    assert.isFalse(yield* fs.exists(log));
    assert.isFalse(yield* fs.exists(path.join(home, ".agents")));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.live("disable keeps files the user added and an unrelated enabled-state file", () =>
  Effect.gen(function* () {
    const { fs, path, home, status, setEnabled } = yield* setup();
    const skill = path.join(home, ".agents", "skills", "op-session");
    const stateFile = path.join(home, ".op-session", ".nv-code-enabled");
    yield* fs.makeDirectory(path.dirname(stateFile), { recursive: true });
    yield* fs.writeFileString(stateFile, "not ours\n");
    assert.isFalse((yield* status()).enabled);

    yield* setEnabled(true);
    const notes = path.join(skill, "notes.md");
    yield* fs.writeFileString(notes, "mine\n");
    yield* setEnabled(false);

    assert.equal(yield* fs.readFileString(notes), "mine\n");
    assert.isFalse(yield* fs.exists(path.join(skill, "SKILL.md")));
    assert.isFalse(yield* fs.exists(path.join(skill, "scripts")));
    assert.equal(yield* fs.readFileString(stateFile), "not ours\n");
    assert.deepInclude((yield* status()).skills, {
      provider: "Codex / Pi / Grok",
      state: "unmanaged",
    });
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.live("installs Claude's skill under CLAUDE_CONFIG_DIR when it is set", () =>
  Effect.gen(function* () {
    const { fs, path, home, setEnabled } = yield* setup("darwin", (home) => ({
      CLAUDE_CONFIG_DIR: `${home}/claude-config`,
    }));
    yield* fs.makeDirectory(path.join(home, "claude-config"));
    yield* setEnabled(true);
    assert.isTrue(
      yield* fs.exists(path.join(home, "claude-config", "skills", "op-session", "SKILL.md")),
    );
    assert.isFalse(yield* fs.exists(path.join(home, ".claude")));
  }).pipe(Effect.provide(NodeServices.layer)),
);
