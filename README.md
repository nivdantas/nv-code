# Nightshift Code

Nightshift Code is an unofficial source fork of [T3 Code Nightly](https://github.com/pingdotgg/t3code). It is independently maintained with no affiliation to T3 Tools, Inc. The starting point is [Nightly v0.1.13-nightly.20261125.5245](https://github.com/pingdotgg/t3code/releases/tag/v0.1.13-nightly.20261125.5245).

The web and Electron workspace includes four features inspired by [T3Plus](https://github.com/alextyhwang/t3plus).

- **Usage widgets.** New threads show the available Codex and Claude weekly limits, pace and reset timing, plus recent token activity and reported spend. Open Usage from the cards for the full breakdown. The widgets use the connected environments and your existing permissions.
- **Bot rows.** Right-click a thread and choose **Show as bot thread** for an avatar tied to its live status. Titles with the T3Plus marker `[[t3plus:bot:v1]]` are recognized automatically.
- **Sidebar profiles.** Select **Add profile** above the thread list, name it, and choose its projects. Switch back with **All projects**. Profiles and bot presentation choices are saved in the local app client.
- **Screenshot mode.** Press **Alt+Shift+D** or choose **Enter screenshot mode** from the command palette. A separate view shows example names and messages. Use **Esc**, the same shortcut, or **Exit screenshot mode** to return to your workspace.

## Build a macOS installer

With Vite+, Rust, and the Xcode Command Line Tools installed, run these commands from the checkout.

```sh
vp i
vp run dist:desktop:dmg --arch arm64
```

For an Intel Mac, use `--arch x64` and install the `x86_64-apple-darwin` Rust target. Open the DMG in `release/`, drag **Nightshift Code** to Applications, and open the app with the **N3** icon. Nightshift uses its own browser profile and server data directory. Connect to an existing T3 environment if you want to see its projects and threads.

## Run from source

Install [Vite+](https://viteplus.dev/guide/) and run these commands from the checkout.

```sh
vp i
vp run dev --home-dir .t3/nightshift-dev --no-seed
```

Open the local pairing URL the development server prints. For the Electron client, use `vp run dev:desktop --home-dir .t3/nightshift-dev --no-seed`. See the [development guide](docs/operations/00_development.md) for provider setup and test commands.

Source code is available under the [MIT License](LICENSE). See the upstream [trademark policy](TRADEMARK.md) for use of T3 Code branding.
