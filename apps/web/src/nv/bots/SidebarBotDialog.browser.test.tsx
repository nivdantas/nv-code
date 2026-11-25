import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import appCss from "~/index.css?inline";
import { render } from "../../../test/render";
import { AppAtomRegistryProvider } from "~/rpc/atomRegistry";
import { useNvStore } from "~/nv/nvStore";
import { SidebarBotDialogHost, openSidebarBotDialog } from "./SidebarBotDialog";

function resetBotSettings(): Disposable {
  return {
    [Symbol.dispose]: () => useNvStore.setState({ sidebarBotSettingsByThreadKey: {} }),
  };
}

it("saves a bot's icon, color and brief, and queues the brief for the next message", async () => {
  using _settings = resetBotSettings();
  await using _screen = await render(
    <AppAtomRegistryProvider>
      <style>{appCss}</style>
      <SidebarBotDialogHost />
    </AppAtomRegistryProvider>,
  );
  openSidebarBotDialog({ threadKey: "local:deploy", title: "Deploy Watch" });

  const dialog = page.getByRole("dialog", { name: "Customize bot" });
  await expect.element(dialog).toBeVisible();
  await userEvent.click(page.getByRole("radio", { name: "Star" }));
  await userEvent.click(page.getByRole("radio", { name: "Purple" }));
  await userEvent.fill(page.getByRole("textbox", { name: "Brief" }), "Triage new issues daily.");
  await userEvent.click(page.getByRole("button", { name: "Save bot" }));

  await expect.element(dialog).not.toBeInTheDocument();
  expect(useNvStore.getState().sidebarBotSettingsByThreadKey["local:deploy"]).toEqual({
    shape: "star",
    color: "purple",
    brief: "Triage new issues daily.",
    briefPending: true,
  });
});

it("disables the color choice for icons with their own colors", async () => {
  using _settings = resetBotSettings();
  await using _screen = await render(
    <AppAtomRegistryProvider>
      <style>{appCss}</style>
      <SidebarBotDialogHost />
    </AppAtomRegistryProvider>,
  );
  openSidebarBotDialog({ threadKey: "local:ball", title: "Release Captain" });

  await userEvent.click(page.getByRole("radio", { name: "Football" }));
  await expect.element(page.getByRole("radio", { name: "Blue" })).toBeDisabled();
});
