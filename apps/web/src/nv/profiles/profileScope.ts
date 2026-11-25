import { type SidebarProfile, useNvStore } from "../nvStore";

export function useActiveSidebarProfile(): SidebarProfile | null {
  return useNvStore(
    (state) =>
      state.sidebarProfiles.find((profile) => profile.id === state.sidebarActiveProfileId) ?? null,
  );
}

/**
 * Applies a sidebar project-scope change to the active profile. Returns false when the
 * change belongs to the regular scope instead, leaving the profile first if one is open.
 */
export function applyProfileScopeKeys(
  profile: SidebarProfile | null,
  keys: readonly string[],
): boolean {
  if (profile === null) return false;
  if (keys.length === 0) {
    useNvStore.getState().selectSidebarProfile(null);
    return false;
  }
  useNvStore.getState().saveSidebarProfile({ ...profile, projectKeys: keys });
  return true;
}

/** A profile is its own scope, even when it lists the same projects as another. */
export function profileScopeKey(
  profile: SidebarProfile | null,
  keys: readonly string[],
): string | null {
  return profile ? [profile.id, ...keys].join("\n") : null;
}
