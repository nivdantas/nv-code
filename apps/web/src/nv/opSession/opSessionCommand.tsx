import type { useGT } from "gt-react";
import { KeyRoundIcon } from "lucide-react";

import { type CommandPaletteActionItem, ITEM_ICON_CLASS } from "~/components/CommandPalette.logic";

export function opSessionCommandItem(
  gt: ReturnType<typeof useGT>,
  openSettings: () => Promise<void>,
): CommandPaletteActionItem {
  return {
    kind: "action",
    value: "action:op-session",
    searchTerms: ["op-session", "1password", "secrets"],
    title: gt("Open 1Password settings"),
    icon: <KeyRoundIcon className={ITEM_ICON_CLASS} />,
    run: openSettings,
  };
}
