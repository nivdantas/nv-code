import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { T, useGT } from "gt-react";
import { useId, useState } from "react";

import { cn } from "~/lib/utils";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { SIDEBAR_BOT_BRIEF_MAX_CHARS, useNvStore } from "../nvStore";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { BOT_SHAPES, type BotColor, type BotShape, botArt, botShapeHasOwnColors } from "./botArt";
import { SidebarBotAvatar } from "./SidebarBotAvatar";
import { SidebarColorChoice } from "../profiles/SidebarColorChoice";

interface BotDialogTarget {
  readonly threadKey: string;
  readonly title: string;
}

// The thread menu closes as its command runs, so the sidebar renders the dialog once.
const botDialogTargetAtom = Atom.make<BotDialogTarget | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("sidebar:bot-dialog-target"),
);

export function openSidebarBotDialog(target: BotDialogTarget): void {
  appAtomRegistry.set(botDialogTargetAtom, target);
}

export function SidebarBotDialogHost() {
  const target = useAtomValue(botDialogTargetAtom);
  if (target === null) return null;
  return (
    <SidebarBotDialog
      key={target.threadKey}
      target={target}
      onClose={() => appAtomRegistry.set(botDialogTargetAtom, null)}
    />
  );
}

function SidebarBotDialog({ target, onClose }: { target: BotDialogTarget; onClose: () => void }) {
  const gt = useGT();
  const saved = useNvStore((state) => state.sidebarBotSettingsByThreadKey[target.threadKey]);
  const saveSettings = useNvStore((state) => state.saveSidebarBotSettings);
  const defaults = botArt(target.title, "awake");
  const [shape, setShape] = useState<BotShape>(saved?.shape ?? defaults.shape);
  const [color, setColor] = useState<BotColor>(saved?.color ?? defaults.color);
  const [brief, setBrief] = useState(saved?.brief ?? "");
  const briefHelpId = useId();
  const ownColors = botShapeHasOwnColors(shape);
  const shapeLabels: Record<BotShape, string> = {
    circle: gt("Circle"),
    square: gt("Square"),
    hexagon: gt("Hexagon"),
    diamond: gt("Diamond"),
    triangle: gt("Triangle"),
    star: gt("Star"),
    football: gt("Football"),
    basketball: gt("Basketball"),
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            saveSettings(target.threadKey, { shape, color, brief });
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <T>Customize bot</T>
            </DialogTitle>
            <DialogDescription>{target.title}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pb-4">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-sm font-medium">
                <T>Icon</T>
              </legend>
              <div role="radiogroup" aria-label={gt("Icon")} className="flex flex-wrap gap-1.5">
                {BOT_SHAPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={shape === option}
                    aria-label={shapeLabels[option]}
                    onClick={() => setShape(option)}
                    className={cn(
                      "flex size-11 items-center justify-center rounded-lg border border-transparent hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                      shape === option && "border-border bg-muted",
                    )}
                  >
                    <SidebarBotAvatar
                      title={target.title}
                      status="ready"
                      look={{ shape: option, color }}
                    />
                  </button>
                ))}
              </div>
            </fieldset>
            <SidebarColorChoice
              legend={ownColors ? gt("Color (this icon has its own colors)") : gt("Color")}
              value={color}
              onChange={setColor}
              disabled={ownColors}
            />
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <span aria-hidden>
                <T>Brief</T>
              </span>
              <Textarea
                aria-label={gt("Brief")}
                aria-describedby={briefHelpId}
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                maxLength={SIDEBAR_BOT_BRIEF_MAX_CHARS}
                rows={5}
                placeholder={gt(
                  "What this bot is for, what it should do, and anything it should always keep in mind.",
                )}
              />
              <span id={briefHelpId} className="text-xs font-normal text-muted-foreground">
                <T>
                  Sent with your next message to this bot, and again after you change it. Saved on
                  this device.
                </T>
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit">
              <T>Save bot</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
