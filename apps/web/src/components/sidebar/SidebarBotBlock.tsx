import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  type BotWorkersBoard,
  type BotGroups,
  botWorkersBoard,
} from "@t3tools/client-runtime/state/thread-grouping";
import type { ContextMenuSource, ScopedThreadRef } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { useEffect, useState } from "react";

import { contextMenuSourceOf } from "~/contextMenuSource";
import { cn } from "~/lib/utils";
import { useEnvironment } from "~/state/environments";
import { BotAvatar } from "../bot/BotAvatar";
import { type BotAvatarState, resolveBotStatus } from "../bot/botStatus";
import { Badge } from "../ui/badge";

// Long enough for a state change to read as the Bot reacting, short enough not to keep painting.
const REACTION_MS = 2000;

type ThreadContextMenuHandler = (
  threadRef: ScopedThreadRef,
  position: { x: number; y: number },
  source: ContextMenuSource,
) => void;

const ROW_CLASS =
  "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function BotRow(props: {
  bot: EnvironmentThreadShell;
  board: BotWorkersBoard<EnvironmentThreadShell>;
  isActive: boolean;
  showEnvironment: boolean;
  onNavigate: (threadRef: ScopedThreadRef) => void;
  onContextMenu: ThreadContextMenuHandler;
}) {
  const gt = useGT();
  const threadRef = scopeThreadRef(props.bot.environmentId, props.bot.id);
  const environment = useEnvironment(props.bot.environmentId);
  const status = resolveBotStatus(props.bot, props.board);
  const [hovered, setHovered] = useState(false);
  const [shownState, setShownState] = useState(status.state);
  const [reactingTo, setReactingTo] = useState<BotAvatarState | null>(null);
  if (shownState !== status.state) {
    setShownState(status.state);
    setReactingTo(status.state);
  }
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a timer ends the avatar's short live reaction to a state change
  useEffect(() => {
    if (reactingTo === null) return;
    const timer = setTimeout(() => setReactingTo(null), REACTION_MS);
    return () => clearTimeout(timer);
  }, [reactingTo]);
  return (
    <li>
      <button
        type="button"
        aria-current={props.isActive ? "page" : undefined}
        onClick={() => props.onNavigate(threadRef)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onContextMenu(
            threadRef,
            { x: event.clientX, y: event.clientY },
            contextMenuSourceOf(event),
          );
        }}
        className={cn(
          ROW_CLASS,
          props.isActive
            ? "bg-sidebar-row-active text-sidebar-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-row-hover",
        )}
      >
        <BotAvatar
          threadId={props.bot.id}
          state={status.state}
          size={20}
          live={hovered || reactingTo !== null}
        />
        <span className="min-w-0 flex-1 truncate">
          {props.bot.title === "Orchestrator" ? gt("Orchestrator") : props.bot.title}
        </span>
        {props.showEnvironment && (
          <span className="max-w-[40%] truncate text-2xs text-sidebar-muted-foreground">
            {environment?.label ?? props.bot.environmentId}
          </span>
        )}
        {status.needsYou > 0 ? (
          <Badge variant="warning" size="sm">
            {gt("{count, plural, one {Needs you} other {{count} need you}}", {
              count: status.needsYou,
            })}
          </Badge>
        ) : status.state === "blocked" ? (
          <span className="shrink-0 text-2xs text-destructive-foreground">
            <T>Stopped</T>
          </span>
        ) : status.state === "working" ? (
          <span className="shrink-0 text-2xs text-sidebar-muted-foreground">
            <T>Working</T>
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** Bots sit above the thread list as their own rows; their workers live on the Bot's page. */
export function SidebarBotBlock(props: {
  botGroups: BotGroups<EnvironmentThreadShell>;
  routeThreadKey: string | null;
  onNavigate: (threadRef: ScopedThreadRef) => void;
  onContextMenu: ThreadContextMenuHandler;
}) {
  const gt = useGT();
  return (
    <ul aria-label={gt("Bots")} className="mb-2 flex flex-col gap-px">
      {props.botGroups.bots.map((bot) => {
        const key = scopedThreadKey(scopeThreadRef(bot.environmentId, bot.id));
        const board = botWorkersBoard(props.botGroups, key);
        const routeKey = props.routeThreadKey;
        // A worker thread opens inside its Bot, so the Bot's row stays current there.
        const isActive =
          routeKey !== null &&
          (routeKey === key ||
            [...board.needsYou, ...board.working, ...board.done].some(
              (member) =>
                scopedThreadKey(scopeThreadRef(member.environmentId, member.id)) === routeKey,
            ));
        return (
          <BotRow
            key={key}
            bot={bot}
            board={board}
            isActive={isActive}
            showEnvironment={props.botGroups.bots.length > 1}
            onNavigate={props.onNavigate}
            onContextMenu={props.onContextMenu}
          />
        );
      })}
    </ul>
  );
}
