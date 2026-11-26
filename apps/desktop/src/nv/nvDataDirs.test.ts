import { assert, describe, it } from "@effect/vitest";

import { moveLegacyNightshiftData } from "./nvDataDirs.ts";

const SUPPORT = "/Users/alice/Library/Application Support";

function makeFs(existing: readonly string[], links: Record<string, string> = {}) {
  const paths = new Set(existing);
  const symlinks = new Map(Object.entries(links));
  const renames: Array<readonly [string, string]> = [];
  const created: Array<readonly [string, string]> = [];
  return {
    renames,
    created,
    fs: {
      existsSync: (path: string) => paths.has(path) || symlinks.has(path),
      renameSync: (from: string, to: string) => {
        paths.delete(from);
        paths.add(to);
        renames.push([from, to]);
      },
      symlinkSync: (target: string, path: string) => {
        symlinks.set(path, target);
        created.push([target, path]);
      },
      readlinkSync: (path: string) => {
        const target = symlinks.get(path);
        if (target === undefined) throw new Error("EINVAL");
        return target;
      },
    },
  };
}

function run(
  fs: ReturnType<typeof makeFs>["fs"],
  overrides: Partial<Parameters<typeof moveLegacyNightshiftData>[0]> = {},
) {
  const logs: string[] = [];
  moveLegacyNightshiftData({
    homeDirectory: "/Users/alice",
    appDataDirectory: SUPPORT,
    t3Home: undefined,
    isPackaged: true,
    platform: "darwin",
    joinPath: (...parts: string[]) => parts.join("/"),
    fs,
    processIsAlive: () => false,
    log: (message) => logs.push(message),
    ...overrides,
  });
  return logs;
}

describe("moveLegacyNightshiftData", () => {
  it("moves the profile and state folders and links the old state path", () => {
    const { fs, renames, created } = makeFs([
      "/Users/alice/.nightshift-code",
      `${SUPPORT}/nightshift-code`,
    ]);
    run(fs);
    assert.deepStrictEqual(renames, [
      [`${SUPPORT}/nightshift-code`, `${SUPPORT}/nv-code`],
      ["/Users/alice/.nightshift-code", "/Users/alice/.nv-code"],
    ]);
    assert.deepStrictEqual(created, [["/Users/alice/.nv-code", "/Users/alice/.nightshift-code"]]);
  });

  it("does nothing in an unpackaged (dev) build or off macOS", () => {
    const existing = ["/Users/alice/.nightshift-code", `${SUPPORT}/nightshift-code`];
    const dev = makeFs(existing);
    run(dev.fs, { isPackaged: false });
    assert.deepStrictEqual(dev.renames, []);
    const linux = makeFs(existing);
    run(linux.fs, { platform: "linux" });
    assert.deepStrictEqual(linux.renames, []);
  });

  it("never touches the dev profile", () => {
    const { fs, renames } = makeFs([`${SUPPORT}/nightshift-code-dev`]);
    run(fs);
    assert.deepStrictEqual(renames, []);
  });

  it("leaves everything alone while the pre-rename app holds its profile", () => {
    const { fs, renames } = makeFs(
      ["/Users/alice/.nightshift-code", `${SUPPORT}/nightshift-code`],
      { [`${SUPPORT}/nightshift-code/SingletonLock`]: "alice-mac-4242" },
    );
    const logs = run(fs, { processIsAlive: (pid) => pid === 4242 });
    assert.deepStrictEqual(renames, []);
    assert.strictEqual(logs.length, 1);
  });

  it("skips and logs a folder whose new location exists, and respects T3CODE_HOME", () => {
    const { fs, renames } = makeFs([
      "/Users/alice/.nightshift-code",
      `${SUPPORT}/nightshift-code`,
      `${SUPPORT}/nv-code`,
    ]);
    const logs = run(fs, { t3Home: "/data/t3" });
    assert.deepStrictEqual(renames, []);
    assert.strictEqual(logs.length, 1);
  });

  it("is quiet once the old state path is the link it left behind", () => {
    const { fs, renames } = makeFs(["/Users/alice/.nv-code"], {
      "/Users/alice/.nightshift-code": "/Users/alice/.nv-code",
    });
    const logs = run(fs);
    assert.deepStrictEqual(renames, []);
    assert.deepStrictEqual(logs, []);
  });
});
