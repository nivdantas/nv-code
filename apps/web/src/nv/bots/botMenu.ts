import type { ContextMenuItem } from "@t3tools/contracts";
import { msg } from "gt-react";

import type { MessageResolver } from "~/i18n/messages";

export type BotMenuId = "toggle-bot" | "customize-bot";

/** Bot actions for the thread menu; `isBot` is undefined where rows never show as bots. */
export function botMenuItems(
  isBot: boolean | undefined,
  resolve: MessageResolver,
): ReadonlyArray<ContextMenuItem<BotMenuId>> {
  if (isBot === undefined) return [];
  return [
    {
      id: "toggle-bot",
      label: isBot ? resolve(msg("Show as regular thread")) : resolve(msg("Show as bot thread")),
    },
    ...(isBot ? [{ id: "customize-bot" as const, label: resolve(msg("Customize bot…")) }] : []),
  ];
}
