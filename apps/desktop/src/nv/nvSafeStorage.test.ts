import { describe, expect, it } from "vite-plus/test";

import { copyLegacySafeStorageKey } from "./nvSafeStorage.ts";

function setup(entries: Record<string, string>, options: { readonly deny?: boolean } = {}) {
  const calls: Array<{ args: ReadonlyArray<string>; stdin: string | undefined }> = [];
  const logs: string[] = [];
  const exec = {
    security: (args: ReadonlyArray<string>, stdin?: string) => {
      calls.push({ args, stdin });
      if (args[0] === "-i") {
        const service = stdin?.match(/-s "([^"]+)"/)?.[1];
        const secret = stdin?.match(/-w "([^"]+)"/)?.[1];
        if (service && secret) entries[service] = secret;
        return "";
      }
      const service = args[args.indexOf("-s") + 1]!;
      if (!(service in entries)) throw new Error("not found");
      if (args.includes("-w")) {
        if (options.deny) throw new Error("denied");
        return `${entries[service]}\n`;
      }
      return "attributes";
    },
  };
  const run = (overrides: Partial<Parameters<typeof copyLegacySafeStorageKey>[0]> = {}) =>
    copyLegacySafeStorageKey({
      productName: "NV-CODE",
      execPath: "/Applications/NV-CODE.app/Contents/MacOS/NV-CODE",
      isPackaged: true,
      platform: "darwin",
      exec,
      log: (message) => logs.push(message),
      ...overrides,
    });
  return { entries, calls, logs, run };
}

describe("copyLegacySafeStorageKey", () => {
  it("copies the old key through stdin, never the argument list", () => {
    const { entries, calls, run } = setup({ "Nightshift Code Safe Storage": "c2VjcmV0" });
    run();
    expect(entries["NV-CODE Safe Storage"]).toBe("c2VjcmV0");
    const add = calls.find((call) => call.args[0] === "-i")!;
    expect(add.args).toEqual(["-i"]);
    expect(add.stdin).toContain('-a "NV-CODE Key"');
    expect(add.stdin).toContain('-T "/Applications/NV-CODE.app/Contents/MacOS/NV-CODE"');
  });

  it("leaves an existing NV-CODE key alone", () => {
    const { entries, calls, run } = setup({
      "Nightshift Code Safe Storage": "old",
      "NV-CODE Safe Storage": "new",
    });
    run();
    expect(entries["NV-CODE Safe Storage"]).toBe("new");
    expect(calls.some((call) => call.args.includes("-w"))).toBe(false);
  });

  it("does nothing without an old key, outside macOS, or in development", () => {
    for (const overrides of [{}, { platform: "linux" }, { isPackaged: false }]) {
      const { calls, run } = setup(
        Object.keys(overrides).length === 0 ? {} : { "Nightshift Code Safe Storage": "old" },
      );
      run(overrides);
      expect(calls.some((call) => call.args.includes("-w") || call.args[0] === "-i")).toBe(false);
    }
  });

  it("logs and moves on when the user denies Keychain access", () => {
    const { entries, logs, run } = setup({ "Nightshift Code Safe Storage": "old" }, { deny: true });
    run();
    expect(entries["NV-CODE Safe Storage"]).toBeUndefined();
    expect(logs.join("\n")).toContain("could not read");
  });
});
