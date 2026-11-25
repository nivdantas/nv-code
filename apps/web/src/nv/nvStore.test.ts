import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  LEGACY_NV_STATE_KEY,
  NV_STATE_KEY,
  parseNvState,
  persistNvState,
  readNvState,
  useNvStore,
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
  sidebarBotByThreadKey: { "local:deploy": true, "remote:dispatch": false },
  sidebarBotSettingsByThreadKey: {
    "local:deploy": {
      shape: "football" as const,
      color: "teal" as const,
      brief: "Triage new issues.",
      briefPending: true,
    },
  },
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

  it("restores profiles and bot choices across reloads", () => {
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

  it("drops unknown shapes, colors, empty briefs and missing active profiles", () => {
    expect(
      parseNvState({
        sidebarBotSettingsByThreadKey: {
          "local:a": { shape: "blob", color: "teal", brief: "  " },
          "local:b": { shape: "nope", color: "nope" },
        },
        sidebarProfiles: [{ id: "p", name: "P", projectKeys: ["k"], color: "plaid" }],
        sidebarActiveProfileId: "gone",
      }),
    ).toEqual({
      sidebarProfiles: [{ id: "p", name: "P", projectKeys: ["k"] }],
      sidebarActiveProfileId: null,
      sidebarBotByThreadKey: {},
      sidebarBotSettingsByThreadKey: { "local:a": { color: "teal" } },
    });
  });
});

describe("bot settings", () => {
  afterEach(() => {
    useNvStore.setState({ sidebarBotSettingsByThreadKey: {} });
  });

  it("sends a brief once, and again only after it changes", () => {
    const store = useNvStore.getState();
    const settings = () => useNvStore.getState().sidebarBotSettingsByThreadKey["local:bot"];

    store.saveSidebarBotSettings("local:bot", { brief: "Watch deploys." });
    expect(settings()).toEqual({ brief: "Watch deploys.", briefPending: true });

    store.markSidebarBotBriefSent("local:bot");
    store.saveSidebarBotSettings("local:bot", { shape: "star", brief: "Watch deploys." });
    expect(settings()).toEqual({ shape: "star", brief: "Watch deploys." });

    store.saveSidebarBotSettings("local:bot", { shape: "star", brief: "Watch deploys and CI." });
    expect(settings()?.briefPending).toBe(true);

    store.saveSidebarBotSettings("local:bot", {});
    expect(settings()).toBeUndefined();
  });
});
