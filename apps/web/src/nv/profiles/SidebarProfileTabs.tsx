import { T, useGT } from "gt-react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { cn, randomUUID } from "~/lib/utils";
import { type SidebarProfile, useNvStore } from "../nvStore";
import { useActiveSidebarProfile } from "./profileScope";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { ColorDot, SidebarColorChoice, profileColor } from "./SidebarColorChoice";
import { SidebarHeaderIconButton } from "~/components/sidebar/SidebarThreadHeader";

type ProjectChoice = { readonly projectKey: string; readonly displayName: string };

export function SidebarProfileTabs({
  projects,
  currentProjectKeys,
  onScopeChange,
  onShowAll,
}: {
  projects: readonly ProjectChoice[];
  currentProjectKeys: readonly string[];
  /** Runs before any profile change, since each change swaps the listed threads. */
  onScopeChange: () => void;
  onShowAll: () => void;
}) {
  const profiles = useNvStore((state) => state.sidebarProfiles);
  const activeProfile = useActiveSidebarProfile();
  const onSelect = (id: string | null) => {
    onScopeChange();
    useNvStore.getState().selectSidebarProfile(id);
    if (id === null) onShowAll();
  };
  const onSave = (profile: SidebarProfile) => {
    onScopeChange();
    useNvStore.getState().saveSidebarProfile(profile);
  };
  const onRemove = (id: string) => {
    onScopeChange();
    useNvStore.getState().removeSidebarProfile(id);
  };
  const gt = useGT();
  const [editing, setEditing] = useState<SidebarProfile | "new" | null>(null);
  if (profiles.length === 0 && projects.length === 0) return null;

  const tabs = [
    { id: null, name: gt("All projects"), color: null },
    ...profiles.map((profile) => ({ ...profile, color: profileColor(profile) })),
  ];
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1">
      <div
        role="group"
        aria-label={gt("Sidebar profiles")}
        className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-0.5 py-1 [scrollbar-width:none]"
      >
        {tabs.map(({ id, name, color }) => {
          const selected = id === (activeProfile?.id ?? null);
          return (
            <button
              key={id ?? "all"}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(id)}
              className={cn(
                "flex max-w-32 shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
                selected
                  ? "bg-sidebar-row-hover text-sidebar-foreground"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
              )}
            >
              {color ? <ColorDot color={color} /> : null}
              <span className="truncate">{name}</span>
            </button>
          );
        })}
      </div>
      {activeProfile ? (
        <SidebarHeaderIconButton
          label={gt("Edit profile")}
          onClick={() => setEditing(activeProfile)}
        >
          <PencilIcon />
        </SidebarHeaderIconButton>
      ) : null}
      <SidebarHeaderIconButton
        label={gt("Add profile")}
        disabled={projects.length === 0}
        onClick={() => setEditing("new")}
      >
        <PlusIcon />
      </SidebarHeaderIconButton>
      {editing !== null ? (
        <SidebarProfileDialog
          profile={editing === "new" ? null : editing}
          projects={projects}
          currentProjectKeys={currentProjectKeys}
          onClose={() => setEditing(null)}
          onSave={(profile) => {
            onSave(profile);
            setEditing(null);
          }}
          onRemove={(id) => {
            onRemove(id);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SidebarProfileDialog({
  profile,
  projects,
  currentProjectKeys,
  onClose,
  onSave,
  onRemove,
}: {
  profile: SidebarProfile | null;
  projects: readonly ProjectChoice[];
  currentProjectKeys: readonly string[];
  onClose: () => void;
  onSave: (profile: SidebarProfile) => void;
  onRemove: (id: string) => void;
}) {
  const gt = useGT();
  const [name, setName] = useState(profile?.name ?? "");
  const [projectKeys, setProjectKeys] = useState(profile?.projectKeys ?? currentProjectKeys);
  const [id] = useState(() => profile?.id ?? randomUUID());
  const [color, setColor] = useState(() =>
    profileColor(profile ?? { id, name: "", projectKeys: [] }),
  );
  const projectChoices = [
    ...projects,
    ...(profile?.projectKeys ?? [])
      .filter((key) => !projects.some(({ projectKey }) => projectKey === key))
      .map((key) => ({ projectKey: key, displayName: gt("Unavailable project") })),
  ];
  const canSave = name.trim().length > 0 && projectKeys.length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) onSave({ id, name: name.trim(), projectKeys, color });
          }}
        >
          <DialogHeader>
            <DialogTitle>{profile ? gt("Edit profile") : gt("Add profile")}</DialogTitle>
            <DialogDescription>
              <T>Choose which projects appear in this sidebar profile.</T>
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-4 px-6 pb-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <T>Profile name</T>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={48}
              />
            </label>
            <SidebarColorChoice legend={gt("Color")} value={color} onChange={setColor} />
            <fieldset className="min-h-0 min-w-0">
              <legend className="mb-1.5 text-sm font-medium">
                <T>Projects</T>
              </legend>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-1">
                {projectChoices.map(({ projectKey, displayName }) => (
                  <label
                    key={projectKey}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={projectKeys.includes(projectKey)}
                      onCheckedChange={(checked) =>
                        setProjectKeys((current) =>
                          checked
                            ? [...current, projectKey]
                            : current.filter((key) => key !== projectKey),
                        )
                      }
                    />
                    <span className="truncate">{displayName}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            {profile ? (
              <Button type="button" variant="destructive" onClick={() => onRemove(profile.id)}>
                <T>Remove profile</T>
              </Button>
            ) : null}
            <Button type="submit" disabled={!canSave}>
              <T>Save profile</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
