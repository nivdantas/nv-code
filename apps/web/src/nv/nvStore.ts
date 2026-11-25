import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";

import { BOT_COLOR_NAMES, BOT_SHAPES, type BotColor, type BotShape } from "./bots/botArt";

export interface SidebarProfile {
  readonly id: string;
  readonly name: string;
  readonly projectKeys: readonly string[];
  readonly color?: BotColor | undefined;
}

export interface SidebarBotSettings {
  readonly shape?: BotShape | undefined;
  readonly color?: BotColor | undefined;
  /** Prepended to the next message sent to the bot while `briefPending` is set. */
  readonly brief?: string | undefined;
  readonly briefPending?: boolean | undefined;
}

export interface NvState {
  sidebarProfiles: readonly SidebarProfile[];
  sidebarActiveProfileId: string | null;
  sidebarBotByThreadKey: Record<string, boolean>;
  sidebarBotSettingsByThreadKey: Record<string, SidebarBotSettings>;
}

export const SIDEBAR_BOT_BRIEF_MAX_CHARS = 4_000;
export const NV_STATE_KEY = "nv-code:ui-state:v1";
// Earlier NV-CODE builds kept these fields inside upstream's UI state.
export const LEGACY_NV_STATE_KEY = "t3code:ui-state:v1";

const initialState: NvState = {
  sidebarProfiles: [],
  sidebarActiveProfileId: null,
  sidebarBotByThreadKey: {},
  sidebarBotSettingsByThreadKey: {},
};

function sanitizeKey(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => sanitizeKey(entry) !== null))];
}

function sanitizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => entry[0].length > 0 && typeof entry[1] === "boolean",
    ),
  );
}

function sanitizeBotColor(value: unknown): BotColor | undefined {
  return BOT_COLOR_NAMES.find((color) => color === value);
}

function sanitizeBotShape(value: unknown): BotShape | undefined {
  return BOT_SHAPES.find((shape) => shape === value);
}

function sanitizeProfiles(value: unknown): SidebarProfile[] {
  if (!Array.isArray(value)) return [];
  const profiles = new Map<string, SidebarProfile>();
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = sanitizeKey(raw.id);
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const projectKeys = sanitizeStringArray(raw.projectKeys);
    const color = sanitizeBotColor(raw.color);
    if (id && name && projectKeys.length > 0) {
      profiles.set(id, { id, name, projectKeys, ...(color ? { color } : {}) });
    }
  }
  return [...profiles.values()];
}

function sanitizeBotSettings(value: unknown): Record<string, SidebarBotSettings> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, SidebarBotSettings> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key || !entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const brief =
      typeof raw.brief === "string" ? raw.brief.trim().slice(0, SIDEBAR_BOT_BRIEF_MAX_CHARS) : "";
    const shape = sanitizeBotShape(raw.shape);
    const color = sanitizeBotColor(raw.color);
    const settings: SidebarBotSettings = {
      ...(shape ? { shape } : {}),
      ...(color ? { color } : {}),
      ...(brief ? { brief, ...(raw.briefPending === true ? { briefPending: true } : {}) } : {}),
    };
    if (Object.keys(settings).length > 0) out[key] = settings;
  }
  return out;
}

export function parseNvState(value: unknown): NvState {
  if (!value || typeof value !== "object") return initialState;
  const raw = value as Record<string, unknown>;
  const sidebarProfiles = sanitizeProfiles(raw.sidebarProfiles);
  return {
    sidebarProfiles,
    sidebarActiveProfileId:
      sidebarProfiles.find(({ id }) => id === raw.sidebarActiveProfileId)?.id ?? null,
    sidebarBotByThreadKey: sanitizeBooleanRecord(raw.sidebarBotByThreadKey),
    sidebarBotSettingsByThreadKey: sanitizeBotSettings(raw.sidebarBotSettingsByThreadKey),
  };
}

export function readNvState(): NvState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw =
      window.localStorage.getItem(NV_STATE_KEY) ?? window.localStorage.getItem(LEGACY_NV_STATE_KEY);
    return raw ? parseNvState(JSON.parse(raw)) : initialState;
  } catch {
    return initialState;
  }
}

