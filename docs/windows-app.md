# Darts Room for Windows

The Windows build runs the game UI from a local Next.js server bundled with Electron. It opens fullscreen and bundles the Barlow Condensed font so the game screen can load without an internet connection.

## Build

On Windows, run:

```sh
npm ci
npm run desktop:dist:win
```

The installer is created under `dist/windows/`.

Pushing changes to `codex/render-global` also starts the **Build Windows app** GitHub Actions workflow. Download the `darts-room-windows-x64` artifact from that workflow run to get the installer.

## Offline support

Local games, practice, the on-screen board, and Bluetooth board input run locally. Online matchmaking, live video, Google sign-in, and cloud rating sync still need an internet connection. Google sign-in or cloud features also need the corresponding service configuration.

The first Bluetooth connection may show a Windows Bluetooth permission or pairing prompt. Allow Darts Room to use Bluetooth and select the dartboard in the device picker.

Use `F11` or `Alt+Enter` to toggle fullscreen. Press `Alt+F4` to close the app.
