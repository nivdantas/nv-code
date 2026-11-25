import { useGT } from "gt-react";

import { cn } from "~/lib/utils";
import type { SidebarProfile } from "../nvStore";
import { BOT_COLOR_NAMES, BOT_COLORS, type BotColor } from "../bots/botArt";

const PROFILE_COLORS = BOT_COLOR_NAMES.filter((color) => color !== "gray");

export function profileColor(profile: SidebarProfile): BotColor {
  if (profile.color) return profile.color;
  let hash = 2166136261;
  for (const ch of profile.id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return PROFILE_COLORS[(hash >>> 0) % PROFILE_COLORS.length]!;
}

export function ColorDot({ color, className }: { color: BotColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: BOT_COLORS[color][1] }}
    />
  );
}

function useColorLabels(): Record<BotColor, string> {
  const gt = useGT();
  return {
    blue: gt("Blue"),
    purple: gt("Purple"),
    green: gt("Green"),
    teal: gt("Teal"),
    pink: gt("Pink"),
    red: gt("Red"),
    yellow: gt("Yellow"),
    orange: gt("Orange"),
    gray: gt("Gray"),
  };
}

export function SidebarColorChoice({
  legend,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  value: BotColor;
  onChange: (color: BotColor) => void;
  disabled?: boolean;
}) {
  const labels = useColorLabels();
  return (
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-50">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-1.5">
        {BOT_COLOR_NAMES.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value === color}
            aria-label={labels[color]}
            onClick={() => onChange(color)}
            className={cn(
              "size-6 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
              value === color && "ring-2 ring-foreground ring-inset",
            )}
            style={{ backgroundColor: BOT_COLORS[color][1] }}
          />
        ))}
      </div>
    </fieldset>
  );
}
