# Darts Room for Windows

The Windows build runs the game UI from a local Next.js server bundled with Electron. It opens in fullscreen kiosk mode, stays above ordinary windows, and bundles the Barlow Condensed font so the game screen can load without an internet connection.

## Build

On Windows, run:

```sh
npm ci
npm run desktop:dist:win
```

The installer is created under `dist/windows/`.

Pushing changes to `codex/render-global` also starts the **Build Windows app** GitHub Actions workflow. Download the `darts-room-windows-x64` artifact from that workflow run to get the installer.

## Offline support

Local games, practice, the on-screen board, and Bluetooth board input run locally. Online matchmaking, live video, Google sign-in, and cloud rating sync still need an internet connection. The desktop app gets its public Supabase auth configuration from the deployed website, opens Google sign-in in the default browser, and returns to the app through the `dartsroom://auth/callback` protocol.

For Google sign-in, add `dartsroom://auth/callback` to Supabase **Authentication → URL Configuration → Redirect URLs**. The Windows installer registers the `dartsroom://` protocol. Google OAuth still uses the existing Supabase callback URL configured in Google Cloud.

The first Bluetooth connection may show a Windows Bluetooth permission or pairing prompt. Allow Darts Room to use Bluetooth and select the dartboard in the device picker.

Press `Alt+F4` to close the app. Windows-level shortcuts such as `Alt+Tab` are controlled by Windows; use Windows kiosk configuration if the device must be locked to this app.
