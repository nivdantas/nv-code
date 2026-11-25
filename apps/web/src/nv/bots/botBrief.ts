import { useNvStore } from "~/nv/nvStore";
import { botTitleWithoutMarker } from "./SidebarBotAvatar";

/** The bot's brief when it has not been sent since it was last changed. */
export function pendingBotBrief(threadKey: string, title: string): string | null {
  const state = useNvStore.getState();
  const isBot = state.sidebarBotByThreadKey[threadKey] ?? botTitleWithoutMarker(title) !== null;
  const settings = state.sidebarBotSettingsByThreadKey[threadKey];
  return isBot && settings?.briefPending && settings.brief ? settings.brief : null;
}

export function withBotBrief(brief: string, text: string): string {
  return `<bot_brief>\n${brief}\n</bot_brief>\n\n${text}`;
}

export function markBotBriefSent(threadKey: string): void {
  useNvStore.getState().markSidebarBotBriefSent(threadKey);
}
