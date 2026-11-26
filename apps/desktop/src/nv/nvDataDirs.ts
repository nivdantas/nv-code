export const NV_STATE_DIR_NAME = ".nv-code";
export const NV_USER_DATA_DIR_NAME = "nv-code";

// NV-CODE builds before the rename kept their data under Nightshift names.
const LEGACY_STATE_DIR_NAME = ".nightshift-code";
const LEGACY_USER_DATA_DIR_NAME = "nightshift-code";

interface MoveFileSystem {
  readonly existsSync: (path: string) => boolean;
  readonly renameSync: (from: string, to: string) => void;
  readonly symlinkSync: (target: string, path: string) => void;
  readonly readlinkSync: (path: string) => string;
}

/** True when a Chromium SingletonLock (a symlink to "host-pid") names a live process. */
function profileIsLocked(
  profileDirectory: string,
  input: {
    readonly joinPath: (...parts: string[]) => string;
    readonly fs: MoveFileSystem;
    readonly processIsAlive: (pid: number) => boolean;
  },
): boolean {
  let target: string;
  try {
    target = input.fs.readlinkSync(input.joinPath(profileDirectory, "SingletonLock"));
  } catch {
    return false;
  }
  const pid = Number(target.slice(target.lastIndexOf("-") + 1));
  return Number.isInteger(pid) && pid > 0 && input.processIsAlive(pid);
}

function isLinkTo(path: string, target: string, fs: MoveFileSystem): boolean {
  try {
    return fs.readlinkSync(path) === target;
  } catch {
    return false;
  }
}

/**
 * Moves pre-rename data to the NV-CODE folders once. Packaged macOS builds only, so a dev run
 * never renames the installed app's data. Skips a folder whose target exists or whose old app
 * is running. The state folder keeps a symlink at its old path for saved absolute paths.
 */
export function moveLegacyNightshiftData(input: {
  readonly homeDirectory: string;
  readonly appDataDirectory: string;
  readonly t3Home: string | undefined;
  readonly isPackaged: boolean;
  readonly platform: string;
  readonly joinPath: (...parts: string[]) => string;
  readonly fs: MoveFileSystem;
  readonly processIsAlive: (pid: number) => boolean;
  readonly log: (message: string) => void;
}): void {
  if (!input.isPackaged || input.platform !== "darwin") return;

  const legacyProfile = input.joinPath(input.appDataDirectory, LEGACY_USER_DATA_DIR_NAME);
  if (input.fs.existsSync(legacyProfile) && profileIsLocked(legacyProfile, input)) {
    input.log("NV-CODE: the pre-rename app is still running; its data was not moved.");
    return;
  }

  const moves: Array<{ readonly from: string; readonly to: string; readonly link: boolean }> = [
    {
      from: legacyProfile,
      to: input.joinPath(input.appDataDirectory, NV_USER_DATA_DIR_NAME),
      link: false,
    },
  ];
  if (!input.t3Home?.trim()) {
    moves.push({
      from: input.joinPath(input.homeDirectory, LEGACY_STATE_DIR_NAME),
      to: input.joinPath(input.homeDirectory, NV_STATE_DIR_NAME),
      link: true,
    });
  }

  for (const { from, to, link } of moves) {
    if (!input.fs.existsSync(from) || isLinkTo(from, to, input.fs)) continue;
    if (input.fs.existsSync(to)) {
      input.log(`NV-CODE: ${to} already exists, so ${from} was left in place.`);
      continue;
    }
    try {
      input.fs.renameSync(from, to);
    } catch (error) {
      input.log(`NV-CODE: could not move ${from} to ${to}: ${String(error)}`);
      continue;
    }
    if (link) {
      try {
        input.fs.symlinkSync(to, from);
      } catch (error) {
        input.log(`NV-CODE: moved ${from} but could not link it to ${to}: ${String(error)}`);
        continue;
      }
    }
    input.log(`NV-CODE: moved ${from} to ${to}.`);
  }
}
