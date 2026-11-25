# NV-CODE fork

NV-CODE is T3 Code Nightly with bot rows, sidebar profiles, usage widgets, screenshot mode and its own branding. Keep the fork thin: new behavior goes in `apps/web/src/nv/`, and upstream files get one-line hooks into it.

## Layout

| Path                          | Holds                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web/src/nv/nvStore.ts`  | Profiles and bot choices, persisted under `nv-code:ui-state:v1`. Upstream's `uiStateStore` stays stock. |
| `apps/web/src/nv/bots/`       | Bot art, avatar, customize dialog, brief, row and menu helpers                                          |
| `apps/web/src/nv/profiles/`   | Profile tabs, color choice, scope helpers                                                               |
| `apps/web/src/nv/usage/`      | Usage widgets under the draft composer                                                                  |
| `apps/web/src/nv/screenshot/` | Screenshot mode, its store and palette command                                                          |
| `apps/web/src/nv/nv.css`      | Fork styles, imported once from `index.css`                                                             |
| `apps/web/src/nv/brand.ts`    | `NV_APP_NAME`; the icon is `apps/web/public/nv-code-icon.png`                                           |
| `apps/web/src/nv/i18n/`       | NV-CODE translations, keyed by English source text                                                      |

## Upstream touch points

Web hooks, each a few lines: `Sidebar.tsx` (profile scope, bot menu, tabs, dialog host), `SidebarThreadRow.tsx` (bot row layout), `threadActionMenu.logic.ts`, `useComposerSend.ts` (brief), `ChatView.tsx` (glow, widgets), `CommandPalette.tsx`, `appInit.tsx`, `routes/__root.tsx`, `index.css`, `branding.ts`, `vite.config.ts`, `T3Wordmark.tsx` (re-exports the NV mark), `SidebarChrome.tsx`, `ui/standalone-page.tsx`, the `screenshotMode.toggle` keybinding in `packages/contracts`, `packages/shared` and `KeybindingsSettings.logic.ts`, and one profile test appended to `Sidebar.browser.test.tsx`.

Branding outside the web app: `apps/web/index.html`, `manifest.webmanifest`, `apps/desktop/src/app/Desktop{Assets,Environment,StatePaths,UserData}.ts`, the DMG backgrounds and `scripts/build-desktop-artifact.ts`. The `nightshift-code` app id, state folder and keychain name are kept on purpose, so existing installs keep their data.

## Rebasing on upstream

1. `git rebase <upstream>/main`. For `apps/web/src/i18n/translations/*.json`, take upstream's side.
2. In `apps/web`: `vp run i18n:generate`, then from the repo root `vp run i18n:nv` and `vp run i18n:check`.
3. `vp run typecheck` in `apps/web`, then `vp test run src/nv src/components/Sidebar.browser.test.tsx`.

New user-facing NV-CODE strings: translate them in `apps/web/src/nv/i18n/translations.json`, then run step 2.
