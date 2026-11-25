import { assert, describe, it } from "@effect/vitest";

import { moveLegacyNightshiftData } from "./nvDataDirs.ts";

function makeFs(existing: readonly string[]) {
  const paths = new Set(existing);
  const renames: Array<readonly [string, string]> = [];
  return {
    renames,
    fs: {
      existsSync: (path: string) => paths.has(path),
      renameSync: (from: string, to: string) => {
        paths.delete(from);
        paths.add(to);
        renames.push([from, to]);
      },
    },
  };
}

const base = {
  homeDirectory: "/Users/alice",
  appDataDirectory: "/Users/alice/Library/Application Support",
  joinPath: (...parts: string[]) => parts.join("/"),
};

describe("moveLegacyNightshiftData", () => {
  it("moves the state and browser-profile folders to their NV-CODE names", () => {
    const { fs, renames } = makeFs([
      "/Users/alice/.nightshift-code",
      "/Users/alice/Library/Application Support/nightshift-code",
    ]);
    moveLegacyNightshiftData({ ...base, t3Home: undefined, fs });
    assert.deepStrictEqual(renames, [
      [
        "/Users/alice/Library/Application Support/nightshift-code",
        "/Users/alice/Library/Application Support/nv-code",
      ],
      ["/Users/alice/.nightshift-code", "/Users/alice/.nv-code"],
    ]);
  });

  it("leaves folders alone when NV-CODE data already exists or T3CODE_HOME is set", () => {
    const { fs, renames } = makeFs([
      "/Users/alice/.nightshift-code",
      "/Users/alice/Library/Application Support/nightshift-code-dev",
      "/Users/alice/Library/Application Support/nv-code-dev",
    ]);
    moveLegacyNightshiftData({ ...base, t3Home: "/data/t3", fs });
    assert.deepStrictEqual(renames, []);
  });
});
