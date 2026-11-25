import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import appCss from "../index.css?inline";
import { render } from "../../test/render";
import { ScreenshotModeHost } from "./ScreenshotMode";

vi.mock(import("../state/server"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const { compileResolvedKeybindingsConfig } = await import("@t3tools/shared/keybindings");
  const keybindings = compileResolvedKeybindingsConfig([
    { key: "alt+shift+d", command: "screenshotMode.toggle" },
  ]);
  return { ...(await original()), primaryServerKeybindingsAtom: Atom.make(keybindings) };
});

it("puts the screenshot view above the live workspace and restores it on exit", async () => {
  await using screen = await render(
    <>
      <style>{appCss}</style>
      <input aria-label="Private draft" defaultValue="Internal launch plan" />
      <ScreenshotModeHost />
    </>,
  );
  const draft = screen.getByRole("textbox", { name: "Private draft" });
  await userEvent.click(draft);
  await userEvent.keyboard("{Alt>}{Shift>}d{/Shift}{/Alt}");

  const mode = page.getByRole("dialog", { name: "Screenshot mode" });
  await expect.element(mode).toBeVisible();
  expect(mode.element().matches(":modal")).toBe(true);
  expect(document.elementFromPoint(20, 20)?.closest("dialog")).toBe(mode.element());
  expect(mode.element().textContent).not.toContain("Internal launch plan");

  await userEvent.keyboard("{Escape}");
  await expect.element(mode).not.toBeInTheDocument();
  await expect.element(draft).toHaveValue("Internal launch plan");
});
