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
- **Tako Ink theme.** The default theme. A dithered blue tako lives on the ground of the chat's left gutter: it walks, runs, looks at you, jumps, eats an onigiri, drinks water and naps. The thread page gets a dim pixel-grain glow, the Context, Session and Weekly rows get more contrast and show which provider the limits belong to, and sidebar shelves and tabs are easier to spot. Code uses [Commit Mono](https://commitmono.com) when it is installed. Pick another theme in **Settings > Appearance**, and set text sizes in **Settings > Typography**.
- **NV-CODE look.** The NV icon, the app name across the web and desktop apps, and a pixel-grain glow behind the new-thread composer.

Profiles, bot looks, and bot briefs are saved in the local app client, so they do not follow you to other devices.

## Build a macOS installer

With Vite+, Rust, and the Xcode Command Line Tools installed, run these commands from the checkout.

```sh
vp i
vp run dist:desktop:dmg --arch arm64 --build-version 0.1.13-nightly.20261125.5258 --output-dir release/nv-code
```

Pass the upstream nightly the checkout is based on as `--build-version`; without it the build is versioned 0.1.12 on the stable channel. For an Intel Mac, use `--arch x64` and install the `x86_64-apple-darwin` Rust target. [FORK.md](FORK.md#releasing) has the full release steps.

The first launch moves data from earlier Nightshift builds to the NV-CODE folders and leaves a link at the old path, so saved projects keep working. It also copies the Keychain key that protects saved credentials, so macOS asks once for Keychain access. Because the app ID changed, macOS asks again for permissions such as screen recording and microphone. To see projects and threads on another T3 environment, connect to that environment.

## Run from source

Install [Vite+](https://viteplus.dev/guide/) and run these commands from the checkout.

```sh
vp i
vp run dev --home-dir .t3/nv-code-dev --no-seed
```

Open the local pairing URL the development server prints. For the Electron client, use `vp run dev:desktop --home-dir .t3/nv-code-dev --no-seed`. See the [development guide](docs/operations/00_development.md) for provider setup and test commands.

## Staying close to upstream

NV-CODE code lives in `apps/web/src/nv/` and `apps/desktop/src/nv/`, and upstream files only carry small hooks into it, so upstream nightlies merge with few conflicts. [FORK.md](FORK.md) lists every touch point and the update steps, and `vp run nv:touchpoints` checks that the list is complete.

## License

Source code is available under the [MIT License](LICENSE). See the upstream [trademark policy](TRADEMARK.md) for use of T3 Code branding. The bot artwork in `apps/web/src/nv/bots/botArt.ts` is adapted from T3Plus, Copyright 2026 Alex Wang, under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/), which does not allow commercial use of that file.
