export const NV_STATE_DIR_NAME = ".nv-code";
export const NV_USER_DATA_DIR_NAME = "nv-code";

// NV-CODE builds before the rename kept their data under Nightshift names.
const LEGACY_STATE_DIR_NAME = ".nightshift-code";
const LEGACY_USER_DATA_DIR_NAME = "nightshift-code";

interface MoveFileSystem {
  readonly existsSync: (path: string) => boolean;
  readonly renameSync: (from: string, to: string) => void;
}

/**
 * Moves pre-rename data to the NV-CODE folders once, before anything opens them.
 * A folder is left alone when its new location already exists.
 */
export function moveLegacyNightshiftData(input: {
  readonly homeDirectory: string;
  readonly appDataDirectory: string;
  readonly t3Home: string | undefined;
  readonly joinPath: (...parts: string[]) => string;
  readonly fs: MoveFileSystem;
}): void {
  const moves: Array<readonly [string, string]> = [
    [LEGACY_USER_DATA_DIR_NAME, NV_USER_DATA_DIR_NAME],
    [`${LEGACY_USER_DATA_DIR_NAME}-dev`, `${NV_USER_DATA_DIR_NAME}-dev`],
  ].map(([from, to]) => [
    input.joinPath(input.appDataDirectory, from!),
    input.joinPath(input.appDataDirectory, to!),
  ]);
  if (!input.t3Home?.trim()) {
    moves.push([
      input.joinPath(input.homeDirectory, LEGACY_STATE_DIR_NAME),
      input.joinPath(input.homeDirectory, NV_STATE_DIR_NAME),
    ]);
  }
  for (const [from, to] of moves) {
    try {
      if (input.fs.existsSync(from) && !input.fs.existsSync(to)) input.fs.renameSync(from, to);
    } catch {
      // Startup goes on with a fresh folder; the old one stays where it was.
    }
  }
}
