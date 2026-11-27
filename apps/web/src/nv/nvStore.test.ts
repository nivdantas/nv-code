import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  LEGACY_NV_STATE_KEY,
  NV_STATE_KEY,
  parseNvState,
  persistNvState,
  readNvState,
} from "./nvStore";

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, value),
  };
}

const profile = {
  id: "work",
  name: "Work",
  projectKeys: ["github.com/pingdotgg/t3code"],
  color: "pink" as const,
};
const saved = {
  sidebarProfiles: [profile],
  sidebarActiveProfileId: profile.id,
};

describe("nvStore persistence", () => {
  let localStorageStub: Storage;

  beforeEach(() => {
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage: localStorageStub });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores profiles across reloads", () => {
    persistNvState(saved);
    expect(readNvState()).toEqual(saved);
  });

  it("carries over choices saved before NV-CODE had its own key", () => {
    localStorageStub.setItem(
      LEGACY_NV_STATE_KEY,
      JSON.stringify({ projectOrder: ["a"], ...saved }),
    );
    expect(readNvState()).toEqual(saved);

    persistNvState({ ...saved, sidebarActiveProfileId: null });
    expect(readNvState().sidebarActiveProfileId).toBeNull();
    expect(JSON.parse(localStorageStub.getItem(NV_STATE_KEY) ?? "{}")).not.toHaveProperty(
      "projectOrder",
    );
  });

  it.each([NV_STATE_KEY, LEGACY_NV_STATE_KEY])("drops old bot fields from %s", (key) => {
    localStorageStub.setItem(
      key,
      JSON.stringify({
        ...saved,
        sidebarBotByThreadKey: { "local:deploy": true },
        sidebarBotSettingsByThreadKey: { "local:deploy": { brief: "Triage issues." } },
      }),
    );

    expect(readNvState()).toEqual(saved);
    persistNvState(readNvState());
    expect(JSON.parse(localStorageStub.getItem(NV_STATE_KEY) ?? "{}")).toEqual(saved);
  });

  it("drops unknown profile colors and missing active profiles", () => {
    expect(
      parseNvState({
        sidebarProfiles: [{ id: "p", name: "P", projectKeys: ["k"], color: "plaid" }],
        sidebarActiveProfileId: "gone",
      }),
    ).toEqual({
      sidebarProfiles: [{ id: "p", name: "P", projectKeys: ["k"] }],
      sidebarActiveProfileId: null,
    });
  });
});
