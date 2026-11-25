import { cn } from "~/lib/utils";
import type { SidebarThreadStatus } from "~/components/Sidebar.logic";
import { type BotLook, type BotMood, botArt } from "./botArt";

// Recognize threads already marked by T3Plus, including the marker at either end of a title.
const BOT_MARKER = /^\[\[t3plus:bot:v1\]\](?:\s+|$)|\s+\[\[t3plus:bot:v1\]\]$/g;

export function botTitleWithoutMarker(title: string): string | null {
  const trimmed = title.trim();
  const unmarked = trimmed.replace(BOT_MARKER, "").trim();
  return unmarked === trimmed ? null : unmarked;
}

const STATUS_TONES = {
  approval: "bg-warning-foreground",
  input: "bg-warning-foreground",
  request: "bg-warning-foreground",
  preparing: "bg-info-foreground",
  working: "bg-info-foreground",
  waiting: "bg-muted-foreground",
  failed: "bg-error-foreground",
  limited: "bg-warning-foreground",
} satisfies Record<Exclude<SidebarThreadStatus, "ready">, string>;

const MOODS = {
  approval: "attention",
  input: "attention",
  request: "attention",
  preparing: "working",
  working: "working",
  waiting: "waiting",
  failed: "failed",
  limited: "idle",
  ready: "awake",
} satisfies Record<SidebarThreadStatus, BotMood>;

export function SidebarBotAvatar({
  title,
  status,
  look,
  compact,
}: {
  title: string;
  status: SidebarThreadStatus;
  look?: BotLook | undefined;
  compact?: boolean;
}) {
  const art = botArt(title, MOODS[status], look);
  return (
    <span
      aria-hidden
      data-bot-avatar
      className={cn("relative inline-block shrink-0", compact ? "size-7" : "size-8")}
    >
      <span
        className="absolute inset-0 bg-no-repeat [background-size:100%_100%] [image-rendering:pixelated]"
        style={{ backgroundColor: art.edge, backgroundImage: art.fill, clipPath: art.clip }}
      />
      {status === "ready" ? null : (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-sidebar",
            STATUS_TONES[status],
          )}
        />
      )}
    </span>
  );
}
