import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";

import { SIDEBAR_COLOR_NAMES, type SidebarColor } from "./profiles/sidebarColors";

export interface SidebarProfile {
  readonly id: string;
  readonly name: string;
  readonly projectKeys: readonly string[];
  readonly color?: SidebarColor | undefined;
}

export interface NvState {
  sidebarProfiles: readonly SidebarProfile[];
  sidebarActiveProfileId: string | null;
}

export const NV_STATE_KEY = "nv-code:ui-state:v1";
// Earlier NV-CODE builds kept these fields inside upstream's UI state.
export const LEGACY_NV_STATE_KEY = "t3code:ui-state:v1";

const initialState: NvState = {
  sidebarProfiles: [],
  sidebarActiveProfileId: null,
};

function sanitizeKey(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => sanitizeKey(entry) !== null))];
}

function sanitizeSidebarColor(value: unknown): SidebarColor | undefined {
  return SIDEBAR_COLOR_NAMES.find((color) => color === value);
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
    const color = sanitizeSidebarColor(raw.color);
    if (id && name && projectKeys.length > 0) {
      profiles.set(id, { id, name, projectKeys, ...(color ? { color } : {}) });
    }
  }
  return [...profiles.values()];
}

export function parseNvState(value: unknown): NvState {
  if (!value || typeof value !== "object") return initialState;
  const raw = value as Record<string, unknown>;
  const sidebarProfiles = sanitizeProfiles(raw.sidebarProfiles);
  return {
    sidebarProfiles,
    sidebarActiveProfileId:
      sidebarProfiles.find(({ id }) => id === raw.sidebarActiveProfileId)?.id ?? null,
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
      } satisfies NvState),
    );
  } catch {}
}

interface NvStore extends NvState {
  selectSidebarProfile: (id: string | null) => void;
  saveSidebarProfile: (profile: SidebarProfile) => void;
  removeSidebarProfile: (id: string) => void;
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
}));

const debouncedPersistNvState = new Debouncer(persistNvState, { wait: 500 });
useNvStore.subscribe((state) => debouncedPersistNvState.maybeExecute(state));

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => debouncedPersistNvState.flush());
}
