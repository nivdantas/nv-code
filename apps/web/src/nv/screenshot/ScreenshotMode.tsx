import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { resolveThreadActivityTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import { msg, T, useGT, useMessages } from "gt-react";
import { BotIcon, CameraIcon, FolderIcon, MessageSquareIcon } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { APP_BASE_NAME } from "~/branding";
import { dispatchCommandPalette } from "~/commandPaletteStore";
import { useShownThreadRouteTarget } from "~/hooks/useShownThreadRouteTarget";
import { useSidebarProjectGroups } from "~/hooks/useSidebarProjectGroups";
import { cn } from "~/lib/utils";
import { useScreenshotModeStore } from "./screenshotModeStore";
import { registerCommands } from "~/shortcuts/dispatcher";
import {
  useDelegatedUnderParent,
  useQuietThreadShells,
  useTimelineVisibleTurnItems,
} from "~/state/entities";
import { useUiStateStore } from "~/uiStateStore";
import { useNvStore } from "../nvStore";
import { NvCodeMark } from "../NvCodeMark";
import {
  filterSidebarV2VisibleThreads,
  resolveSidebarRowStatus,
  type SidebarThreadStatus,
} from "~/components/Sidebar.logic";
import { ColorDot, profileColor } from "../profiles/SidebarColorChoice";
import { Button } from "~/components/ui/button";

const STATUS_LABELS = {
  approval: msg("Needs approval"),
  input: msg("Needs input"),
  request: msg("Request", { $context: "thread status: guest request" }),
  preparing: msg("Setting up"),
  working: msg("Working", { $context: "thread status" }),
  waiting: msg("Waiting", { $context: "thread status" }),
  failed: msg("Failed", { $context: "thread status" }),
  limited: msg("Limited", { $context: "thread status: usage limited" }),
  ready: msg("Ready", { $context: "thread status" }),
} satisfies Record<SidebarThreadStatus, string>;

const SAMPLE_MESSAGES = {
  user_message: [
    msg("Could you review the release and check what still needs attention?"),
    msg("That looks good. Please run the verification checks."),
  ],
  assistant_message: [
    msg(
      "I reviewed the changes and traced the new behavior through the main workflow. I found two edge cases and updated the implementation to handle both.",
    ),
    msg("The focused checks passed. The release is ready for a final review."),
  ],
};

function showScreenshotDialog(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  dialog.showModal();
  return () => dialog.close();
}

export function ScreenshotModeHost() {
  const active = useScreenshotModeStore((state) => state.active);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the workspace screenshot shortcut for the lifetime of the app shell
  useEffect(() => {
    const dispose = registerCommands(
      {
        "screenshotMode.toggle": (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat) return;
          dispatchCommandPalette({ _tag: "SetOpen", open: false });
          useScreenshotModeStore.setState((state) => ({ active: !state.active }));
        },
      },
      { capture: true },
    );
    return () => {
      dispose();
      useScreenshotModeStore.setState({ active: false });
    };
  }, []);
  return active ? <ScreenshotMode /> : null;
}

