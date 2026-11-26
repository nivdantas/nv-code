// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Runs synchronously before the Effect runtime and its logger exist.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { moveLegacyNightshiftData } from "./nvDataDirs.ts";
import { copyLegacySafeStorageKey } from "./nvSafeStorage.ts";

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

const log = (message: string) => console.warn(message);
// oxlint-disable-next-line t3code/no-global-process-runtime -- Runs before any Effect runtime.
const platform = process.platform;

/** NV-CODE's first-launch steps, run from main.ts before the app opens any data. */
export function runNvFirstLaunch(app: {
  readonly isPackaged: boolean;
  readonly getName: () => string;
  readonly getPath: (name: "appData") => string;
}): void {
  moveLegacyNightshiftData({
    homeDirectory: NodeOS.homedir(),
    appDataDirectory: app.getPath("appData"),
    t3Home: process.env.T3CODE_HOME,
    isPackaged: app.isPackaged,
    platform,
    joinPath: NodePath.join,
    fs: NodeFS,
    processIsAlive,
    log,
  });
  copyLegacySafeStorageKey({
    productName: app.getName(),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    platform,
    exec: {
      security: (args, stdin) =>
        NodeChildProcess.execFileSync("/usr/bin/security", args, {
          encoding: "utf8",
          input: stdin,
          stdio: ["pipe", "pipe", "pipe"],
        }),
    },
    log,
  });
}