export function persistNvState(state: NvState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      NV_STATE_KEY,
      JSON.stringify({
        sidebarProfiles: state.sidebarProfiles,
        sidebarActiveProfileId: state.sidebarActiveProfileId,
        sidebarBotByThreadKey: state.sidebarBotByThreadKey,
        sidebarBotSettingsByThreadKey: state.sidebarBotSettingsByThreadKey,
      } satisfies NvState),
    );
  } catch {}
}

interface NvStore extends NvState {
  selectSidebarProfile: (id: string | null) => void;
  saveSidebarProfile: (profile: SidebarProfile) => void;
  removeSidebarProfile: (id: string) => void;
  setSidebarBot: (threadKey: string, isBot: boolean, markedInTitle: boolean) => void;
  saveSidebarBotSettings: (
    threadKey: string,
    settings: Pick<SidebarBotSettings, "shape" | "color" | "brief">,
  ) => void;
  markSidebarBotBriefSent: (threadKey: string) => void;
}

export const useNvStore = create<NvStore>((set) => ({
  ...readNvState(),
  selectSidebarProfile: (id) =>
    set((state) => ({
      sidebarActiveProfileId:
        state.sidebarProfiles.find((profile) => profile.id === id)?.id ?? null,
    })),
  saveSidebarProfile: (profile) =>
    set((state) => ({
      sidebarProfiles: state.sidebarProfiles.some(({ id }) => id === profile.id)
        ? state.sidebarProfiles.map((entry) => (entry.id === profile.id ? profile : entry))
        : [...state.sidebarProfiles, profile],
      sidebarActiveProfileId: profile.id,
    })),
  removeSidebarProfile: (id) =>
    set((state) => ({
      sidebarProfiles: state.sidebarProfiles.filter((profile) => profile.id !== id),
      sidebarActiveProfileId:
        state.sidebarActiveProfileId === id ? null : state.sidebarActiveProfileId,
    })),
  setSidebarBot: (threadKey, isBot, markedInTitle) =>
    set((state) => {
      const sidebarBotByThreadKey = { ...state.sidebarBotByThreadKey };
      if (isBot === markedInTitle) delete sidebarBotByThreadKey[threadKey];
      else sidebarBotByThreadKey[threadKey] = isBot;
      return { sidebarBotByThreadKey };
    }),
  saveSidebarBotSettings: (threadKey, { shape, color, brief }) =>
    set((state) => {
      const previous = state.sidebarBotSettingsByThreadKey[threadKey];
      const nextBrief = brief?.trim().slice(0, SIDEBAR_BOT_BRIEF_MAX_CHARS) ?? "";
      const briefPending =
        nextBrief.length > 0 &&
        (nextBrief !== (previous?.brief ?? "") || previous?.briefPending === true);
      const settings: SidebarBotSettings = {
        ...(shape ? { shape } : {}),
        ...(color ? { color } : {}),
        ...(nextBrief ? { brief: nextBrief, ...(briefPending ? { briefPending } : {}) } : {}),
      };
      const sidebarBotSettingsByThreadKey = { ...state.sidebarBotSettingsByThreadKey };
      if (Object.keys(settings).length === 0) delete sidebarBotSettingsByThreadKey[threadKey];
      else sidebarBotSettingsByThreadKey[threadKey] = settings;
      return { sidebarBotSettingsByThreadKey };
    }),
  markSidebarBotBriefSent: (threadKey) =>
    set((state) => {
      const previous = state.sidebarBotSettingsByThreadKey[threadKey];
      if (!previous?.briefPending) return state;
      const { briefPending: _sent, ...settings } = previous;
      return {
        sidebarBotSettingsByThreadKey: {
          ...state.sidebarBotSettingsByThreadKey,
          [threadKey]: settings,
        },
      };
    }),
}));

const debouncedPersistNvState = new Debouncer(persistNvState, { wait: 500 });
useNvStore.subscribe((state) => debouncedPersistNvState.maybeExecute(state));

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => debouncedPersistNvState.flush());
}
