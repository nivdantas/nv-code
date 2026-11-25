import type { useGT } from "gt-react";
import { CameraIcon } from "lucide-react";

import { type CommandPaletteActionItem, ITEM_ICON_CLASS } from "~/components/CommandPalette.logic";
import { useScreenshotModeStore } from "./screenshotModeStore";

export function screenshotModeCommandItem(gt: ReturnType<typeof useGT>): CommandPaletteActionItem {
  return {
    kind: "action",
    value: "action:screenshot-mode",
    searchTerms: ["screenshot", "privacy", "demo", "redact", "recording"],
    title: gt("Enter screenshot mode"),
    icon: <CameraIcon className={ITEM_ICON_CLASS} />,
    shortcutCommand: "screenshotMode.toggle",
    run: async () => {
      useScreenshotModeStore.setState({ active: true });
    },
  };
}
