# NV-CODE

NV-CODE is an unofficial source fork of [T3 Code Nightly](https://github.com/pingdotgg/t3code). It is independently maintained with no affiliation to T3 Tools, Inc. The starting point is [Nightly v0.1.13-nightly.20261125.5245](https://github.com/pingdotgg/t3code/releases/tag/v0.1.13-nightly.20261125.5245).

## Download

Get the latest macOS installer (Apple silicon) from [Releases](https://github.com/nivdantas/nv-code/releases). Open the DMG, drag **NV-CODE** to Applications, and open the app with the white **NV** icon. The build is not notarized, so the first time, right-click the app and choose **Open**.

## What NV-CODE adds

The web and desktop clients include these features, inspired by [T3Plus](https://github.com/alextyhwang/t3plus).

- **Usage widgets.** New threads show the available Codex and Claude weekly limits, pace and reset timing, plus recent token activity and reported spend. Open Usage from the cards for the full breakdown. The widgets use the connected environments and your existing permissions.
- **Bot rows.** Right-click a thread and choose **Show as bot thread** for a dithered avatar, its latest activity, and live status. Titles with the T3Plus marker `[[t3plus:bot:v1]]` are recognized automatically. Choose **Show as regular thread** to undo it.
- **Bot icons and briefs.** Right-click a bot and choose **Customize bot…** to pick one of eight icons (circle, square, hexagon, diamond, triangle, star, football, basketball) and a color. Write a brief: what the bot is for, what it should do, and anything it should always keep in mind. The brief goes out with your next message to that bot, and again after you change it.
- **Sidebar profiles.** Select **Add profile** above the thread list, name it, pick a dot color, and choose its projects. Switching profiles scopes the thread list and search to those projects. Switch back with **All projects**. Use the pencil to rename, recolor, or remove a profile.
- **Screenshot mode.** Press **Alt+Shift+D** or choose **Enter screenshot mode** from the command palette. A separate view shows example names and messages so you can share screenshots without exposing your work. Use **Esc**, the same shortcut, or **Exit screenshot mode** to return.
- **NV-CODE look.** The NV icon, the app name across the web and desktop apps, and a pixel-grain glow behind the new-thread composer.

Profiles, bot looks, and bot briefs are saved in the local app client, so they do not follow you to other devices.

## Build a macOS installer

With Vite+, Rust, and the Xcode Command Line Tools installed, run these commands from the checkout.

```sh
vp i
vp run dist:desktop:dmg --arch arm64
```

For an Intel Mac, use `--arch x64` and install the `x86_64-apple-darwin` Rust target. The DMG is written to `release/`. NV-CODE keeps the data directory and browser profile of earlier Nightshift builds, so an update keeps your settings. To see projects and threads on another T3 environment, connect to that environment.

## Run from source

Install [Vite+](https://viteplus.dev/guide/) and run these commands from the checkout.

```sh
vp i
vp run dev --home-dir .t3/nightshift-dev --no-seed
```

Open the local pairing URL the development server prints. For the Electron client, use `vp run dev:desktop --home-dir .t3/nightshift-dev --no-seed`. See the [development guide](docs/operations/00_development.md) for provider setup and test commands.

## Staying close to upstream

NV-CODE code lives in `apps/web/src/nv/`, and upstream files only carry small hooks into it, so upstream changes merge with few conflicts. [FORK.md](FORK.md) lists every touch point and the rebase steps, including how translations are regenerated.

## License

Source code is available under the [MIT License](LICENSE). See the upstream [trademark policy](TRADEMARK.md) for use of T3 Code branding. The bot artwork in `apps/web/src/nv/bots/botArt.ts` is adapted from T3Plus, Copyright 2026 Alex Wang, under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/), which does not allow commercial use of that file.
