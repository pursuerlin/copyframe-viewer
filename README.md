# Copyframe Viewer

Copyframe Viewer is a portable desktop app for opening Copyframe interactive and complete offline webpage packages. It starts a local-only service on your computer; users do not need Python, Node.js, or a server.

## Download

Download the latest macOS or Windows build from [Releases](../../releases/latest).

- Apple Silicon Mac: choose the `arm64-mac.zip` file.
- Intel Mac: choose the `x64-mac.zip` file.
- Windows: choose the `x64-win.exe` portable app.

Extract the downloaded archive, open Copyframe Viewer, and select the unpacked offline webpage folder containing `index.html`.

You can also drag the unpacked folder or its `index.html` directly into the Viewer window.

## First open: macOS and Windows

Viewer is currently a portable app without Apple notarization or Windows code signing. Download it only from this official release page.

- **macOS**: if macOS cannot verify the app, in Finder right-click **Copyframe Viewer.app** → **Open**, then confirm once. If it still says the app is damaged, run this in Terminal (change the path if you moved the app):

  ```sh
  xattr -dr com.apple.quarantine "$HOME/Downloads/Copyframe Viewer.app"
  ```

- **Windows**: if SmartScreen appears, first confirm that this is the official Copyframe Viewer release page, then choose **More info** → **Run anyway**. Do not run it if the source is uncertain.

Code signing and Apple notarization remove these system prompts. Until then, the above steps keep the choice explicit and do not require Python, Node.js, or a server.

## Privacy policy

The Copyframe browser extension privacy policy is available at [privacy/index.html](./privacy/index.html).

## Develop

`npm install`, then run `npm run viewer:dev`. Release maintainers can create a `v*` tag to build macOS and Windows artifacts automatically.