function ScreenshotMode() {
  const gt = useGT();
  const m = useMessages();
  const { shownTarget } = useShownThreadRouteTarget();
  const threadRef = shownTarget?.kind === "server" ? shownTarget.threadRef : null;
  const activeThreadKey = threadRef ? scopedThreadKey(threadRef) : null;
  const items = useTimelineVisibleTurnItems(threadRef);
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const groups = useSidebarProjectGroups();
  const profiles = useNvStore((state) => state.sidebarProfiles);
  const activeProfileId = useNvStore((state) => state.sidebarActiveProfileId);
  const regularScope = useUiStateStore((state) => state.sidebarProjectScopeKeys);
  const activeProfile = profiles.find(({ id }) => id === activeProfileId);
  const projectScope = activeProfile?.projectKeys ?? regularScope;
  const scopedProjectKeys =
    projectScope.length === 0
      ? null
      : new Set(
          groups
            .filter((group) => projectScope.includes(group.projectKey))
            .flatMap((group) =>
              group.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
            ),
        );
  const projectNumbers = new Map(
    groups.flatMap((group, index) =>
      group.memberProjectRefs.map(
        (ref) => [`${ref.environmentId}:${ref.projectId}`, index + 1] as const,
      ),
    ),
  );
  const rows = filterSidebarV2VisibleThreads(threads, scopedProjectKeys, delegatedUnderParent)
    .toSorted((left, right) =>
      (resolveThreadActivityTimestamp(right) ?? "").localeCompare(
        resolveThreadActivityTimestamp(left) ?? "",
      ),
    )
    .slice(0, 10)
    .map((thread, index) => {
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      const isBot = thread.botConfig != null;
      const projectNumber = projectNumbers.get(`${thread.environmentId}:${thread.projectId}`);
      return {
        key: threadKey,
        title: isBot
          ? gt("Assistant {number}", { number: index + 1 })
          : gt("Thread {number}", { number: index + 1 }),
        project: projectNumber ? gt("Project {number}", { number: projectNumber }) : null,
        status: resolveSidebarRowStatus(thread),
        isBot,
        active: threadKey === activeThreadKey,
      };
    });
  const messages = items
    .flatMap(({ item, position }) =>
      item.type === "user_message" || item.type === "assistant_message"
        ? [{ role: item.type, position }]
        : [],
    )
    .slice(-4);
  const title =
    rows.find((row) => row.active)?.title ?? (threadRef ? gt("Thread preview") : gt("New thread"));
  const close = () => useScreenshotModeStore.setState({ active: false });

  return createPortal(
    <dialog
      ref={showScreenshotDialog}
      aria-label={gt("Screenshot mode")}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-background [-webkit-app-region:no-drag]"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-full min-h-0">
        <aside className="hidden w-56 shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-3 text-sidebar-foreground sm:flex lg:w-72">
          <div className="flex h-9 items-center gap-2 px-2 text-sm font-semibold">
            <NvCodeMark className="size-4" aria-hidden />
            {APP_BASE_NAME}
          </div>
          {profiles.length > 0 ? (
            <div className="flex gap-1 overflow-hidden px-2 text-xs text-sidebar-muted-foreground">
              <span
                className={cn(
                  "shrink-0 rounded-md px-1.5 py-1",
                  !activeProfile && "bg-sidebar-row-active",
                )}
              >
                <T>All projects</T>
              </span>
              {profiles.slice(0, 4).map((profile, index) => (
                <span
                  key={profile.id}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1",
                    activeProfileId === profile.id && "bg-sidebar-row-active",
                  )}
                >
                  <ColorDot color={profileColor(profile)} />
                  {gt("Profile {number}", { number: index + 1 })}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {rows.map(({ key, title, project, status, isBot, active }) => (
              <div
                key={key}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-2 text-sm",
                  active && "border-border bg-sidebar-row-active",
                )}
              >
                {isBot ? (
                  <BotIcon aria-hidden className="size-4 shrink-0 text-sidebar-muted-foreground" />
                ) : (
                  <FolderIcon
                    aria-hidden
                    className="size-4 shrink-0 text-sidebar-muted-foreground"
                  />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{title}</span>
                  <span className="truncate text-xs text-sidebar-muted-foreground">
                    {project
                      ? gt("{project} · {status}", { project, status: m(STATUS_LABELS[status]) })
                      : m(STATUS_LABELS[status])}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-12 items-center gap-3 border-b border-border px-4 sm:px-6">
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <CameraIcon className="size-3.5" aria-hidden />
              <T>Screenshot mode</T>
            </span>
            <Button size="xs" variant="outline" onClick={close}>
              <T>Exit screenshot mode</T>
            </Button>
          </header>
          <div
            className={cn(
              "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-5 py-7",
              threadRef === null && "justify-center",
            )}
          >
            {threadRef === null ? (
              <h2 className="text-xl font-semibold">
                <T>What would you like to work on?</T>
              </h2>
            ) : null}
            {messages.map(({ role, position }, index) => (
              <p
                key={position}
                className={cn(
                  "max-w-xl text-sm leading-relaxed",
                  role === "user_message" && "self-end rounded-2xl bg-muted px-4 py-2.5",
                )}
              >
                {m(SAMPLE_MESSAGES[role][Math.floor(index / 2) % 2]!)}
              </p>
            ))}
            <div
              className={cn(
                "flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground",
                threadRef && "mt-auto",
              )}
            >
              <MessageSquareIcon className="size-4" aria-hidden />
              <T>Write a message…</T>
            </div>
          </div>
        </main>
      </div>
    </dialog>,
    document.body,
  );
}
