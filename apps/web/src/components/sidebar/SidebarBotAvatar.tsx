import { cn } from "~/lib/utils";
import type { SidebarThreadStatus } from "../Sidebar.logic";

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
  ready: "bg-success-foreground",
} satisfies Record<SidebarThreadStatus, string>;

export function SidebarBotAvatar({ status }: { status: SidebarThreadStatus }) {
  return (
    <span
      aria-hidden
      className="relative inline-grid size-5 shrink-0 place-items-center rounded-md bg-primary/12 text-primary"
    >
      <span className="absolute top-0.5 h-0.75 w-px bg-current" />
      <span className="mt-0.5 flex h-2 w-3 items-center justify-evenly border border-current">
        <span className="size-0.5 bg-current" />
        <span className="size-0.5 bg-current" />
      </span>
      <span
        className={cn("absolute right-0 bottom-0 size-1.5 rounded-full", STATUS_TONES[status])}
      />
    </span>
  );
}
