import { useGT } from "gt-react";

import type { SidebarThreadStatus } from "~/components/Sidebar.logic";
import { useNvStore } from "../nvStore";
import { botTitleWithoutMarker } from "./SidebarBotAvatar";
import type { BotMenuId } from "./botMenu";
import { openSidebarBotDialog } from "./SidebarBotDialog";

/** Whether a sidebar row shows as a bot, and the title and look it shows with. */
export function useSidebarBot(threadKey: string, title: string) {
  const gt = useGT();
  const markedTitle = botTitleWithoutMarker(title);
  const override = useNvStore((state) => state.sidebarBotByThreadKey[threadKey]);
  const look = useNvStore((state) => state.sidebarBotSettingsByThreadKey[threadKey]);
  const isBot = override ?? markedTitle !== null;
  const displayTitle = (markedTitle ?? title) || gt("Bot thread");
  return {
    isBot,
    look,
    displayTitle,
    accessibleTitle: isBot ? gt("Bot: {name}", { name: displayTitle }) : displayTitle,
  };
}

/** A bot row shows its live status, or else its latest message, in place of the meta line. */
export function botRowPreview(
  status: SidebarThreadStatus,
  statusLabel: string | undefined,
  latestMessage: string | undefined,
  readyLabel: string,
): string {
  return (status === "ready" ? null : statusLabel) ?? (latestMessage?.trim() || readyLabel);
}

/** Thread-menu state for the bot actions; read outside render, when the menu opens. */
export function sidebarBotMenuState(threadKey: string, title: string) {
  const unmarkedTitle = botTitleWithoutMarker(title);
  const markedInTitle = unmarkedTitle !== null;
  const isBot = useNvStore.getState().sidebarBotByThreadKey[threadKey] ?? markedInTitle;
  return {
    isBot,
    run: (action: BotMenuId) => {
      if (action === "toggle-bot") {
        useNvStore.getState().setSidebarBot(threadKey, !isBot, markedInTitle);
      } else {
        openSidebarBotDialog({ threadKey, title: unmarkedTitle ?? title });
      }
    },
  };
}
